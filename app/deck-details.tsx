import { useToast } from '@/components/ui/Toast';
import { useThemeColor } from '@/hooks/use-theme-color';
import { FlashcardData, parseFlashcardsCsv } from '@/utils/CsvParser';
import { Deck, addCardToDeck, deleteCardFromDeck, getCachedData, getDecks, importCsvToDeck, setCachedData, updateCardInDeck, updateDeckProgress } from '@/utils/Storage';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2, Circle, Edit2, FileUp, FileWarning, HelpCircle, Play, Plus, RotateCcw, Trash2, X } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MarkdownRenderer from '../components/MarkdownRenderer';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

type StudyMode = 'all' | 'due' | 'notLearned';

export default function DeckDetailsScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { showToast } = useToast();

    const [deck, setDeck] = useState<Deck | null>(null);
    const [cards, setCards] = useState<FlashcardData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [addCardModalVisible, setAddCardModalVisible] = useState(false);
    const [newQuestion, setNewQuestion] = useState('');
    const [newAnswer, setNewAnswer] = useState('');

    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editQuestion, setEditQuestion] = useState('');
    const [editAnswer, setEditAnswer] = useState('');
    const [isEditHighlightMode, setIsEditHighlightMode] = useState(false);
    const [editFlipped, setEditFlipped] = useState(false);

    const backgroundColor = useThemeColor({}, 'background');
    const cardColor = useThemeColor({}, 'card');
    const textColor = useThemeColor({}, 'text');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const accentColor = useThemeColor({}, 'primary');
    const primaryForeground = useThemeColor({}, 'primaryForeground');
    const secondaryBg = useThemeColor({}, 'secondary');

    useFocusEffect(
        useCallback(() => {
            async function loadDeckData() {
                if (!id) return;

                try {
                    const decks = await getDecks();
                    const currentDeck = decks.find(d => d.id === id);

                    if (!currentDeck) {
                        setError('Deck not found');
                        setLoading(false);
                        return;
                    }
                    setDeck(currentDeck);

                    // Try cache first for speed
                    let parsedCards = await getCachedData<FlashcardData[]>(id);
                    if (!parsedCards) {
                        parsedCards = await parseFlashcardsCsv(currentDeck.uri);
                        if (parsedCards && parsedCards.length > 0) {
                            await setCachedData(id, parsedCards);
                        }
                    }

                    setCards(parsedCards || []);
                } catch (e) {
                    setError('Failed to load cards');
                } finally {
                    setLoading(false);
                }
            }
            loadDeckData();
        }, [id])
    );

    const handleAddCard = async () => {
        if (!newQuestion.trim() || !newAnswer.trim() || !id) return;
        try {
            await addCardToDeck(id, newQuestion, newAnswer);
            setNewQuestion('');
            setNewAnswer('');
            setAddCardModalVisible(false);

            // Reload cards from cache/storage
            const updatedCards = await getCachedData<FlashcardData[]>(id);
            if (updatedCards) setCards(updatedCards);

            const decks = await getDecks();
            const currentDeck = decks.find(d => d.id === id);
            if (currentDeck) setDeck(currentDeck);
            showToast({ message: 'Card added to deck!', type: 'success' });
        } catch (e) {
            showToast({ message: 'Failed to add card', type: 'error' });
        }
    };

    const handleImportCsv = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'text/plain'],
                copyToCacheDirectory: true,
            });

            if (!result.canceled && result.assets && result.assets.length > 0 && id) {
                const asset = result.assets[0];
                await importCsvToDeck(id, asset.uri);

                // Reload data
                const updatedCards = await getCachedData<FlashcardData[]>(id);
                if (updatedCards) setCards(updatedCards);

                const decks = await getDecks();
                const currentDeck = decks.find(d => d.id === id);
                if (currentDeck) setDeck(currentDeck);

                Alert.alert('Success', 'Flashcards imported successfully');
            }
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'Failed to import CSV');
        }
    };

    const handleUpdateCard = async () => {
        if (!editQuestion.trim() || !editAnswer.trim() || editingIndex === null || !id) return;
        try {
            await updateCardInDeck(id, editingIndex, { question: editQuestion, answer: editAnswer });
            setEditModalVisible(false);

            // Reload cards from cache/storage
            const updatedCards = await getCachedData<FlashcardData[]>(id);
            if (updatedCards) setCards(updatedCards);
            showToast({ message: 'Card updated', type: 'success' });
        } catch (e) {
            showToast({ message: 'Failed to update card', type: 'error' });
        }
    };

    const handleDeleteCard = async (index: number) => {
        Alert.alert(
            'Delete Flashcard',
            'Are you sure you want to remove this card permanently?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        if (!id) return;
                        await deleteCardFromDeck(id, index);
                        const updatedCards = await getCachedData<FlashcardData[]>(id);
                        if (updatedCards) setCards(updatedCards);

                        const decks = await getDecks();
                        const currentDeck = decks.find(d => d.id === id);
                        if (currentDeck) setDeck(currentDeck);
                        showToast({ message: 'Flashcard deleted', type: 'info' });
                    }
                }
            ]
        );
    };

    const openEditMenu = (index: number, card: FlashcardData) => {
        setEditingIndex(index);
        setEditQuestion(card.question);
        setEditAnswer(card.answer);
        setEditFlipped(false);
        setIsEditHighlightMode(false);
        setEditModalVisible(true);
    };

    const toggleWordHighlight = (text: string, word: string, wordIndex: number, isFront: boolean) => {
        const words = text.split(/(\s+)/);
        let actualWordCount = 0;

        const newWords = words.map((w) => {
            if (w.trim().length === 0) return w;
            const currentId = actualWordCount++;
            if (currentId === wordIndex) {
                if (w.startsWith('==') && w.endsWith('==')) {
                    return w.slice(2, -2);
                } else {
                    return `==${w}==`;
                }
            }
            return w;
        });

        const newText = newWords.join('');
        if (isFront) setEditQuestion(newText);
        else setEditAnswer(newText);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const WordSplitter = ({ text, isFront, fontSize = 24 }: { text: string, isFront: boolean, fontSize?: number }) => {
        const words = text.split(/(\s+)/);
        let actualWordCount = 0;

        return (
            <View style={styles.clickableTextContainer}>
                {words.map((w, i) => {
                    if (w.trim().length === 0) return <Text key={i} style={[styles.wordText, { fontSize, color: textColor }]}>{w}</Text>;
                    const currentId = actualWordCount++;
                    const isHighlighted = w.startsWith('==') && w.endsWith('==');
                    return (
                        <TouchableOpacity
                            key={i}
                            activeOpacity={0.7}
                            onPress={() => toggleWordHighlight(text, w, currentId, isFront)}
                            style={[
                                styles.wordChip,
                                isHighlighted && styles.wordChipHighlighted
                            ]}
                        >
                            <Text style={[
                                styles.wordText,
                                { color: isHighlighted ? '#000' : textColor, fontSize },
                                isHighlighted && styles.wordTextHighlighted
                            ]}>
                                {isHighlighted ? w.slice(2, -2) : w}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        );
    };

    const toggleProgress = async (index: number) => {
        if (!deck || !id) return;

        let learnedArr = [...(deck.learnedIndices || [])];
        let unsureArr = [...(deck.unsureIndices || [])];

        // Cycle: Unlearned -> Learned -> Unsure -> Unlearned
        if (!learnedArr.includes(index) && !unsureArr.includes(index)) {
            learnedArr.push(index);
        } else if (learnedArr.includes(index)) {
            learnedArr = learnedArr.filter(i => i !== index);
            unsureArr.push(index);
        } else {
            unsureArr = unsureArr.filter(i => i !== index);
        }

        const updatedDeck = { ...deck, learnedIndices: learnedArr, unsureIndices: unsureArr };
        setDeck(updatedDeck);
        await updateDeckProgress(id, learnedArr, unsureArr);
    };

    if (loading) {
        return (
            <View style={[styles.container, { backgroundColor }]}>
                {/* Simplified placeholder for faster visual feedback */}
                <Stack.Screen options={{ title: 'Loading...', headerShadowVisible: false, headerStyle: { backgroundColor } }} />
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={accentColor} />
                    <Text style={{ marginTop: 12, fontSize: 13, color: mutedForeground, fontWeight: '600' }}>Preparing cards...</Text>
                </View>
            </View>
        );
    }

    if (error || !deck) {
        return (
            <View style={[styles.container, { backgroundColor, padding: 24 }]}>
                <FileWarning size={48} color="#ef4444" />
                <Text style={[styles.errorText, { color: textColor }]}>{error || 'Something went wrong'}</Text>
                <Button title="Go Back" onPress={() => router.back()} />
            </View>
        );
    }

    const learnedCount = deck.learnedIndices?.length || 0;
    const unsureCount = deck.unsureIndices?.length || 0;
    const progress = (cards?.length || 0) > 0 ? (learnedCount / cards.length) * 100 : 0;
    
    const progressColor = progress === 0 ? '#ef4444' : 
                         progress < 30 ? '#f97316' : 
                         progress < 60 ? '#eab308' : 
                         progress < 100 ? accentColor : 
                         '#22c55e';

    const cardsWithIndices = (cards || []).map((card, index) => ({ card, originalIndex: index }));

    return (
        <View style={[styles.container, { backgroundColor }]}>
            <Stack.Screen options={{
                title: deck.name,
                headerShadowVisible: false,
                headerStyle: { backgroundColor },
                headerTintColor: textColor,
            }} />

            <FlatList
                data={cardsWithIndices}
                keyExtractor={(item) => item.originalIndex.toString()}
                renderItem={({ item }) => {
                    const { card, originalIndex } = item;
                    const isLearned = deck?.learnedIndices?.includes(originalIndex);
                    const isUnsure = deck?.unsureIndices?.includes(originalIndex);

                    let statusColor = '#ef4444';
                    let statusBg = 'rgba(239, 68, 68, 0.05)';
                    let statusBorder = 'rgba(239, 68, 68, 0.2)';

                    if (isLearned) {
                        statusColor = '#22c55e';
                        statusBg = 'rgba(34, 197, 94, 0.05)';
                        statusBorder = 'rgba(34, 197, 94, 0.2)';
                    } else if (isUnsure) {
                        statusColor = '#eab308';
                        statusBg = 'rgba(234, 179, 8, 0.08)';
                        statusBorder = 'rgba(234, 179, 8, 0.3)';
                    }

                    return (
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => toggleProgress(originalIndex)}
                            onLongPress={() => openEditMenu(originalIndex, card)}
                            style={[
                                styles.cardItem,
                                { backgroundColor: cardColor, borderColor: statusBorder }
                            ]}
                        >
                            <View style={[styles.statusStrip, { backgroundColor: statusColor }]} />
                            <View style={styles.cardMainContent}>
                                <View style={styles.cardHeaderSmall}>
                                    <Text style={[styles.cardIndex, { color: mutedForeground }]}>CARD #{originalIndex + 1}</Text>
                                    {isLearned ? (
                                        <CheckCircle2 size={18} color="#22c55e" strokeWidth={3} />
                                    ) : isUnsure ? (
                                        <HelpCircle size={18} color="#eab308" strokeWidth={3} />
                                    ) : (
                                        <Circle size={18} color="#ef4444" strokeWidth={3} />
                                    )}
                                </View>
                                <View style={styles.contentPreview}>
                                    <View style={styles.questionPreview}>
                                        <MarkdownRenderer content={card.question} fontSize={16} />
                                    </View>
                                    <View style={[styles.inlineDivider, { backgroundColor: secondaryBg }]} />
                                    <View style={styles.answerPreview}>
                                        <MarkdownRenderer content={card.answer} fontSize={14} color={mutedForeground} />
                                    </View>
                                </View>
                            </View>
                        </TouchableOpacity>
                    );
                }}
                ListHeaderComponent={
                    <View style={styles.headerDashboard}>
                        <View style={[styles.mainProgressCard, { backgroundColor: cardColor }]}>
                            <View style={[styles.progressCircleContainer, { backgroundColor: progressColor + '15', borderColor: progressColor + '30' }]}>
                                <Text style={[styles.progressPercentage, { color: progressColor }]}>{Math.round(progress)}%</Text>
                                <Text style={[styles.progressLabel, { color: progressColor, opacity: 0.8 }]}>Mastery</Text>
                            </View>
                            <View style={styles.progressStatsRight}>
                                <Text style={[styles.deckTitleLarge, { color: textColor }]}>{deck.name}</Text>
                                <Text style={[styles.deckSubtitleSmall, { color: mutedForeground }]}>
                                    {cards.length} cards collected
                                </Text>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <TouchableOpacity
                                    style={[styles.miniAddBtn, { backgroundColor: secondaryBg }]}
                                    onPress={handleImportCsv}
                                >
                                    <FileUp size={20} color={accentColor} strokeWidth={3} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.miniAddBtn, { backgroundColor: secondaryBg }]}
                                    onPress={() => setAddCardModalVisible(true)}
                                >
                                    <Plus size={20} color={accentColor} strokeWidth={3} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.statsContainer}>
                            <View style={[styles.statCard, { backgroundColor: cardColor }]}>
                                <Text style={[styles.statValue, { color: textColor }]}>{cards.length}</Text>
                                <Text style={[styles.statLabel, { color: mutedForeground }]}>Total</Text>
                            </View>
                            <View style={[styles.statCard, { backgroundColor: cardColor }]}>
                                <Text style={[styles.statValue, { color: deck?.learnedIndices?.length || 0 === cards.length ? '#22c55e' : textColor }]}>
                                    {deck?.learnedIndices?.length || 0}
                                </Text>
                                <Text style={[styles.statLabel, { color: mutedForeground }]}>Learned</Text>
                            </View>
                            {(() => {
                                const dueCount = Object.values(deck?.srsData || {}).filter(data =>
                                    new Date(data.nextReview) <= new Date()
                                ).length + (cards.length - Object.keys(deck?.srsData || {}).length);

                                return dueCount > 0 ? (
                                    <View style={[styles.statCard, { backgroundColor: cardColor }]}>
                                        <Text style={[styles.statValue, { color: '#ef4444' }]}>{dueCount}</Text>
                                        <Text style={[styles.statLabel, { color: mutedForeground }]}>Due</Text>
                                    </View>
                                ) : (
                                    <View style={[styles.statCard, { backgroundColor: cardColor }]}>
                                        <CheckCircle2 size={20} color="#22c55e" />
                                        <Text style={[styles.statLabel, { color: mutedForeground, marginTop: 4 }]}>Clear</Text>
                                    </View>
                                );
                            })()}
                        </View>

                        <View style={styles.actionGrid}>
                            <Button
                                title="Review Due"
                                onPress={() => {
                                    if (!deck?.uri) {
                                        showToast({ message: 'This deck has no cards to study', type: 'error' });
                                        return;
                                    }
                                    router.push({
                                        pathname: '/swipe',
                                        params: { id, uri: deck.uri, name: deck?.name, mode: 'due' }
                                    });
                                }}
                                style={[styles.mainActionBtn, { flex: 1 }]}
                                icon={<Play size={22} color={primaryForeground} fill={primaryForeground} />}
                            />
                            <Button
                                title="Study All"
                                variant="outline"
                                onPress={() => {
                                    if (!deck?.uri) {
                                        showToast({ message: 'This deck has no cards to study', type: 'error' });
                                        return;
                                    }
                                    router.push({
                                        pathname: '/swipe',
                                        params: { id, uri: deck.uri, name: deck?.name, mode: 'all' }
                                    });
                                }}
                                style={[styles.secondaryActionBtn, { borderColor: accentColor }]}
                                textStyle={{ color: accentColor }}
                                icon={<RotateCcw size={20} color={accentColor} />}
                            />
                        </View>
                    </View>
                }
                contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 110 }]}
                showsVerticalScrollIndicator={false}
                initialNumToRender={8}
                maxToRenderPerBatch={10}
                windowSize={11}
                removeClippedSubviews={true}
            />

            <View />

            {/* Add Card Modal */}
            <Modal
                visible={addCardModalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setAddCardModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <TouchableOpacity style={styles.modalDismiss} onPress={() => setAddCardModalVisible(false)} />
                    <View style={[styles.modalContent, { backgroundColor, paddingBottom: Math.max(insets.bottom, 24) }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: textColor }]}>Add Flashcard</Text>
                            <TouchableOpacity onPress={() => setAddCardModalVisible(false)}>
                                <X size={20} color={textColor} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <View style={{ gap: 20 }}>
                                <Input
                                    label="Question"
                                    value={newQuestion}
                                    onChangeText={setNewQuestion}
                                    placeholder="e.g. What is the speed of light?"
                                    multiline
                                />
                                <Input
                                    label="Answer"
                                    value={newAnswer}
                                    onChangeText={setNewAnswer}
                                    placeholder="e.g. 299,792,458 m/s"
                                    multiline
                                />
                                <Button
                                    title="Add to Deck"
                                    onPress={handleAddCard}
                                    style={{ marginTop: 12, height: 56, borderRadius: 16 }}
                                />
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Edit Card Modal */}
            <Modal
                visible={editModalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setEditModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <TouchableOpacity style={styles.modalDismiss} onPress={() => setEditModalVisible(false)} />
                    <View style={[styles.modalContent, { backgroundColor, paddingBottom: Math.max(insets.bottom, 24) }]}>
                        <View style={styles.modalHeader}>
                            <View>
                                <Text style={[styles.modalTitle, { color: textColor }]}>Edit Flashcard</Text>
                                <Text style={[styles.modalSubtitle, { color: mutedForeground }]}>Long press card in list to open this menu</Text>
                            </View>
                            <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                                <X size={24} color={textColor} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.editControls}>
                            <TouchableOpacity
                                style={[styles.toggleBtn, !isEditHighlightMode && { backgroundColor: accentColor }]}
                                onPress={() => setIsEditHighlightMode(false)}
                            >
                                <Edit2 size={16} color={!isEditHighlightMode ? primaryForeground : textColor} />
                                <Text style={[styles.toggleBtnText, { color: !isEditHighlightMode ? primaryForeground : textColor }]}>Text</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.toggleBtn, isEditHighlightMode && { backgroundColor: accentColor }]}
                                onPress={() => setIsEditHighlightMode(true)}
                            >
                                <Play size={16} color={isEditHighlightMode ? primaryForeground : textColor} />
                                <Text style={[styles.toggleBtnText, { color: isEditHighlightMode ? primaryForeground : textColor }]}>Highlights</Text>
                            </TouchableOpacity>
                            <View style={{ flex: 1 }} />
                            <TouchableOpacity
                                style={[styles.deleteBtn, { backgroundColor: '#ef444420' }]}
                                onPress={() => editingIndex !== null && handleDeleteCard(editingIndex)}
                            >
                                <Trash2 size={18} color="#ef4444" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            <View style={{ gap: 20, paddingTop: 10 }}>
                                {isEditHighlightMode ? (
                                    <View style={[styles.highlightEditor, { backgroundColor: secondaryBg }]}>
                                        <Text style={[styles.editorLabel, { color: mutedForeground }]}>{editFlipped ? 'ANSWER' : 'QUESTION'}</Text>
                                        <WordSplitter
                                            text={editFlipped ? editAnswer : editQuestion}
                                            isFront={!editFlipped}
                                            fontSize={20}
                                        />
                                        <TouchableOpacity
                                            style={[styles.miniFlipBtn, { backgroundColor: backgroundColor }]}
                                            onPress={() => setEditFlipped(!editFlipped)}
                                        >
                                            <RotateCcw size={14} color={textColor} />
                                            <Text style={[styles.miniFlipText, { color: textColor }]}>Switch Side</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <>
                                        <Input
                                            label="Question"
                                            value={editQuestion}
                                            onChangeText={setEditQuestion}
                                            multiline
                                        />
                                        <Input
                                            label="Answer"
                                            value={editAnswer}
                                            onChangeText={setEditAnswer}
                                            multiline
                                        />
                                    </>
                                )}
                                <Button
                                    title="Save Changes"
                                    onPress={handleUpdateCard}
                                    style={{ marginTop: 12, height: 56, borderRadius: 16 }}
                                />
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    headerDashboard: {
        padding: 20,
        gap: 20,
    },
    mainProgressCard: {
        padding: 24,
        borderRadius: 32,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 8,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
    },
    progressCircleContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 4,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    progressPercentage: {
        fontSize: 22,
        fontWeight: '900',
    },
    progressLabel: {
        fontSize: 9,
        fontWeight: '700',
        textTransform: 'uppercase',
        marginTop: -2,
    },
    miniAddBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'absolute',
        top: 16,
        right: 16,
    },
    miniImportBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'absolute',
        top: 16,
        right: 60,
    },
    progressStatsRight: {
        flex: 1,
        marginLeft: 20,
    },
    deckTitleLarge: {
        fontSize: 24,
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    deckSubtitleSmall: {
        fontSize: 13,
        marginTop: 4,
    },
    statsGrid: {
        flexDirection: 'row',
        marginTop: 12,
        borderRadius: 20,
        padding: 16,
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    gridItem: {
        flex: 1,
        alignItems: 'center',
    },
    gridValue: {
        fontSize: 18,
        fontWeight: '800',
    },
    gridLabel: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
        opacity: 0.7,
        marginTop: 2,
    },
    gridDivider: {
        width: 1,
        height: 24,
    },
    listContent: {
        paddingTop: 0,
    },
    cardItem: {
        marginHorizontal: 16,
        marginBottom: 12,
        borderRadius: 16,
        flexDirection: 'row',
        overflow: 'hidden',
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    statusStrip: {
        width: 6,
        height: '100%',
    },
    cardMainContent: {
        flex: 1,
        padding: 16,
    },
    cardHeaderSmall: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    cardIndex: {
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1,
    },
    contentPreview: {
        flexDirection: 'column',
    },
    questionPreview: {
        marginBottom: 8,
    },
    inlineDivider: {
        height: 1,
        width: '100%',
        marginVertical: 4,
        opacity: 0.5,
    },
    answerPreview: {
        marginTop: 4,
    },
    errorText: {
        fontSize: 16,
        textAlign: 'center',
        marginVertical: 16,
    },
    fabContainer: {
        position: 'absolute',
        left: 0,
        right: 0,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
    },
    playButton: {
        height: 60,
        borderRadius: 30,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 15,
        elevation: 10,
        minWidth: 200,
    },
    playIconWrapper: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    playButtonText: {
        fontSize: 17,
        fontWeight: '800',
        letterSpacing: -0.2,
    },
    modeSelector: {
        flexDirection: 'row',
        marginHorizontal: 16,
        marginTop: 0,
        marginBottom: 8,
        borderRadius: 14,
        padding: 4,
        gap: 6,
    },
    modeButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modeText: {
        fontSize: 13,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    modalDismiss: {
        flex: 1,
    },
    modalContent: {
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: 24,
        maxHeight: '80%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: '900',
        letterSpacing: -0.5,
    },
    modalSubtitle: {
        fontSize: 12,
        fontWeight: '500',
        marginTop: 2,
    },
    editControls: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 4,
        backgroundColor: 'rgba(0,0,0,0.05)',
        borderRadius: 14,
        marginBottom: 20,
        gap: 4,
    },
    toggleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 10,
        gap: 6,
    },
    toggleBtnText: {
        fontSize: 13,
        fontWeight: '700',
    },
    deleteBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 4,
    },
    highlightEditor: {
        padding: 24,
        borderRadius: 20,
        minHeight: 180,
        justifyContent: 'center',
        alignItems: 'center',
    },
    editorLabel: {
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1.5,
        position: 'absolute',
        top: 16,
    },
    miniFlipBtn: {
        position: 'absolute',
        bottom: 12,
        right: 12,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
        gap: 6,
        elevation: 2,
    },
    miniFlipText: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    clickableTextContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
    },
    wordChip: {
        borderRadius: 4,
        paddingHorizontal: 2,
        marginVertical: 1,
    },
    wordChipHighlighted: {
        backgroundColor: '#facc15',
    },
    wordText: {
        fontSize: 20,
        fontWeight: '500',
        textAlign: 'center',
    },
    wordTextHighlightFront: {
        fontSize: 18,
    },
    statsContainer: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 28,
    },
    statCard: {
        flex: 1,
        padding: 18,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
    },
    statValue: {
        fontSize: 20,
        fontWeight: '900',
    },
    statLabel: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
        marginTop: 4,
        letterSpacing: 0.5,
    },
    actionGrid: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 40,
        paddingHorizontal: 4,
    },
    mainActionBtn: {
        height: 56,
        borderRadius: 18,
    },
    secondaryActionBtn: {
        flex: 1,
        height: 56,
        borderRadius: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    secondaryActionText: {
        fontSize: 15,
        fontWeight: '700',
    },
    wordTextHighlighted: {
        fontWeight: '800',
        color: '#000',
    }
});
