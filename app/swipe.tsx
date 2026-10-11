import { TranslationKey } from '@/constants/translations';
import { useLanguage } from '@/contexts/LanguageContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from '@/utils/AppHaptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { CheckCircle2, Droplet, Edit3, FileWarning, HelpCircle, Sprout, Sun, Trophy, Undo2, Volume2, XCircle, Zap } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashcardSwipe } from '../components/FlashcardSwipe';
import { FocusPlant } from '../components/FocusPlant';
import { GrowingPlant } from '../components/GrowingPlant';
import { detectStageUps, STAGE_LABEL_KEYS, StageUp } from '../utils/Grove';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { FlashcardData, parseFlashcardsCsv } from '../utils/CsvParser';
import { rankLabelKey, xpForGrade } from '../utils/Levels';
import { scheduleStreakReminder } from '../utils/Notifications';
import { refreshAllPinnedWidgets } from '../utils/PinnedDeck';
import { applySwipeResult, calculateSM2, getCachedData, isCardDue, getDecks, restoreCardSRS, revertUserStats, saveReflection, setCachedData, SRSCardData, updateCardInDeck, updateDeckProgress, updateUserStats } from '../utils/Storage';
import { migrateKey } from '../utils/StorageMigration';
import { getPrefsSync, subscribePrefs } from '../utils/Preferences';
import { nextTodayEntry, peekNextTodayEntry } from '../utils/TodayPlan';

interface UndoEntry {
    swipeId: number;
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
    const { t } = useLanguage();
    const { id, uri, name, mode: initialMode, cards: drillParam, today, water } = useLocalSearchParams<{ id: string, uri: string, name?: string, mode?: string, cards?: string, today?: string, water?: string }>();

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

    // "Done" / "Stop for today" / the error screen's back button. A session
    // opened straight from the home-screen widget on a cold start (see
    // app/study.tsx) has nothing beneath it in the stack, so a plain
    // router.back() would silently do nothing — fall back to Home, whose
    // focus effect also pushes the fresh due count out to the widgets.
    const leaveSession = () => {
        if (router.canGoBack()) router.back();
        else router.replace('/');
    };

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
    const [cardTextScale, setCardTextScale] = useState(getPrefsSync().cardTextScale);
    useEffect(() => subscribePrefs(prefs => setCardTextScale(prefs.cardTextScale)), []);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [sessionReviewed, setSessionReviewed] = useState(0);
    const [sessionCorrect, setSessionCorrect] = useState(0);
    const [sessionHard, setSessionHard] = useState(0);
    const [sessionAgain, setSessionAgain] = useState(0);
    const [sessionXp, setSessionXp] = useState(0);
    const [sessionDew, setSessionDew] = useState(0);
    const [sessionBoosted, setSessionBoosted] = useState(false);
    const [stageUp, setStageUp] = useState<StageUp | null>(null);
    const [sessionComplete, setSessionComplete] = useState(false);
    const [reflectionNote, setReflectionNote] = useState('');
    const [reflectionSaved, setReflectionSaved] = useState(false);
    const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
    const [isFlipped, setIsFlipped] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<TranslationKey | null>(null);
    const [learnedIndices, setLearnedIndices] = useState<number[]>([]);
    const [unsureIndices, setUnsureIndices] = useState<number[]>([]);
    const [srsData, setSrsData] = useState<Record<number, SRSCardData>>({});
    const [isHighlightMode, setIsHighlightMode] = useState(false);
    const [studyMode, setStudyMode] = useState<'all' | 'due'>(initialMode === 'all' ? 'all' : 'due');
    const [focusMode, setFocusMode] = useState(false);

    // Live SRS mirror (ref, not state) so undo and repeat passes stay
    // accurate without re-filtering the session queue mid-session.
    const liveSrsRef = useRef<Record<number, SRSCardData>>({});
    const sessionStartRef = useRef(new Date());
    const lastActionRef = useRef(Date.now());
    // Ensures we (re)schedule the streak reminder only once per study session
    const reminderScheduledRef = useRef(false);
    // Serialized background persistence chain - swipes advance the UI
    // immediately while writes complete in order behind the scenes.
    const pendingPersistRef = useRef<Promise<void>>(Promise.resolve());
    // Lifetime-stats writes are serialized separately from the SRS chain, and
    // what each swipe actually added is remembered so undo can take exactly
    // that back out (a sunshine boost doubles the XP, so it isn't derivable).
    const pendingStatsRef = useRef<Promise<void>>(Promise.resolve());
    const swipeSeqRef = useRef(0);
    // Mirrors undoStack, but updated in the same tick as the change: an undo
    // tapped before the re-render must see the swipe it is undoing (and a
    // second undo must not see the entry the first one just took back).
    const undoStackRef = useRef<UndoEntry[]>([]);
    const setUndoEntries = (entries: UndoEntry[]) => {
        undoStackRef.current = entries;
        setUndoStack(entries);
    };
    // One grade per card shown: a second swipe or accessibility action that
    // lands before the re-render would otherwise grade the same card twice
    // and skip the next one. The epoch moves on undo/restart, when the same
    // position legitimately gets graded again.
    const gradedKeyRef = useRef<string | null>(null);
    const gradeEpochRef = useRef(0);
    const undoingRef = useRef(false);
    const filteredCardsRef = useRef<FlashcardWithIndex[]>([]);
    const statsBySwipeRef = useRef<Map<number, { seconds: number; xpGained: number }>>(new Map());

    const backgroundColor = useThemeColor({}, 'background');
    const textColor = useThemeColor({}, 'text');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const primaryColor = useThemeColor({}, 'primary');
    const secondaryBg = useThemeColor({}, 'secondary');
    const borderColor = useThemeColor({}, 'border');

    useEffect(() => {
        async function loadData() {
            if (!uri || !id) {
                setError('swipeNoDeckProvided');
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
                    setError('swipeEmptyCsvError');
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
                    setError('swipeFailedToLoad');
                }
            } catch (e) {
                console.error(e);
                setError('swipeFailedToRead');
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
    // and never refreshed mid-session, and "due" is judged against the time
    // the session opened, so this list stays stable while swiping - otherwise
    // graded cards would drop out of the due list (or a card falling due at
    // midnight would drop in) and shift the queue under the advancing index,
    // skipping cards. Drill mode overrides everything: study exactly the
    // requested cards.
    const filteredCards = drillSet
        ? shuffledCards.filter(c => drillSet.has(c.originalIndex))
        : studyMode === 'due'
            ? shuffledCards.filter(c => isCardDue(srsData[c.originalIndex], sessionStartRef.current))
            : shuffledCards;

    filteredCardsRef.current = filteredCards;

    const currentCard = filteredCards[currentIndex];
    const accuracy = sessionReviewed > 0 ? Math.round((sessionCorrect / sessionReviewed) * 100) : 0;

    // What the user actually sees: reversed cards swap the two sides
    // The interval each grade would schedule, from the same SM-2 step the
    // swipe applies. The hints used to be fixed guesses ("Good: 4d" for a
    // new card that actually comes back tomorrow).
    const intervalHint = (grade: number): string => {
        const prev = currentCard ? (liveSrsRef.current[currentCard.originalIndex] ?? srsData[currentCard.originalIndex]) : undefined;
        const next = calculateSM2(grade, prev?.interval ?? 0, prev?.repetition ?? 0, prev?.easeFactor ?? 2.5);
        return t('swipeIntervalDays').replace('{n}', String(next.interval));
    };

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

        // Also update the base list "Study Again" reshuffles from, so the
        // edit survives a session restart instead of reverting.
        setCards(prev => {
            const idx = prev.findIndex(c => c.originalIndex === originalIndex);
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = updatedCard;
            return next;
        });

        // 2. Persist to disk (only the card fields, not session metadata)
        await updateCardInDeck(id, originalIndex, { question: updatedCard.question, answer: updatedCard.answer });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const handleSwipe = (grade: number) => {
        if (!currentCard || !id || undoingRef.current) return;
        const gradedKey = `${gradeEpochRef.current}:${studyMode}:${currentIndex}`;
        if (gradedKeyRef.current === gradedKey) return;
        gradedKeyRef.current = gradedKey;
        const originalIndex = currentCard.originalIndex;
        const swipeId = ++swipeSeqRef.current;

        // Snapshot state for undo before mutating anything
        setUndoEntries([...undoStackRef.current, {
            swipeId,
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

        statsBySwipeRef.current.set(swipeId, { seconds: deltaSeconds, xpGained: 0 });
        pendingStatsRef.current = pendingStatsRef.current
            .then(() => updateUserStats(1, deltaSeconds, grade))
            .then(result => {
                statsBySwipeRef.current.set(swipeId, { seconds: deltaSeconds, xpGained: result.xpGained });
                if (result.dewEarned > 0) setSessionDew(d => d + result.dewEarned);
                if (result.boostActive) {
                    setSessionBoosted(true);
                    // The sync path already counted base XP; add the doubled half
                    setSessionXp(x => x + xpForGrade(grade));
                }
                let delay = 0;
                if (result.freezeUsed) {
                    setTimeout(() => {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        showToast({ message: t('swipeFreezeUsed'), type: 'info' });
                    }, delay);
                    delay += 600;
                }
                if (result.freezeEarned) {
                    setTimeout(() => {
                        showToast({ message: t('swipeFreezeEarned'), type: 'success' });
                    }, delay);
                    delay += 600;
                }
                if (result.leveledUp) {
                    setTimeout(() => {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        showToast({ message: t('focusLevelUp').replace('{level}', String(result.newLevel)).replace('{rank}', t(rankLabelKey(result.newRank))), type: 'success' });
                    }, delay);
                    delay += 600;
                }
                result.newAchievements.forEach(a => {
                    setTimeout(() => {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        showToast({ message: t('focusAchievementUnlocked').replace('{title}', t(a.titleKey)), type: 'success' });
                    }, delay);
                    delay += 600;
                });
            })
            .catch(() => { });
    };

    const handleUndo = async () => {
        const stack = undoStackRef.current;
        if (stack.length === 0 || !id || undoingRef.current) return;
        undoingRef.current = true;
        try {
            await undoLast(stack);
        } finally {
            undoingRef.current = false;
        }
    };

    const undoLast = async (stack: UndoEntry[]) => {
        if (!id) return;
        const last = stack[stack.length - 1];
        // Taken off right away so a second tap undoes the swipe before this one
        setUndoEntries(stack.slice(0, -1));
        gradeEpochRef.current++;

        // Wait for in-flight swipe writes so the restore isn't overwritten
        await pendingPersistRef.current;
        await pendingStatsRef.current;

        // Take this review back out of the lifetime totals too, otherwise the
        // daily goal, heatmap and XP keep counting a card the user undid.
        const written = statsBySwipeRef.current.get(last.swipeId);
        statsBySwipeRef.current.delete(last.swipeId);
        if (written) {
            await revertUserStats(1, written.seconds, written.xpGained).catch(() => { });
        }

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
        // Use what was actually awarded — a sunshine boost doubled it.
        const sessionXpBack = written?.xpGained || xpForGrade(last.grade);
        setSessionXp(x => Math.max(0, x - sessionXpBack));

        setSessionComplete(false);
        // Go to the card that was just undone, wherever it sits in the queue.
        // Stepping back by one only works when the swipe advanced the index —
        // the swipe that ends a session does not, so that card would be
        // skipped and an already-graded one shown instead.
        const undoneAt = filteredCardsRef.current.findIndex(c => c.originalIndex === last.originalIndex);
        setCurrentIndex(undoneAt >= 0 ? undoneAt : i => Math.max(0, i - 1));
        setIsFlipped(false);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    };

    const handleRestartSession = () => {
        handleSaveReflection();
        setShuffledCards(shuffleArray(cards));
        setCurrentIndex(0);
        setSessionReviewed(0);
        setSessionCorrect(0);
        setSessionHard(0);
        setSessionAgain(0);
        setSessionXp(0);
        setSessionDew(0);
        setSessionBoosted(false);
        setStageUp(null);
        setUndoEntries([]);
        gradeEpochRef.current++;
        statsBySwipeRef.current.clear();
        setSessionComplete(false);
        setIsFlipped(false);
        setReflectionNote('');
        setReflectionSaved(false);
        lastActionRef.current = Date.now();
    };

    const handleSaveReflection = () => {
        const note = reflectionNote.trim();
        if (!note || reflectionSaved || !id) return;
        setReflectionSaved(true);
        saveReflection({
            deckId: id,
            deckName: name || t('swipeFlashcards'),
            note,
            cardsReviewed: sessionReviewed,
            accuracy,
        }).catch(() => setReflectionSaved(false));
    };

    // Safety net for the hardware back button / swipe-back gesture: those can
    // unmount this screen without the reflection field's onBlur ever firing,
    // silently dropping the note. Mirror the latest values into a ref every
    // render so the unmount cleanup (registered once) can still flush them.
    const reflectionFlushRef = useRef({ note: '', saved: false, deckId: id, deckName: name, reviewed: sessionReviewed, accuracy });
    reflectionFlushRef.current = { note: reflectionNote, saved: reflectionSaved, deckId: id, deckName: name, reviewed: sessionReviewed, accuracy };
    useEffect(() => {
        return () => {
            const { note, saved, deckId, deckName, reviewed, accuracy: acc } = reflectionFlushRef.current;
            const trimmed = note.trim();
            if (trimmed && !saved && deckId) {
                saveReflection({ deckId, deckName: deckName || 'Flashcards', note: trimmed, cardsReviewed: reviewed, accuracy: acc }).catch(() => { });
            }
        };
    }, []);

    // When the session ends, check whether this deck's grove plant grew a
    // stage — wait for the last swipe's SRS write to land first.
    useEffect(() => {
        if (!sessionComplete || !id) return;
        let cancelled = false;
        (async () => {
            try {
                await pendingPersistRef.current;
                // The due count just changed — push it to any home-screen
                // widgets now rather than waiting for the next visit to Home.
                refreshAllPinnedWidgets().catch(() => { });
                const ups = await detectStageUps();
                if (cancelled) return;
                const mine = ups.find(u => u.deckId === id);
                if (mine) setStageUp(mine);
            } catch { }
        })();
        return () => { cancelled = true; };
    }, [sessionComplete, id]);

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
        migrateKey('csvtudyapp_focus_mode', 'sprig_focus_mode').then(v => {
            if (v === 'off') setFocusMode(false);
        });
    }, []);

    const toggleFocusMode = () => {
        setFocusMode(prev => {
            const next = !prev;
            AsyncStorage.setItem('sprig_focus_mode', next ? 'on' : 'off').catch(() => { });
            return next;
        });
    };

    if (loading) {
        return (
            <View style={[styles.container, { backgroundColor }]}>
                <ActivityIndicator size="large" color={primaryColor} />
                <Text style={[styles.loadingText, { color: mutedForeground }]}>{t('swipeLoadingDeck')}</Text>
            </View>
        );
    }

    if (error) {
        return (
            <View style={[styles.container, { backgroundColor, paddingHorizontal: 24 }]}>
                <Stack.Screen options={{ title: t('error') }} />
                <View style={[styles.errorCard, { backgroundColor: secondaryBg }]}>
                    <FileWarning size={48} color="#ef4444" strokeWidth={2.5} />
                    <Text style={[styles.errorTitle, { color: textColor }]}>{t('swipeImportError')}</Text>
                    <Text style={[styles.errorSub, { color: mutedForeground }]}>{t(error)}</Text>
                    <Button
                        title={t('swipeGoBack')}
                        onPress={leaveSession}
                        style={styles.errorButton}
                    />
                </View>
            </View>
        );
    }

    if (sessionComplete) {
        return (
            <View style={[styles.container, { backgroundColor, paddingBottom: insets.bottom }]}>
                <Stack.Screen options={{ title: name || t('swipeFlashcards') }} />
                <View style={styles.resultsContent}>
                    <View style={[styles.trophyContainer, { backgroundColor: '#facc1520', padding: 24, borderRadius: 100 }]}>
                        <Trophy size={64} color="#eab308" strokeWidth={1.5} />
                    </View>
                    <Text style={[styles.resultTitle, { color: textColor }]}>{t('swipeSessionComplete')}</Text>
                    <View style={[styles.scoreSummary, { backgroundColor: secondaryBg }]}>
                        <Text style={[styles.resultScore, { color: primaryColor }]}>{accuracy}</Text>
                        <Text style={[styles.scoreDivider, { color: mutedForeground }]}>%</Text>
                        <Text style={[styles.resultTotal, { color: mutedForeground }]}>{t('swipeCorrect')}</Text>
                    </View>
                    {(sessionXp > 0 || sessionDew > 0 || sessionBoosted) && (
                        <View style={styles.earnRow}>
                            {sessionXp > 0 && (
                                <View style={[styles.xpBadge, { backgroundColor: primaryColor + '18' }]}>
                                    <Zap size={18} color={primaryColor} strokeWidth={2.5} fill={primaryColor} />
                                    <Text style={[styles.xpBadgeText, { color: primaryColor }]}>+{sessionXp} XP</Text>
                                </View>
                            )}
                            {sessionDew > 0 && (
                                <View style={[styles.xpBadge, { backgroundColor: primaryColor + '18' }]}>
                                    <Droplet size={18} color={primaryColor} strokeWidth={2.5} />
                                    <Text style={[styles.xpBadgeText, { color: primaryColor }]}>{t('swipeDewEarned').replace('{n}', String(sessionDew))}</Text>
                                </View>
                            )}
                            {sessionBoosted && (
                                <View style={[styles.xpBadge, { backgroundColor: '#eab30820' }]}>
                                    <Sun size={18} color="#eab308" strokeWidth={2.5} />
                                    <Text style={[styles.xpBadgeText, { color: '#eab308' }]}>{t('swipeSunshineBadge')}</Text>
                                </View>
                            )}
                        </View>
                    )}
                    {stageUp && (
                        <View style={[styles.stageUpCard, { backgroundColor: secondaryBg }]}>
                            <GrowingPlant
                                progress={stageUp.growth}
                                size={72}
                                color={primaryColor}
                                soilColor={borderColor}
                                species={stageUp.species}
                                sway
                            />
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.stageUpTitle, { color: textColor }]}>{t('swipePlantGrew')}</Text>
                                <Text style={[styles.stageUpSub, { color: mutedForeground }]}>
                                    {t('swipeNowA').replace('{name}', stageUp.deckName).replace('{stage}', t(STAGE_LABEL_KEYS[stageUp.stage]))}
                                </Text>
                            </View>
                        </View>
                    )}
                    <View style={styles.resultBreakdown}>
                        <View style={styles.breakdownItem}>
                            <CheckCircle2 size={20} color="#22c55e" strokeWidth={2.5} />
                            <Text style={[styles.breakdownValue, { color: textColor }]}>{sessionCorrect}</Text>
                            <Text style={[styles.breakdownLabel, { color: mutedForeground }]}>{t('swipeGood')}</Text>
                        </View>
                        <View style={styles.breakdownItem}>
                            <HelpCircle size={20} color="#eab308" strokeWidth={2.5} />
                            <Text style={[styles.breakdownValue, { color: textColor }]}>{sessionHard}</Text>
                            <Text style={[styles.breakdownLabel, { color: mutedForeground }]}>{t('swipeHard')}</Text>
                        </View>
                        <View style={styles.breakdownItem}>
                            <XCircle size={20} color="#ef4444" strokeWidth={2.5} />
                            <Text style={[styles.breakdownValue, { color: textColor }]}>{sessionAgain}</Text>
                            <Text style={[styles.breakdownLabel, { color: mutedForeground }]}>{t('swipeAgain')}</Text>
                        </View>
                    </View>
                    <Text style={[styles.resultSub, { color: mutedForeground }]}>
                        {t(sessionReviewed === 1 ? 'swipeReviewedOne' : 'swipeReviewedMany').replace('{n}', String(sessionReviewed))}
                    </Text>
                    <View style={[styles.reflectionCard, { backgroundColor: secondaryBg }]}>
                        <Text style={[styles.reflectionLabel, { color: mutedForeground }]}>
                            {reflectionSaved ? t('swipeReflectionSaved') : t('swipeReflectionPrompt')}
                        </Text>
                        <TextInput
                            style={[styles.reflectionInput, { color: textColor }]}
                            value={reflectionNote}
                            onChangeText={(text) => { setReflectionNote(text); setReflectionSaved(false); }}
                            onBlur={handleSaveReflection}
                            onSubmitEditing={handleSaveReflection}
                            placeholder={t('swipeReflectionPlaceholder')}
                            placeholderTextColor={mutedForeground}
                            selectionColor={primaryColor}
                            returnKeyType="done"
                        />
                    </View>
                    <View style={[styles.buttonGroup, { gap: 12 }]}>
                        {isTodaySession && nextToday ? (
                            <>
                                <Button
                                    title={t('swipeNext').replace('{name}', nextToday.deckName).replace('{n}', String(nextToday.cardIndices.length))}
                                    onPress={() => { handleSaveReflection(); handleNextTodayDeck(); }}
                                    style={styles.actionButton}
                                />
                                <Button title={t('swipeStopForToday')} variant="secondary" onPress={() => { handleSaveReflection(); leaveSession(); }} style={styles.actionButton} />
                            </>
                        ) : (
                            <>
                                <Button title={t('swipeStudyAgain')} onPress={handleRestartSession} style={styles.actionButton} />
                                <Button title={t('swipeDone')} variant="secondary" onPress={() => { handleSaveReflection(); leaveSession(); }} style={styles.actionButton} />
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
                    title: isTodaySession
                        ? t('swipeTodayTitle').replace('{name}', name || t('swipeFlashcards'))
                        : water === '1'
                            ? t('swipeWateringTitle').replace('{name}', name || t('swipeFlashcards'))
                            : drillSet ? t('swipeDrillTricky') : (name || t('swipeFlashcards')),
                    headerRight: () => (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 8 }}>
                            <TouchableOpacity
                                onPress={toggleFocusMode}
                                style={[
                                    styles.iconBtn,
                                    focusMode && { backgroundColor: primaryColor + '20' }
                                ]}
                                accessibilityLabel={t(focusMode ? 'a11yFocusModeOff' : 'a11yFocusModeOn')}
                                accessibilityRole="button"
                            >
                                <Sprout size={20} color={focusMode ? primaryColor : textColor} strokeWidth={focusMode ? 2.5 : 2} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={speakCurrentCard}
                                style={styles.iconBtn}
                                disabled={!currentCard}
                                accessibilityLabel={t('a11yReadCardAloud')}
                                accessibilityRole="button"
                            >
                                <Volume2 size={20} color={currentCard ? textColor : mutedForeground} strokeWidth={2} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleUndo}
                                style={styles.iconBtn}
                                disabled={undoStack.length === 0}
                                accessibilityLabel={t('a11yUndoLastSwipe')}
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
                                accessibilityLabel={t(isHighlightMode ? 'a11yHighlightModeOff' : 'a11yHighlightModeOn')}
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
                        <Text style={[styles.emptyTitle, { color: textColor }]}>{t('swipeAllCaughtUp')}</Text>
                        <Text style={[styles.emptySub, { color: mutedForeground }]}>{t('swipeNoCardsDue')}</Text>
                        <Button title={t('swipeStudyAllCards')} onPress={() => setStudyMode('all')} style={{ marginTop: 20 }} />
                    </View>
                ) : currentCard && (
                    <FlashcardSwipe
                        key={`${currentIndex}-${studyMode}`}
                        question={displayQuestion}
                        answer={displayAnswer}
                        frontLabel={currentCard.reversed ? t('swipeAnswer') : t('swipeQuestion')}
                        backLabel={currentCard.reversed ? t('swipeQuestion') : t('swipeAnswer')}
                        reversed={currentCard.reversed}
                        onSwipeLeft={() => handleSwipe(0)}
                        onSwipeRight={() => handleSwipe(5)}
                        onSwipeTop={() => handleSwipe(3)}
                        highlightMode={isHighlightMode}
                        onHighlightChange={handleHighlightChange}
                        fontScale={cardTextScale}
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
                        <Text style={[styles.footerText, { color: mutedForeground }]}>{t('swipeAgain')}</Text>
                        <Text style={[styles.intervalHint, { color: mutedForeground }]}>{intervalHint(0)}</Text>
                    </View>
                    <View style={styles.hintItem}>
                        <View style={[styles.hintIcon, { borderColor: '#eab308' }]}>
                            <HelpCircle size={22} color="#eab308" strokeWidth={2.5} />
                        </View>
                        <Text style={[styles.footerText, { color: mutedForeground }]}>{t('swipeHard')}</Text>
                        <Text style={[styles.intervalHint, { color: mutedForeground }]}>{intervalHint(3)}</Text>
                    </View>
                    <View style={styles.hintItem}>
                        <View style={[styles.hintIcon, { borderColor: '#22c55e' }]}>
                            <CheckCircle2 size={22} color="#22c55e" strokeWidth={2.5} />
                        </View>
                        <Text style={[styles.footerText, { color: mutedForeground }]}>{t('swipeGood')}</Text>
                        <Text style={[styles.intervalHint, { color: mutedForeground }]}>{intervalHint(5)}</Text>
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
    reflectionCard: {
        width: '100%',
        borderRadius: 20,
        padding: 16,
        marginBottom: 20,
    },
    reflectionLabel: {
        fontSize: 12,
        fontWeight: '700',
        marginBottom: 6,
    },
    reflectionInput: {
        fontSize: 15,
        fontWeight: '500',
        padding: 0,
    },
    earnRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 24,
        paddingHorizontal: 16,
    },
    xpBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 16,
    },
    stageUpCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: 20,
        padding: 14,
        marginBottom: 24,
        marginHorizontal: 24,
        alignSelf: 'stretch',
    },
    stageUpTitle: {
        fontSize: 15,
        fontWeight: '900',
        letterSpacing: -0.2,
    },
    stageUpSub: {
        fontSize: 13,
        fontWeight: '600',
        marginTop: 2,
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
        marginTop: -4,
    }
});
