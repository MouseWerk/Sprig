import { useThemeColor } from '@/hooks/use-theme-color';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from '@/utils/AppHaptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { CheckCircle2, Edit3, FileWarning, HelpCircle, Sprout, Trophy, Undo2, Volume2, XCircle, Zap } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashcardSwipe } from '../components/FlashcardSwipe';
import { FocusPlant } from '../components/FocusPlant';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { FlashcardData, parseFlashcardsCsv } from '../utils/CsvParser';
import { xpForGrade } from '../utils/Levels';
import { scheduleStreakReminder } from '../utils/Notifications';
import { applySwipeResult, getCachedData, getDecks, restoreCardSRS, setCachedData, SRSCardData, updateCardInDeck, updateDeckProgress, updateUserStats } from '../utils/Storage';
import { nextTodayEntry, peekNextTodayEntry } from '../utils/TodayPlan';

interface UndoEntry {
    originalIndex: number;
    grade: number;
    prevSrs?: SRSCardData;
    prevLearned: number[];
    prevUnsure: number[];
}

interface FlashcardWithIndex extends FlashcardData {
    originalIndex: number;
    reversed?: boolean; // show the answer side first (per-deck study direction)
}

export default function SwipeScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { showToast } = useToast();
    const { id, uri, name, mode: initialMode, cards: drillParam, today } = useLocalSearchParams<{ id: string, uri: string, name?: string, mode?: string, cards?: string, today?: string }>();

    // Drill mode: a comma-separated list of card indices (e.g. from the
    // "Often Confused" section) restricts the session to exactly those cards.
    const drillSet = useMemo(() => {
        if (!drillParam) return null;
        const ids = drillParam.split(',').map(s => parseInt(s, 10)).filter(n => Number.isInteger(n) && n >= 0);
        return ids.length > 0 ? new Set(ids) : null;
    }, [drillParam]);

    // Part of a chained cross-deck "Today" session?
    const isTodaySession = today === '1';
    const nextToday = isTodaySession ? peekNextTodayEntry() : null;

    const handleNextTodayDeck = () => {
        const next = nextTodayEntry();
        if (!next) return;
        router.replace({
            pathname: '/swipe',
            params: {
                id: next.deckId,
                uri: next.uri,
                name: next.deckName,
                mode: 'all',
                cards: next.cardIndices.join(','),
                today: '1',
            },
        });
    };

    const [cards, setCards] = useState<FlashcardWithIndex[]>([]);
    const [shuffledCards, setShuffledCards] = useState<FlashcardWithIndex[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [sessionReviewed, setSessionReviewed] = useState(0);
    const [sessionCorrect, setSessionCorrect] = useState(0);
    const [sessionHard, setSessionHard] = useState(0);
    const [sessionAgain, setSessionAgain] = useState(0);
    const [sessionXp, setSessionXp] = useState(0);
    const [sessionComplete, setSessionComplete] = useState(false);
    const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
    const [isFlipped, setIsFlipped] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [learnedIndices, setLearnedIndices] = useState<number[]>([]);
    const [unsureIndices, setUnsureIndices] = useState<number[]>([]);
    const [srsData, setSrsData] = useState<Record<number, SRSCardData>>({});
    const [isHighlightMode, setIsHighlightMode] = useState(false);
    const [studyMode, setStudyMode] = useState<'all' | 'due'>(initialMode === 'all' ? 'all' : 'due');
    const [focusMode, setFocusMode] = useState(true);

    // Live SRS mirror (ref, not state) so undo and repeat passes stay
    // accurate without re-filtering the session queue mid-session.
    const liveSrsRef = useRef<Record<number, SRSCardData>>({});
    const lastActionRef = useRef(Date.now());
    // Ensures we (re)schedule the streak reminder only once per study session
    const reminderScheduledRef = useRef(false);
    // Serialized background persistence chain - swipes advance the UI
    // immediately while writes complete in order behind the scenes.
    const pendingPersistRef = useRef<Promise<void>>(Promise.resolve());

    const backgroundColor = useThemeColor({}, 'background');
    const textColor = useThemeColor({}, 'text');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const primaryColor = useThemeColor({}, 'primary');
    const secondaryBg = useThemeColor({}, 'secondary');

    useEffect(() => {
        async function loadData() {
            if (!uri || !id) {
                setError('No file or deck ID provided');
                setLoading(false);
                return;
            }

            try {
                // Load existing mastery
                const decks = await getDecks();
                const currentDeck = decks.find(d => d.id === id);
                if (currentDeck) {
                    setLearnedIndices(currentDeck.learnedIndices || []);
                    setUnsureIndices(currentDeck.unsureIndices || []);
                    setSrsData(currentDeck.srsData || {});
                    liveSrsRef.current = { ...(currentDeck.srsData || {}) };
                }

                // Try cache first for speed
                let parsedCards = await getCachedData<FlashcardData[]>(id);
                if (!parsedCards) {
                    parsedCards = await parseFlashcardsCsv(uri);
                    if (parsedCards.length > 0) {
                        await setCachedData(id, parsedCards);
                    }
                }

                if (parsedCards && parsedCards.length === 0) {
                    setError('This CSV file seems to be empty or formatted incorrectly. Expected: Question, Answer.');
                } else if (parsedCards) {
                    // Enrich with original index + per-deck study direction
                    const direction = currentDeck?.studyDirection || 'normal';
                    const enrichedCards: FlashcardWithIndex[] = parsedCards.map((c, i) => ({
                        ...c,
                        originalIndex: i,
                        reversed: direction === 'reversed' || (direction === 'mixed' && Math.random() < 0.5),
                    }));
                    setCards(enrichedCards);
                    setShuffledCards(shuffleArray(enrichedCards));
                } else {
                    setError('Failed to load cards.');
                }
            } catch (e) {
                console.error(e);
                setError('Failed to read the flashcard file. Ensure it is a valid CSV.');
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [uri, id]);

    // Shuffle function
    const shuffleArray = <T,>(array: T[]): T[] => {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    };



    // Filter cards based on study mode. srsData is only loaded once on mount
    // and never refreshed mid-session, so this list stays stable while
    // swiping - otherwise graded cards would drop out of the due list and
    // shift the queue under the advancing index, skipping cards.
    // Drill mode overrides everything: study exactly the requested cards.
    const filteredCards = drillSet
        ? shuffledCards.filter(c => drillSet.has(c.originalIndex))
        : studyMode === 'due'
            ? shuffledCards.filter(c => {
                const data = srsData[c.originalIndex];
                if (!data) return true; // New cards are always due
                return new Date(data.nextReview) <= new Date();
            })
            : shuffledCards;

    const currentCard = filteredCards[currentIndex];
    const accuracy = sessionReviewed > 0 ? Math.round((sessionCorrect / sessionReviewed) * 100) : 0;

    // What the user actually sees: reversed cards swap the two sides
    const displayQuestion = currentCard ? (currentCard.reversed ? currentCard.answer : currentCard.question) : '';
    const displayAnswer = currentCard ? (currentCard.reversed ? currentCard.question : currentCard.answer) : '';

    const handleHighlightChange = async (isFront: boolean, newText: string) => {
        if (!currentCard || !id) return;

        const originalIndex = currentCard.originalIndex;

        // 1. Update local state - map the displayed side back to the
        // stored orientation for reversed cards
        const editsQuestion = currentCard.reversed ? !isFront : isFront;
        const updatedCard = { ...currentCard };
        if (editsQuestion) updatedCard.question = newText;
        else updatedCard.answer = newText;

        // Update shuffled list (the one being viewed)
        const newShuffled = [...shuffledCards];
        const currentShuffledIdx = shuffledCards.findIndex(c => c.originalIndex === originalIndex);
        if (currentShuffledIdx !== -1) {
            newShuffled[currentShuffledIdx] = updatedCard;
            setShuffledCards(newShuffled);
        }

        // 2. Persist to disk (only the card fields, not session metadata)
        await updateCardInDeck(id, originalIndex, { question: updatedCard.question, answer: updatedCard.answer });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const handleSwipe = (grade: number) => {
        if (!currentCard || !id) return;
        const originalIndex = currentCard.originalIndex;

        // Snapshot state for undo before mutating anything
        setUndoStack(stack => [...stack, {
            originalIndex,
            grade,
            prevSrs: liveSrsRef.current[originalIndex],
            prevLearned: [...learnedIndices],
            prevUnsure: [...unsureIndices],
        }]);

        // Mastery updates (legacy learned/unsure lists)
        let updatedLearned = [...learnedIndices];
        let updatedUnsure = [...unsureIndices];

        if (grade >= 4) {
            if (!updatedLearned.includes(originalIndex)) {
                updatedLearned.push(originalIndex);
                updatedUnsure = updatedUnsure.filter(i => i !== originalIndex);
            }
        } else if (grade === 3) {
            if (!updatedUnsure.includes(originalIndex)) {
                updatedUnsure.push(originalIndex);
                updatedLearned = updatedLearned.filter(i => i !== originalIndex);
            }
        } else {
            updatedLearned = updatedLearned.filter(i => i !== originalIndex);
            updatedUnsure = updatedUnsure.filter(i => i !== originalIndex);
        }

        setLearnedIndices(updatedLearned);
        setUnsureIndices(updatedUnsure);

        // Session + lifetime stats
        if (grade >= 4) setSessionCorrect(c => c + 1);
        else if (grade === 3) setSessionHard(c => c + 1);
        else setSessionAgain(c => c + 1);
        setSessionReviewed(s => s + 1);
        setSessionXp(x => x + xpForGrade(grade));

        const now = Date.now();
        const deltaSeconds = Math.min(Math.round((now - lastActionRef.current) / 1000), 60);
        lastActionRef.current = now;

        Speech.stop();
        setIsFlipped(false);

        // Advance the UI immediately - persistence happens in the background
        if (currentIndex + 1 < filteredCards.length) {
            setCurrentIndex(i => i + 1);
        } else {
            setSessionComplete(true);
        }

        // One read + one write per swipe, serialized so writes never race
        pendingPersistRef.current = pendingPersistRef.current
            .then(() => applySwipeResult(id, originalIndex, grade, updatedLearned, updatedUnsure))
            .then(srs => { liveSrsRef.current = srs; })
            .catch(e => console.error('Error persisting swipe:', e));
        if (!reminderScheduledRef.current) {
            reminderScheduledRef.current = true;
            scheduleStreakReminder();
        }

        updateUserStats(1, deltaSeconds, grade)
            .then(result => {
                let delay = 0;
                if (result.freezeUsed) {
                    setTimeout(() => {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        showToast({ message: 'Streak freeze used — your streak is safe!', type: 'info' });
                    }, delay);
                    delay += 600;
                }
                if (result.freezeEarned) {
                    setTimeout(() => {
                        showToast({ message: 'You earned a streak freeze!', type: 'success' });
                    }, delay);
                    delay += 600;
                }
                if (result.leveledUp) {
                    setTimeout(() => {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        showToast({ message: `Level ${result.newLevel}! You're now a ${result.newRank}`, type: 'success' });
                    }, delay);
                    delay += 600;
                }
                result.newAchievements.forEach(a => {
                    setTimeout(() => {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        showToast({ message: `Achievement unlocked: ${a.title}`, type: 'success' });
                    }, delay);
                    delay += 600;
                });
            })
            .catch(() => { });
    };

    const handleUndo = async () => {
        if (undoStack.length === 0 || !id) return;
        const last = undoStack[undoStack.length - 1];

        // Wait for in-flight swipe writes so the restore isn't overwritten
        await pendingPersistRef.current;

        // Restore SRS + mastery to their pre-swipe values
        await restoreCardSRS(id, last.originalIndex, last.prevSrs);
        if (last.prevSrs) {
            liveSrsRef.current = { ...liveSrsRef.current, [last.originalIndex]: last.prevSrs };
        } else {
            const copy = { ...liveSrsRef.current };
            delete copy[last.originalIndex];
            liveSrsRef.current = copy;
        }
        await updateDeckProgress(id, last.prevLearned, last.prevUnsure);
        setLearnedIndices(last.prevLearned);
        setUnsureIndices(last.prevUnsure);

        // Roll back session counters and position
        if (last.grade >= 4) setSessionCorrect(c => Math.max(0, c - 1));
        else if (last.grade === 3) setSessionHard(c => Math.max(0, c - 1));
        else setSessionAgain(c => Math.max(0, c - 1));
        setSessionReviewed(s => Math.max(0, s - 1));
        setSessionXp(x => Math.max(0, x - xpForGrade(last.grade)));

        setUndoStack(stack => stack.slice(0, -1));
        setSessionComplete(false);
        setCurrentIndex(i => Math.max(0, i - 1));
        setIsFlipped(false);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    };

    const handleRestartSession = () => {
        setShuffledCards(shuffleArray(cards));
        setCurrentIndex(0);
        setSessionReviewed(0);
        setSessionCorrect(0);
        setSessionHard(0);
        setSessionAgain(0);
        setSessionXp(0);
        setUndoStack([]);
        setSessionComplete(false);
        setIsFlipped(false);
        lastActionRef.current = Date.now();
    };

    const speakCurrentCard = () => {
        if (!currentCard) return;
        const raw = isFlipped ? displayAnswer : displayQuestion;
        // Strip markdown/highlight/image syntax so TTS reads clean text
        const text = raw
            .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
            .replace(/==([^=]+)==/g, '$1')
            .replace(/<[^>]+>/g, ' ')
            .replace(/[*_~#`$]/g, '')
            .trim();
        if (!text) return;
        Speech.stop();
        Speech.speak(text);
    };

    // Stop any speech when leaving the screen
    useEffect(() => {
        return () => {
            Speech.stop();
        };
    }, []);

    // Remember the focus-mode preference between sessions
    useEffect(() => {
        AsyncStorage.getItem('csvtudyapp_focus_mode').then(v => {
            if (v === 'off') setFocusMode(false);
        });
    }, []);

    const toggleFocusMode = () => {
        setFocusMode(prev => {
            const next = !prev;
            AsyncStorage.setItem('csvtudyapp_focus_mode', next ? 'on' : 'off').catch(() => { });
            return next;
        });
    };

    if (loading) {
        return (
            <View style={[styles.container, { backgroundColor }]}>
                <ActivityIndicator size="large" color={primaryColor} />
                <Text style={[styles.loadingText, { color: mutedForeground }]}>Loading your deck...</Text>
            </View>
        );
    }

    if (error) {
        return (
            <View style={[styles.container, { backgroundColor, paddingHorizontal: 24 }]}>
                <Stack.Screen options={{ title: 'Error' }} />
                <View style={[styles.errorCard, { backgroundColor: secondaryBg }]}>
                    <FileWarning size={48} color="#ef4444" strokeWidth={2.5} />
                    <Text style={[styles.errorTitle, { color: textColor }]}>Import Error</Text>
                    <Text style={[styles.errorSub, { color: mutedForeground }]}>{error}</Text>
                    <Button
                        title="Go Back"
                        onPress={() => router.back()}
                        style={styles.errorButton}
                    />
                </View>
            </View>
        );
    }

    if (sessionComplete) {
        return (
            <View style={[styles.container, { backgroundColor, paddingBottom: insets.bottom }]}>
                <Stack.Screen options={{ title: name || 'Flashcards' }} />
                <View style={styles.resultsContent}>
                    <View style={[styles.trophyContainer, { backgroundColor: '#facc1520', padding: 24, borderRadius: 100 }]}>
                        <Trophy size={64} color="#eab308" strokeWidth={1.5} />
                    </View>
                    <Text style={[styles.resultTitle, { color: textColor }]}>Session Complete!</Text>
                    <View style={[styles.scoreSummary, { backgroundColor: secondaryBg }]}>
                        <Text style={[styles.resultScore, { color: primaryColor }]}>{accuracy}</Text>
                        <Text style={[styles.scoreDivider, { color: mutedForeground }]}>%</Text>
                        <Text style={[styles.resultTotal, { color: mutedForeground }]}>correct</Text>
                    </View>
                    {sessionXp > 0 && (
                        <View style={[styles.xpBadge, { backgroundColor: primaryColor + '18' }]}>
                            <Zap size={18} color={primaryColor} strokeWidth={2.5} fill={primaryColor} />
                            <Text style={[styles.xpBadgeText, { color: primaryColor }]}>+{sessionXp} XP earned</Text>
                        </View>
                    )}
                    <View style={styles.resultBreakdown}>
                        <View style={styles.breakdownItem}>
                            <CheckCircle2 size={20} color="#22c55e" strokeWidth={2.5} />
                            <Text style={[styles.breakdownValue, { color: textColor }]}>{sessionCorrect}</Text>
                            <Text style={[styles.breakdownLabel, { color: mutedForeground }]}>Good</Text>
                        </View>
                        <View style={styles.breakdownItem}>
                            <HelpCircle size={20} color="#eab308" strokeWidth={2.5} />
                            <Text style={[styles.breakdownValue, { color: textColor }]}>{sessionHard}</Text>
                            <Text style={[styles.breakdownLabel, { color: mutedForeground }]}>Hard</Text>
                        </View>
                        <View style={styles.breakdownItem}>
                            <XCircle size={20} color="#ef4444" strokeWidth={2.5} />
                            <Text style={[styles.breakdownValue, { color: textColor }]}>{sessionAgain}</Text>
                            <Text style={[styles.breakdownLabel, { color: mutedForeground }]}>Again</Text>
                        </View>
                    </View>
                    <Text style={[styles.resultSub, { color: mutedForeground }]}>
                        You reviewed {sessionReviewed} card{sessionReviewed === 1 ? '' : 's'} this session. Keep it up!
                    </Text>
                    <View style={[styles.buttonGroup, { gap: 12 }]}>
                        {isTodaySession && nextToday ? (
                            <>
                                <Button
                                    title={`Next: ${nextToday.deckName} (${nextToday.cardIndices.length})`}
                                    onPress={handleNextTodayDeck}
                                    style={styles.actionButton}
                                />
                                <Button title="Stop for Today" variant="secondary" onPress={() => router.back()} style={styles.actionButton} />
                            </>
                        ) : (
                            <>
                                <Button title="Study Again" onPress={handleRestartSession} style={styles.actionButton} />
                                <Button title="Done" variant="secondary" onPress={() => router.back()} style={styles.actionButton} />
                            </>
                        )}
                    </View>
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor, paddingBottom: insets.bottom }]}>
            <Stack.Screen
                options={{
                    title: isTodaySession ? `Today · ${name || 'Flashcards'}` : drillSet ? 'Drill: Tricky Cards' : (name || 'Flashcards'),
                    headerRight: () => (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 8 }}>
                            <TouchableOpacity
                                onPress={toggleFocusMode}
                                style={[
                                    styles.iconBtn,
                                    focusMode && { backgroundColor: primaryColor + '20' }
                                ]}
                                accessibilityLabel={focusMode ? 'Disable focus mode' : 'Enable focus mode'}
                                accessibilityRole="button"
                            >
                                <Sprout size={20} color={focusMode ? primaryColor : textColor} strokeWidth={focusMode ? 2.5 : 2} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={speakCurrentCard}
                                style={styles.iconBtn}
                                disabled={!currentCard}
                                accessibilityLabel="Read card aloud"
                                accessibilityRole="button"
                            >
                                <Volume2 size={20} color={currentCard ? textColor : mutedForeground} strokeWidth={2} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleUndo}
                                style={styles.iconBtn}
                                disabled={undoStack.length === 0}
                                accessibilityLabel="Undo last swipe"
                                accessibilityRole="button"
                            >
                                <Undo2 size={20} color={undoStack.length > 0 ? textColor : mutedForeground} strokeWidth={2} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => setIsHighlightMode(!isHighlightMode)}
                                style={[
                                    styles.iconBtn,
                                    isHighlightMode && { backgroundColor: primaryColor + '20' }
                                ]}
                                accessibilityLabel={isHighlightMode ? 'Exit highlight mode' : 'Enter highlight mode'}
                                accessibilityRole="button"
                            >
                                <Edit3 size={20} color={isHighlightMode ? primaryColor : textColor} strokeWidth={isHighlightMode ? 3 : 2} />
                            </TouchableOpacity>
                            <View style={[styles.chip, { backgroundColor: secondaryBg }]}>
                                <Text style={[styles.scoreText, { color: textColor }]}>{sessionReviewed}</Text>
                            </View>
                        </View>
                    )
                }}
            />

            {focusMode && <FocusPlant active={filteredCards.length > 0} />}

            <View style={styles.swipeContainer}>
                {filteredCards.length === 0 ? (
                    <View style={styles.emptySession}>
                        <CheckCircle2 size={64} color="#22c55e" strokeWidth={1.5} />
                        <Text style={[styles.emptyTitle, { color: textColor }]}>{"You're all caught up!"}</Text>
                        <Text style={[styles.emptySub, { color: mutedForeground }]}>No cards due for review. Come back later or study all cards.</Text>
                        <Button title="Study All Cards" onPress={() => setStudyMode('all')} style={{ marginTop: 20 }} />
                    </View>
                ) : currentCard && (
                    <FlashcardSwipe
                        key={`${currentIndex}-${studyMode}`}
                        question={displayQuestion}
                        answer={displayAnswer}
                        frontLabel={currentCard.reversed ? 'Answer' : 'Question'}
                        backLabel={currentCard.reversed ? 'Question' : 'Answer'}
                        onSwipeLeft={() => handleSwipe(0)}
                        onSwipeRight={() => handleSwipe(5)}
                        onSwipeTop={() => handleSwipe(3)}
                        highlightMode={isHighlightMode}
                        onHighlightChange={handleHighlightChange}
                        onFlip={setIsFlipped}
                    />
                )}
            </View>

            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 24) }]}>
                <View style={styles.hintContainer}>
                    <View style={styles.hintItem}>
                        <View style={[styles.hintIcon, { borderColor: '#ef4444' }]}>
                            <XCircle size={22} color="#ef4444" strokeWidth={2.5} />
                        </View>
                        <Text style={[styles.footerText, { color: mutedForeground }]}>Again</Text>
                        <Text style={styles.intervalHint}>1d</Text>
                    </View>
                    <View style={styles.hintItem}>
                        <View style={[styles.hintIcon, { borderColor: '#eab308' }]}>
                            <HelpCircle size={22} color="#eab308" strokeWidth={2.5} />
                        </View>
                        <Text style={[styles.footerText, { color: mutedForeground }]}>Hard</Text>
                        <Text style={styles.intervalHint}>
                            {currentCard && srsData[currentCard.originalIndex] ? '2d' : '1d'}
                        </Text>
                    </View>
                    <View style={styles.hintItem}>
                        <View style={[styles.hintIcon, { borderColor: '#22c55e' }]}>
                            <CheckCircle2 size={22} color="#22c55e" strokeWidth={2.5} />
                        </View>
                        <Text style={[styles.footerText, { color: mutedForeground }]}>Good</Text>
                        <Text style={styles.intervalHint}>
                            {currentCard && srsData[currentCard.originalIndex] ? `${srsData[currentCard.originalIndex].interval * 2}d` : '4d'}
                        </Text>
                    </View>
                </View>

                {/* Progress Bar */}
                <View style={[styles.progressBarContainer, { backgroundColor: secondaryBg }]}>
                    <View style={[styles.progressSegment, { flex: Math.max(cards.length - learnedIndices.length - unsureIndices.length, 0.1), backgroundColor: '#ef4444' }]} />
                    <View style={[styles.progressSegment, { flex: unsureIndices.length || 0, backgroundColor: '#eab308' }]} />
                    <View style={[styles.progressSegment, { flex: learnedIndices.length || 0, backgroundColor: '#22c55e' }]} />
                </View>
            </View>
        </View >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingText: {
        marginTop: 16,
        fontSize: 15,
        fontWeight: '500',
    },
    swipeContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
    },
    chip: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
        marginRight: 16,
    },
    iconBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scoreText: {
        fontWeight: '700',
        fontSize: 12,
    },
    footer: {
        width: '100%',
        alignItems: 'center',
    },
    hintContainer: {
        flexDirection: 'row',
        gap: 48,
        alignItems: 'center',
    },
    hintItem: {
        alignItems: 'center',
        gap: 8,
    },
    hintIcon: {
        padding: 8,
        borderRadius: 100,
    },
    countLabel: {
        fontSize: 9,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    dueBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
        marginLeft: 8,
    },
    dueText: {
        color: '#fff',
        fontSize: 9,
        fontWeight: '900',
    },
    footerText: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    progressBarContainer: {
        flexDirection: 'row',
        height: 6,
        width: '80%',
        borderRadius: 3,
        overflow: 'hidden',
        marginTop: 32,
    },
    progressSegment: {
        height: '100%',
    },
    resultsContent: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        width: '100%',
    },
    trophyContainer: {
        marginBottom: 20,
    },
    resultTitle: {
        fontSize: 28,
        fontWeight: '900',
        letterSpacing: -0.5,
        textAlign: 'center',
    },
    scoreSummary: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 8,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 24,
        marginTop: 32,
        marginBottom: 16,
    },
    xpBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 16,
        marginBottom: 24,
    },
    xpBadgeText: {
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: -0.2,
    },
    resultScore: {
        fontSize: 64,
        fontWeight: '900',
    },
    scoreDivider: {
        fontSize: 18,
        fontWeight: '600',
    },
    resultTotal: {
        fontSize: 32,
        fontWeight: '700',
        opacity: 0.8,
    },
    resultSub: {
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 48,
        lineHeight: 24,
        maxWidth: 280,
    },
    buttonGroup: {
        width: '100%',
        maxWidth: 280,
    },
    resultBreakdown: {
        flexDirection: 'row',
        gap: 40,
        marginBottom: 8,
    },
    breakdownItem: {
        alignItems: 'center',
        gap: 4,
    },
    breakdownValue: {
        fontSize: 22,
        fontWeight: '900',
    },
    breakdownLabel: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    actionButton: {
        height: 52,
        width: '100%',
    },
    errorCard: {
        padding: 32,
        borderRadius: 24,
        alignItems: 'center',
        width: '100%',
        maxWidth: 320,
    },
    errorTitle: {
        fontSize: 22,
        fontWeight: '800',
        marginTop: 16,
        marginBottom: 8,
    },
    errorSub: {
        fontSize: 15,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 24,
    },
    errorButton: {
        width: '100%',
        height: 48,
    },
    emptySession: {
        alignItems: 'center',
        padding: 40,
    },
    emptyTitle: {
        fontSize: 24,
        fontWeight: '900',
        marginTop: 20,
        marginBottom: 8,
    },
    emptySub: {
        fontSize: 16,
        textAlign: 'center',
        lineHeight: 22,
        opacity: 0.6,
    },
    intervalHint: {
        fontSize: 10,
        fontWeight: '800',
        color: '#8b5cf6',
        marginTop: -4,
    }
});
