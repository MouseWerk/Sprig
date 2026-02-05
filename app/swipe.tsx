import { useThemeColor } from '@/hooks/use-theme-color';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2, Edit3, FileWarning, HelpCircle, XCircle } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashcardSwipe } from '../components/FlashcardSwipe';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { FlashcardData, parseFlashcardsCsv } from '../utils/CsvParser';
import { getCachedData, getDecks, setCachedData, SRSCardData, updateCardInDeck, updateCardSRS, updateDeckProgress } from '../utils/Storage';

interface FlashcardWithIndex extends FlashcardData {
    originalIndex: number;
}

export default function SwipeScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { width: SCREEN_WIDTH } = useWindowDimensions();
    const { id, uri, name, mode: initialMode } = useLocalSearchParams<{ id: string, uri: string, name?: string, mode?: string }>();
    const { showToast } = useToast();

    const [cards, setCards] = useState<FlashcardWithIndex[]>([]);
    const [shuffledCards, setShuffledCards] = useState<FlashcardWithIndex[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [score, setScore] = useState(0);
    const [sessionReviewed, setSessionReviewed] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [learnedIndices, setLearnedIndices] = useState<number[]>([]);
    const [unsureIndices, setUnsureIndices] = useState<number[]>([]);
    const [srsData, setSrsData] = useState<Record<number, SRSCardData>>({});
    const [isHighlightMode, setIsHighlightMode] = useState(false);
    const [studyMode, setStudyMode] = useState<'all' | 'due'>(initialMode === 'all' ? 'all' : 'due');

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
                    // Enrich with original index
                    const enrichedCards: FlashcardWithIndex[] = parsedCards.map((c, i) => ({ ...c, originalIndex: i }));
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



    // Filter cards based on study mode
    const filteredCards = studyMode === 'due'
        ? shuffledCards.filter(c => {
            const data = srsData[c.originalIndex];
            if (!data) return true; // New cards are always due
            return new Date(data.nextReview) <= new Date();
        })
        : shuffledCards;

    const handleHighlightChange = async (isFront: boolean, newText: string) => {
        if (!currentCard || !id) return;

        const originalIndex = currentCard.originalIndex;

        // 1. Update local state
        const updatedCard = { ...currentCard };
        if (isFront) updatedCard.question = newText;
        else updatedCard.answer = newText;

        // Update shuffled list (the one being viewed)
        const newShuffled = [...shuffledCards];
        const currentShuffledIdx = shuffledCards.findIndex(c => c.originalIndex === originalIndex);
        if (currentShuffledIdx !== -1) {
            newShuffled[currentShuffledIdx] = updatedCard;
            setShuffledCards(newShuffled);
        }

        // 2. Persist to disk
        await updateCardInDeck(id, originalIndex, updatedCard);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const handleSwipe = async (grade: number) => {
        const originalIndex = currentCard.originalIndex;

        // 1. Update SRS metadata
        await updateCardSRS(id!, originalIndex, grade);

        // 2. Local state updates for visual feedback (Mastery legacy)
        let updatedLearned = [...learnedIndices];
        let updatedUnsure = [...unsureIndices];

        if (grade >= 4) {
            setScore(s => s + 1);
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

        // PERSIST BOTH SRS AND MASTERY
        await updateDeckProgress(id!, updatedLearned, updatedUnsure);

        // Update local SRS snapshot for UI
        const decks = await getDecks();
        const currentDeck = decks.find(d => d.id === id);
        if (currentDeck) setSrsData(currentDeck.srsData || {});

        setSessionReviewed(s => s + 1);

        if (currentIndex + 1 < filteredCards.length) {
            setCurrentIndex(i => i + 1);
        } else {
            if (studyMode === 'due') {
                showToast({ message: 'Review session finished! 🎉', type: 'success' });
                router.back();
            } else {
                setShuffledCards(shuffleArray(cards));
                setCurrentIndex(0);
            }
        }
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

    const currentCard = filteredCards[currentIndex];

    return (
        <View style={[styles.container, { backgroundColor, paddingBottom: insets.bottom }]}>
            <Stack.Screen
                options={{
                    title: name || 'Flashcards',
                    headerRight: () => (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginRight: 8 }}>
                            <TouchableOpacity
                                onPress={() => setIsHighlightMode(!isHighlightMode)}
                                style={[
                                    styles.iconBtn,
                                    isHighlightMode && { backgroundColor: primaryColor + '20' }
                                ]}
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

            <View style={styles.swipeContainer}>
                {filteredCards.length === 0 ? (
                    <View style={styles.emptySession}>
                        <CheckCircle2 size={64} color="#22c55e" strokeWidth={1.5} />
                        <Text style={[styles.emptyTitle, { color: textColor }]}>You're all caught up!</Text>
                        <Text style={[styles.emptySub, { color: mutedForeground }]}>No cards due for review. Come back later or study all cards.</Text>
                        <Button title="Study All Cards" onPress={() => setStudyMode('all')} style={{ marginTop: 20 }} />
                    </View>
                ) : currentCard && (
                    <FlashcardSwipe
                        key={`${currentIndex}-${studyMode}`}
                        question={currentCard.question}
                        answer={currentCard.answer}
                        onSwipeLeft={() => handleSwipe(0)}
                        onSwipeRight={() => handleSwipe(5)}
                        onSwipeTop={() => handleSwipe(3)}
                        highlightMode={isHighlightMode}
                        onHighlightChange={handleHighlightChange}
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
        marginVertical: 32,
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
