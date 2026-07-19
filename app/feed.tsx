import { useThemeColor } from '@/hooks/use-theme-color';
import { FlashcardData, parseFlashcardsCsv } from '@/utils/CsvParser';
import { getCachedData, setCachedData, updateCardInDeck, updateUserStats } from '@/utils/Storage';
import * as Haptics from '@/utils/AppHaptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronsDown, Edit3, Eye, EyeOff, FileWarning, Shuffle, Sprout } from 'lucide-react-native';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View, ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FocusPlant } from '../components/FocusPlant';
import { HighlightableText } from '../components/HighlightableText';
import MarkdownRenderer from '../components/MarkdownRenderer';
import { Button } from '../components/ui/Button';

// TikTok-style study feed: every card fills the screen, question and answer
// together, and you swipe up/down to move through the deck. Great for casual
// read-through learning before switching to active recall modes.

// Cards keep their index in the deck file so highlight edits can be
// persisted even after shuffling.
type FeedCard = FlashcardData & { originalIndex: number };

function shuffleCards(arr: FeedCard[]): FeedCard[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export default function FeedScreen() {
    const { id, uri, name } = useLocalSearchParams<{ id: string; uri: string; name?: string }>();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const listRef = useRef<FlatList<FeedCard>>(null);

    const [cards, setCards] = useState<FeedCard[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [pageHeight, setPageHeight] = useState(0);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [hideAnswers, setHideAnswers] = useState(false);
    const [focusMode, setFocusMode] = useState(true);
    const [isHighlightMode, setIsHighlightMode] = useState(false);
    const [revealed, setRevealed] = useState<Set<number>>(new Set());
    const seenRef = useRef<Set<number>>(new Set());
    const lastTickRef = useRef(Date.now());

    const backgroundColor = useThemeColor({}, 'background');
    const textColor = useThemeColor({}, 'text');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const secondaryBg = useThemeColor({}, 'secondary');
    const primaryColor = useThemeColor({}, 'primary');
    const cardColor = useThemeColor({}, 'card');

    React.useEffect(() => {
        (async () => {
            if (!id || !uri) { setLoading(false); return; }
            try {
                let parsed = await getCachedData<FlashcardData[]>(id);
                if (!parsed) {
                    parsed = await parseFlashcardsCsv(uri);
                    if (parsed.length > 0) await setCachedData(id, parsed);
                }
                setCards((parsed || []).map((c, i) => ({ ...c, originalIndex: i })));
            } catch (e) {
                console.error('Error loading feed cards:', e);
                setCards([]);
            } finally {
                setLoading(false);
            }
        })();
    }, [id, uri]);

    // Credit each card the first time it scrolls into view: it counts toward
    // the streak/heatmap plus a small XP drip (passive reading, so less than
    // a graded swipe).
    const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
        const item = viewableItems[0];
        if (!item || item.index == null) return;
        setCurrentIndex(item.index);
        if (!seenRef.current.has(item.index)) {
            seenRef.current.add(item.index);
            if (seenRef.current.size > 1) {
                Haptics.selectionAsync().catch(() => { });
            }
            const now = Date.now();
            const delta = Math.min(Math.round((now - lastTickRef.current) / 1000), 60);
            lastTickRef.current = now;
            updateUserStats(1, delta, undefined, 2).catch(() => { });
        }
    }, []);

    const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

    const handleShuffle = () => {
        if (!cards || cards.length < 2) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
        seenRef.current = new Set();
        setRevealed(new Set());
        setCards(shuffleCards(cards));
        setCurrentIndex(0);
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
    };

    const toggleHideAnswers = () => {
        Haptics.selectionAsync().catch(() => { });
        setRevealed(new Set());
        setHideAnswers(h => !h);
    };

    const revealCard = (index: number) => {
        Haptics.selectionAsync().catch(() => { });
        setRevealed(prev => new Set(prev).add(index));
    };

    const toggleFocusMode = () => {
        Haptics.selectionAsync().catch(() => { });
        setFocusMode(f => !f);
    };

    const toggleHighlightMode = () => {
        Haptics.selectionAsync().catch(() => { });
        setIsHighlightMode(h => !h);
    };

    // Persist a ==highlight== edit to the deck file and keep the local list
    // in sync (HighlightableText hands us the full new text of one side).
    const handleHighlightChange = async (index: number, field: 'question' | 'answer', newText: string) => {
        if (!cards || !id) return;
        const item = cards[index];
        if (!item) return;
        const updated = { ...item, [field]: newText };
        const next = [...cards];
        next[index] = updated;
        setCards(next);
        try {
            await updateCardInDeck(id, item.originalIndex, { question: updated.question, answer: updated.answer });
        } catch (e) {
            console.error('Error saving highlight:', e);
        }
    };

    const headerOptions = {
        title: name || 'Feed',
        headerStyle: { backgroundColor },
        headerTintColor: textColor,
        headerShadowVisible: false,
        headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 18 }}>
                <TouchableOpacity onPress={toggleFocusMode} hitSlop={10} accessibilityLabel={focusMode ? 'Disable focus mode' : 'Enable focus mode'} accessibilityRole="button">
                    <Sprout size={22} color={focusMode ? primaryColor : textColor} strokeWidth={focusMode ? 2.5 : 2} />
                </TouchableOpacity>
                <TouchableOpacity onPress={toggleHighlightMode} hitSlop={10} accessibilityLabel={isHighlightMode ? 'Exit highlight mode' : 'Enter highlight mode'} accessibilityRole="button">
                    <Edit3 size={22} color={isHighlightMode ? primaryColor : textColor} strokeWidth={isHighlightMode ? 3 : 2} />
                </TouchableOpacity>
                <TouchableOpacity onPress={toggleHideAnswers} hitSlop={10} accessibilityLabel={hideAnswers ? 'Show answers' : 'Hide answers'} accessibilityRole="button">
                    {hideAnswers ? <EyeOff size={22} color={textColor} /> : <Eye size={22} color={textColor} />}
                </TouchableOpacity>
                <TouchableOpacity onPress={handleShuffle} hitSlop={10} accessibilityLabel="Shuffle cards" accessibilityRole="button">
                    <Shuffle size={22} color={textColor} />
                </TouchableOpacity>
            </View>
        ),
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.center, { backgroundColor }]}>
                <Stack.Screen options={headerOptions} />
                <ActivityIndicator size="large" color={primaryColor} />
            </View>
        );
    }

    if (!cards || cards.length === 0) {
        return (
            <View style={[styles.container, styles.center, { backgroundColor, paddingHorizontal: 32 }]}>
                <Stack.Screen options={headerOptions} />
                <FileWarning size={48} color="#ef4444" strokeWidth={2} />
                <Text style={[styles.emptyTitle, { color: textColor }]}>No cards to scroll</Text>
                <Text style={[styles.emptyText, { color: mutedForeground }]}>
                    Add some cards to this deck first, then swipe through them here.
                </Text>
                <Button title="Go Back" onPress={() => router.back()} style={{ marginTop: 8, width: 200 }} />
            </View>
        );
    }

    const renderCard = ({ item, index }: { item: FeedCard; index: number }) => {
        const answerHidden = hideAnswers && !revealed.has(index);
        return (
            <View style={[styles.page, { height: pageHeight, paddingBottom: insets.bottom + 16 }]}>
                <View style={[styles.card, { backgroundColor: cardColor, borderColor: secondaryBg }, isHighlightMode && { borderColor: primaryColor + '60' }]}>
                    <Text style={[styles.cardLabel, { color: isHighlightMode ? primaryColor : mutedForeground }]}>
                        {isHighlightMode ? 'TAP WORDS TO HIGHLIGHT' : `CARD ${index + 1} / ${cards.length}`}
                    </Text>
                    <ScrollView
                        contentContainerStyle={styles.cardScroll}
                        showsVerticalScrollIndicator={false}
                        nestedScrollEnabled
                    >
                        {isHighlightMode ? (
                            <HighlightableText
                                text={item.question}
                                fontSize={22}
                                align="left"
                                onChange={(t) => handleHighlightChange(index, 'question', t)}
                            />
                        ) : (
                            <MarkdownRenderer content={item.question} fontSize={22} />
                        )}

                        <View style={styles.answerDivider}>
                            <View style={[styles.dividerLine, { backgroundColor: secondaryBg }]} />
                            <Text style={[styles.answerChip, { color: primaryColor, backgroundColor: primaryColor + '15' }]}>ANSWER</Text>
                            <View style={[styles.dividerLine, { backgroundColor: secondaryBg }]} />
                        </View>

                        {answerHidden ? (
                            <TouchableOpacity
                                style={[styles.revealBtn, { backgroundColor: secondaryBg }]}
                                onPress={() => revealCard(index)}
                                activeOpacity={0.8}
                            >
                                <Eye size={18} color={mutedForeground} />
                                <Text style={[styles.revealText, { color: mutedForeground }]}>Tap to reveal</Text>
                            </TouchableOpacity>
                        ) : isHighlightMode ? (
                            <HighlightableText
                                text={item.answer}
                                fontSize={18}
                                align="left"
                                onChange={(t) => handleHighlightChange(index, 'answer', t)}
                            />
                        ) : (
                            <MarkdownRenderer content={item.answer} fontSize={18} />
                        )}
                    </ScrollView>

                    {index < cards.length - 1 && (
                        <View style={styles.swipeHint}>
                            <ChevronsDown size={18} color={mutedForeground} style={{ transform: [{ rotate: '180deg' }] }} />
                            <Text style={[styles.swipeHintText, { color: mutedForeground }]}>Swipe up for next</Text>
                        </View>
                    )}
                </View>
            </View>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor }]}>
            <Stack.Screen options={headerOptions} />

            {focusMode && <FocusPlant active={cards.length > 0} />}

            {/* Page height is measured on this wrapper (not the screen) so the
                pager stays exact when the focus plant bar is visible. */}
            <View style={{ flex: 1 }} onLayout={e => setPageHeight(e.nativeEvent.layout.height)}>
                {pageHeight > 0 && (
                    <FlatList
                        ref={listRef}
                        data={cards}
                        renderItem={renderCard}
                        keyExtractor={(item) => String(item.originalIndex)}
                        pagingEnabled
                        showsVerticalScrollIndicator={false}
                        getItemLayout={(_, index) => ({ length: pageHeight, offset: pageHeight * index, index })}
                        onViewableItemsChanged={onViewableItemsChanged}
                        viewabilityConfig={viewabilityConfig}
                        initialNumToRender={2}
                        maxToRenderPerBatch={3}
                        windowSize={5}
                    />
                )}

                <View style={[styles.progressPill, { backgroundColor: cardColor, top: 10 }]}>
                    <Text style={[styles.progressText, { color: textColor }]}>
                        {currentIndex + 1} / {cards.length}
                    </Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { alignItems: 'center', justifyContent: 'center' },
    page: {
        padding: 16,
        paddingTop: 12,
    },
    card: {
        flex: 1,
        borderRadius: 28,
        borderWidth: 1.5,
        padding: 24,
    },
    cardLabel: {
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 1,
        marginBottom: 14,
    },
    cardScroll: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingBottom: 12,
    },
    answerDivider: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginVertical: 22,
    },
    dividerLine: {
        flex: 1,
        height: 1.5,
        borderRadius: 1,
    },
    answerChip: {
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 1,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
        overflow: 'hidden',
    },
    revealBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 16,
        paddingVertical: 22,
    },
    revealText: {
        fontSize: 14,
        fontWeight: '700',
    },
    swipeHint: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingTop: 10,
    },
    swipeHintText: {
        fontSize: 12,
        fontWeight: '700',
    },
    progressPill: {
        position: 'absolute',
        alignSelf: 'center',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 14,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 3,
    },
    progressText: {
        fontSize: 12,
        fontWeight: '800',
    },
    emptyTitle: { fontSize: 22, fontWeight: '900', marginTop: 16, marginBottom: 8, letterSpacing: -0.5 },
    emptyText: { fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 320 },
});
