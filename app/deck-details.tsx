import { useToast } from '@/components/ui/Toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { FlashcardData, parseFlashcardsCsv } from '@/utils/CsvParser';
import { ConfusionPair, Deck, StudyDirection, addCardToDeck, deleteCardFromDeck, getCachedData, getConfusionPairs, getDecks, importCsvToDeck, resetDeckProgress, setCachedData, updateCardInDeck, updateDeckExamDate, updateDeckProgress, updateDeckStudyDirection } from '@/utils/Storage';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from '@/utils/AppHaptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { ArrowLeftRight, CalendarDays, CheckCircle2, Circle, Edit2, FileUp, FileWarning, GalleryVerticalEnd, HelpCircle, Keyboard, ListChecks, Play, Plus, RotateCcw, Search, Share2, Trash2, X, Zap } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { exportSprigDeck } from '@/utils/SprigDeck';
import { CardImagePicker } from '../components/CardImagePicker';
import { CardTextInput } from '../components/CardTextInput';
import MarkdownRenderer from '../components/MarkdownRenderer';
import { isImageToken } from '@/utils/CardImages';
import { toDisplayText } from '@/utils/CardText';
import { Button } from '../components/ui/Button';
import { BottomSheet } from '../components/ui/BottomSheet';
import { useConfirm } from '../components/ui/ConfirmDialog';

export default function DeckDetailsScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { showToast } = useToast();
    const confirm = useConfirm();
    const { t } = useLanguage();

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

    const [cardSearch, setCardSearch] = useState('');
    const [filterMode, setFilterMode] = useState<'all' | 'learned' | 'unsure' | 'new'>('all');
    const [confusions, setConfusions] = useState<ConfusionPair[]>([]);

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
                        setError(t('deckDetailsNotFound'));
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
                    setConfusions(await getConfusionPairs(id));
                } catch (e) {
                    console.error('Error loading deck data:', e);
                    setError(t('deckDetailsLoadFailed'));
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
            showToast({ message: t('deckDetailsCardAdded'), type: 'success' });
        } catch (e) {
            console.error('Error adding card:', e);
            showToast({ message: t('deckDetailsAddCardFailed'), type: 'error' });
        }
    };

    const handleImportCsv = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['text/csv', 'text/comma-separated-values', 'text/tab-separated-values', 'application/vnd.ms-excel', 'text/plain'],
                copyToCacheDirectory: true,
            });

            if (!result.canceled && result.assets && result.assets.length > 0 && id) {
                const asset = result.assets[0];
                const beforeCount = cards.length;
                await importCsvToDeck(id, asset.uri);

                // Reload data
                const updatedCards = await getCachedData<FlashcardData[]>(id);
                if (updatedCards) setCards(updatedCards);

                const decks = await getDecks();
                const currentDeck = decks.find(d => d.id === id);
                if (currentDeck) setDeck(currentDeck);

                const importedCount = (updatedCards?.length || 0) - beforeCount;
                if (importedCount > 0) {
                    showToast({ message: t(importedCount === 1 ? 'deckDetailsImportedOne' : 'deckDetailsImportedMany').replace('{n}', String(importedCount)), type: 'success' });
                } else {
                    showToast({ message: t('deckDetailsNoImportPairs'), type: 'warning' });
                }
            }
        } catch (e) {
            console.error(e);
            showToast({ message: t('deckDetailsImportFailed'), type: 'error' });
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
            showToast({ message: t('deckDetailsCardUpdated'), type: 'success' });
        } catch (e) {
            console.error('Error updating card:', e);
            showToast({ message: t('deckDetailsUpdateCardFailed'), type: 'error' });
        }
    };

    const handleDeleteCard = async (index: number) => {
        const ok = await confirm({
            title: t('deckDetailsDeleteFlashcard'),
            message: t('deckDetailsDeleteFlashcardMessage'),
            confirmText: t('delete'),
            destructive: true,
        });
        if (!ok || !id) return;
        await deleteCardFromDeck(id, index);
        const updatedCards = await getCachedData<FlashcardData[]>(id);
        if (updatedCards) setCards(updatedCards);

        const decks = await getDecks();
        const currentDeck = decks.find(d => d.id === id);
        if (currentDeck) setDeck(currentDeck);
        showToast({ message: t('deckDetailsCardDeleted'), type: 'info' });
    };

    const cardQuery = cardSearch.trim().toLowerCase();
    const visibleCards = React.useMemo(() => {
        const cardsWithIndices = (cards || []).map((card, index) => ({ card, originalIndex: index }));
        return cardsWithIndices.filter(({ card, originalIndex }) => {
            if (cardQuery &&
                !toDisplayText(card.question).toLowerCase().includes(cardQuery) &&
                !toDisplayText(card.answer).toLowerCase().includes(cardQuery)) {
                return false;
            }
            const isLearned = deck?.learnedIndices?.includes(originalIndex);
            const isUnsure = deck?.unsureIndices?.includes(originalIndex);
            switch (filterMode) {
                case 'learned': return !!isLearned;
                case 'unsure': return !!isUnsure;
                case 'new': return !isLearned && !isUnsure;
                default: return true;
            }
        });
    }, [cards, cardQuery, filterMode, deck]);

    const handleSetDirection = async (direction: StudyDirection) => {
        if (!id) return;
        await updateDeckStudyDirection(id, direction);
        setDeck(d => (d ? { ...d, studyDirection: direction } : d));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    // Exam countdown: pick a date, shift it, or clear it
    const [showExamPicker, setShowExamPicker] = useState(false);

    const clearExamDate = async () => {
        if (!id) return;
        await updateDeckExamDate(id, null);
        setDeck(d => (d ? { ...d, examDate: undefined } : d));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const onExamDatePicked = async (event: DateTimePickerEvent, date?: Date) => {
        setShowExamPicker(false);
        if (event.type !== 'set' || !date || !id) return;
        // Format in local time — toISOString would shift the day near midnight
        const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        await updateDeckExamDate(id, dateKey);
        setDeck(d => (d ? { ...d, examDate: dateKey } : d));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const handleExportDeck = async () => {
        if (!deck?.uri) return;
        try {
            if (deck.type === 'pdf') {
                await Sharing.shareAsync(deck.uri, {
                    mimeType: 'application/pdf',
                    dialogTitle: t('deckDetailsExportDialog').replace('{name}', deck.name),
                });
                return;
            }
            // Card decks travel as .sprig: name, icon, cards AND images —
            // the recipient opens the file with Sprig and gets the full deck.
            const uri = await exportSprigDeck(deck);
            await Sharing.shareAsync(uri, {
                mimeType: 'application/octet-stream',
                dialogTitle: t('deckDetailsShareDialog').replace('{name}', deck.name),
            });
        } catch (e) {
            console.error('Error exporting deck:', e);
            showToast({ message: t('deckDetailsExportFailed'), type: 'error' });
        }
    };

    const handleResetProgress = async () => {
        const ok = await confirm({
            title: t('deckDetailsResetProgress'),
            message: t('deckDetailsResetProgressMessage'),
            confirmText: t('deckDetailsReset'),
            destructive: true,
        });
        if (!ok || !id) return;
        await resetDeckProgress(id);
        const decks = await getDecks();
        const currentDeck = decks.find(d => d.id === id);
        if (currentDeck) setDeck(currentDeck);
        showToast({ message: t('deckDetailsProgressReset'), type: 'info' });
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
                    // Image tokens aren't prose — show a muted placeholder that
                    // can't be highlighted (the token survives edits untouched).
                    if (isImageToken(w)) {
                        return (
                            <Text key={i} style={[styles.wordText, styles.imagePlaceholder, { fontSize: fontSize - 4, color: textColor }]}>
                                {t('deckDetailsImagePlaceholder')}
                            </Text>
                        );
                    }
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
                <Stack.Screen options={{ title: t('loading'), headerShadowVisible: false, headerStyle: { backgroundColor } }} />
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={accentColor} />
                    <Text style={{ marginTop: 12, fontSize: 13, color: mutedForeground, fontWeight: '600' }}>{t('deckDetailsPreparingCards')}</Text>
                </View>
            </View>
        );
    }

    if (error || !deck) {
        return (
            <View style={[styles.container, { backgroundColor, padding: 24 }]}>
                <FileWarning size={48} color="#ef4444" />
                <Text style={[styles.errorText, { color: textColor }]}>{error || t('deckDetailsSomethingWrong')}</Text>
                <Button title={t('swipeGoBack')} onPress={() => router.back()} />
            </View>
        );
    }

    const learnedCount = deck.learnedIndices?.length || 0;
    const progress = (cards?.length || 0) > 0 ? (learnedCount / cards.length) * 100 : 0;
    
    const progressColor = progress === 0 ? '#ef4444' : 
                         progress < 30 ? '#f97316' : 
                         progress < 60 ? '#eab308' : 
                         progress < 100 ? accentColor : 
                         '#22c55e';

    const filterOptions: { key: typeof filterMode; label: string }[] = [
        { key: 'all', label: t('deckDetailsFilterAll') },
        { key: 'learned', label: t('deckDetailsFilterLearned') },
        { key: 'unsure', label: t('deckDetailsFilterUnsure') },
        { key: 'new', label: t('deckDetailsFilterNew') },
    ];

    const directionOptions: { key: StudyDirection; label: string }[] = [
        { key: 'normal', label: t('deckDetailsDirectionNormal') },
        { key: 'reversed', label: t('deckDetailsDirectionReversed') },
        { key: 'mixed', label: t('deckDetailsDirectionMixed') },
    ];

    return (
        <View style={[styles.container, { backgroundColor }]}>
            <Stack.Screen options={{
                title: deck.name,
                headerShadowVisible: false,
                headerStyle: { backgroundColor },
                headerTintColor: textColor,
            }} />

            <FlatList
                data={visibleCards}
                keyExtractor={(item) => item.originalIndex.toString()}
                renderItem={({ item }) => {
                    const { card, originalIndex } = item;
                    const isLearned = deck?.learnedIndices?.includes(originalIndex);
                    const isUnsure = deck?.unsureIndices?.includes(originalIndex);

                    let statusColor = '#ef4444';
                    let statusBorder = 'rgba(239, 68, 68, 0.2)';

                    if (isLearned) {
                        statusColor = '#22c55e';
                        statusBorder = 'rgba(34, 197, 94, 0.2)';
                    } else if (isUnsure) {
                        statusColor = '#eab308';
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
                                    <Text style={[styles.cardIndex, { color: mutedForeground }]}>{t('deckDetailsCardHash').replace('{n}', String(originalIndex + 1))}</Text>
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
                                <View style={styles.deckTitleRow}>
                                    <Text style={[styles.deckTitleLarge, { color: textColor }]} numberOfLines={2}>{deck.name}</Text>
                                    <View style={styles.deckActions}>
                                        <TouchableOpacity
                                            style={[styles.miniAddBtn, { backgroundColor: secondaryBg }]}
                                            onPress={handleExportDeck}
                                            accessibilityLabel="Export deck"
                                            accessibilityRole="button"
                                        >
                                            <Share2 size={15} color={accentColor} strokeWidth={3} />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.miniAddBtn, { backgroundColor: secondaryBg }]}
                                            onPress={handleImportCsv}
                                            accessibilityLabel="Import cards from CSV"
                                            accessibilityRole="button"
                                        >
                                            <FileUp size={15} color={accentColor} strokeWidth={3} />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.miniAddBtn, { backgroundColor: secondaryBg }]}
                                            onPress={() => setAddCardModalVisible(true)}
                                            accessibilityLabel="Add flashcard"
                                            accessibilityRole="button"
                                        >
                                            <Plus size={15} color={accentColor} strokeWidth={3} />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                                {(() => {
                                    const learned = deck?.learnedIndices?.length || 0;
                                    const dueCount = Object.values(deck?.srsData || {}).filter(data =>
                                        new Date(data.nextReview) <= new Date()
                                    ).length + (cards.length - Object.keys(deck?.srsData || {}).length);
                                    return (
                                        <Text style={[styles.deckSubtitleSmall, { color: mutedForeground }]}>
                                            {t('deckDetailsCardsCount').replace('{n}', String(cards.length))}
                                            {'  ·  '}
                                            <Text style={{ color: cards.length > 0 && learned === cards.length ? '#22c55e' : mutedForeground }}>{t('deckDetailsLearnedCount').replace('{n}', String(learned))}</Text>
                                            {'  ·  '}
                                            {dueCount > 0 ? (
                                                <Text style={{ color: '#ef4444', fontWeight: '700' }}>{t('homeDueCount').replace('{n}', String(dueCount))}</Text>
                                            ) : (
                                                <Text style={{ color: '#22c55e', fontWeight: '700' }}>{t('deckDetailsAllClear')}</Text>
                                            )}
                                        </Text>
                                    );
                                })()}
                            </View>
                        </View>

                        {/* One primary action, then the other study modes as a
                            compact equal-width tile row - replaces four stacked
                            full-width buttons. */}
                        <View style={styles.studyBlock}>
                            <Button
                                title={t('deckDetailsReviewDue')}
                                onPress={() => {
                                    if (!deck?.uri) {
                                        showToast({ message: t('deckDetailsNoCardsToStudy'), type: 'error' });
                                        return;
                                    }
                                    router.push({
                                        pathname: '/swipe',
                                        params: { id, uri: deck.uri, name: deck?.name, mode: 'due' }
                                    });
                                }}
                                style={styles.mainActionBtn}
                                icon={<Play size={22} color={primaryForeground} fill={primaryForeground} />}
                            />
                            <View style={styles.modeRow}>
                                <TouchableOpacity
                                    style={[styles.modeTile, { backgroundColor: secondaryBg }]}
                                    onPress={() => {
                                        if (!deck?.uri) {
                                            showToast({ message: t('deckDetailsNoCardsToStudy'), type: 'error' });
                                            return;
                                        }
                                        router.push({ pathname: '/swipe', params: { id, uri: deck.uri, name: deck?.name, mode: 'all' } });
                                    }}
                                    activeOpacity={0.85}
                                    accessibilityLabel="Study all cards"
                                    accessibilityRole="button"
                                >
                                    <RotateCcw size={19} color={accentColor} strokeWidth={2.5} />
                                    <Text style={[styles.modeTileText, { color: textColor }]}>{t('deckDetailsStudyAll')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modeTile, { backgroundColor: secondaryBg }]}
                                    onPress={() => {
                                        if (!deck?.uri) {
                                            showToast({ message: t('deckDetailsNoCardsToStudy'), type: 'error' });
                                            return;
                                        }
                                        if (cards.length < 4) {
                                            showToast({ message: t('deckDetailsQuizNeedsFour'), type: 'warning' });
                                            return;
                                        }
                                        router.push({ pathname: '/quiz', params: { id, uri: deck.uri, name: deck?.name } });
                                    }}
                                    activeOpacity={0.85}
                                    accessibilityLabel="Quiz with multiple choice"
                                    accessibilityRole="button"
                                >
                                    <ListChecks size={19} color={accentColor} strokeWidth={2.5} />
                                    <Text style={[styles.modeTileText, { color: textColor }]}>{t('quizTitle')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modeTile, { backgroundColor: secondaryBg }]}
                                    onPress={() => {
                                        if (!deck?.uri || cards.length === 0) {
                                            showToast({ message: t('deckDetailsNoCardsToStudy'), type: 'error' });
                                            return;
                                        }
                                        router.push({ pathname: '/feed', params: { id, uri: deck.uri, name: deck?.name } });
                                    }}
                                    activeOpacity={0.85}
                                    accessibilityLabel="Scroll and learn feed"
                                    accessibilityRole="button"
                                >
                                    <GalleryVerticalEnd size={19} color={accentColor} strokeWidth={2.5} />
                                    <Text style={[styles.modeTileText, { color: textColor }]}>{t('onboardFeed')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modeTile, { backgroundColor: secondaryBg }]}
                                    onPress={() => {
                                        if (!deck?.uri || cards.length === 0) {
                                            showToast({ message: t('deckDetailsNoCardsToStudy'), type: 'error' });
                                            return;
                                        }
                                        router.push({ pathname: '/type', params: { id, uri: deck.uri, name: deck?.name } });
                                    }}
                                    activeOpacity={0.85}
                                    accessibilityLabel="Type the answer mode"
                                    accessibilityRole="button"
                                >
                                    <Keyboard size={19} color={accentColor} strokeWidth={2.5} />
                                    <Text style={[styles.modeTileText, { color: textColor }]}>{t('onboardType')}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Direction + exam grouped into one quiet options card
                            instead of two floating label rows. */}
                        {(() => {
                            const examSet = !!deck.examDate;
                            return (
                                <>
                                    <View style={[styles.optionsCard, { backgroundColor: cardColor }]}>
                                        <View style={styles.optionRow}>
                                            <Text style={[styles.optionLabel, { color: mutedForeground }]}>{t('deckDetailsDirection')}</Text>
                                            <View style={styles.optionChips}>
                                                {directionOptions.map(opt => {
                                                    const active = (deck.studyDirection || 'normal') === opt.key;
                                                    return (
                                                        <TouchableOpacity
                                                            key={opt.key}
                                                            style={[
                                                                styles.filterChip,
                                                                { backgroundColor: active ? accentColor : secondaryBg }
                                                            ]}
                                                            onPress={() => handleSetDirection(opt.key)}
                                                        >
                                                            <Text style={[
                                                                styles.filterChipText,
                                                                { color: active ? primaryForeground : mutedForeground }
                                                            ]}>
                                                                {opt.label}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                        </View>
                                        <View style={[styles.optionDivider, { backgroundColor: secondaryBg }]} />
                                        <View style={styles.optionRow}>
                                            <Text style={[styles.optionLabel, { color: mutedForeground }]}>{t('groveExam')}</Text>
                                            <View style={styles.optionChips}>
                                                <TouchableOpacity
                                                    style={[styles.filterChip, { backgroundColor: examSet ? secondaryBg : accentColor }]}
                                                    onPress={clearExamDate}
                                                >
                                                    <Text style={[styles.filterChipText, { color: examSet ? mutedForeground : primaryForeground }]}>{t('deckDetailsOff')}</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={[styles.filterChip, { backgroundColor: examSet ? accentColor : secondaryBg }]}
                                                    onPress={() => setShowExamPicker(true)}
                                                    accessibilityLabel="Pick exam date"
                                                    accessibilityRole="button"
                                                >
                                                    <CalendarDays size={13} color={examSet ? primaryForeground : mutedForeground} strokeWidth={2.5} />
                                                    <Text style={[styles.filterChipText, { color: examSet ? primaryForeground : mutedForeground }]}>
                                                        {examSet
                                                            ? new Date(deck.examDate! + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
                                                            : t('deckDetailsPickDate')}
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                        {showExamPicker && (
                                            <DateTimePicker
                                                value={deck.examDate ? new Date(deck.examDate + 'T00:00:00') : new Date()}
                                                mode="date"
                                                minimumDate={new Date()}
                                                onChange={onExamDatePicked}
                                            />
                                        )}
                                    </View>

                                </>
                            );
                        })()}

                        {confusions.length > 0 && (
                            <View style={styles.confusionSection}>
                                <View style={styles.confusionHeader}>
                                    <ArrowLeftRight size={16} color="#f59e0b" strokeWidth={2.5} />
                                    <Text style={[styles.confusionTitle, { color: textColor }]}>{t('deckDetailsOftenConfused')}</Text>
                                    <View style={{ flex: 1 }} />
                                    <TouchableOpacity
                                        style={[styles.drillBtn, { backgroundColor: '#f59e0b' }]}
                                        onPress={() => {
                                            if (!deck?.uri) return;
                                            // Union of every card involved in a confusion pair
                                            const indices = Array.from(new Set(confusions.flatMap(p => [p.cardA, p.cardB])))
                                                .filter(i => i >= 0 && i < cards.length);
                                            if (indices.length === 0) return;
                                            router.push({
                                                pathname: '/swipe',
                                                params: { id, uri: deck.uri, name: deck.name, mode: 'all', cards: indices.join(',') },
                                            });
                                        }}
                                        activeOpacity={0.85}
                                        accessibilityLabel="Drill the confused cards"
                                        accessibilityRole="button"
                                    >
                                        <Zap size={13} color="#fff" strokeWidth={2.5} fill="#fff" />
                                        <Text style={styles.drillBtnText}>{t('deckDetailsDrillThese')}</Text>
                                    </TouchableOpacity>
                                </View>
                                {confusions.map(pair => {
                                    const a = cards[pair.cardA];
                                    const b = cards[pair.cardB];
                                    if (!a || !b) return null;
                                    return (
                                        <View key={`${pair.cardA}-${pair.cardB}`} style={[styles.confusionCard, { backgroundColor: cardColor }]}>
                                            <View style={{ flex: 1, gap: 8 }}>
                                                <View>
                                                    <Text style={[styles.confusionQ, { color: textColor }]} numberOfLines={2}>{toDisplayText(a.question)}</Text>
                                                    <Text style={[styles.confusionA, { color: mutedForeground }]} numberOfLines={1}>→ {toDisplayText(a.answer)}</Text>
                                                </View>
                                                <View>
                                                    <Text style={[styles.confusionQ, { color: textColor }]} numberOfLines={2}>{toDisplayText(b.question)}</Text>
                                                    <Text style={[styles.confusionA, { color: mutedForeground }]} numberOfLines={1}>→ {toDisplayText(b.answer)}</Text>
                                                </View>
                                            </View>
                                            <View style={[styles.confusionBadge, { backgroundColor: '#f59e0b20' }]}>
                                                <Text style={styles.confusionBadgeText}>{pair.count}×</Text>
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        )}

                        <View style={[styles.cardSearchBar, { backgroundColor: cardColor }]}>
                            <Search size={16} color={mutedForeground} />
                            <TextInput
                                style={[styles.cardSearchInput, { color: textColor }]}
                                placeholder={t('deckDetailsSearchCards')}
                                placeholderTextColor={mutedForeground}
                                value={cardSearch}
                                onChangeText={setCardSearch}
                                returnKeyType="search"
                                autoCorrect={false}
                            />
                            {cardSearch.length > 0 && (
                                <TouchableOpacity onPress={() => setCardSearch('')} hitSlop={8} accessibilityLabel="Clear search" accessibilityRole="button">
                                    <X size={16} color={mutedForeground} />
                                </TouchableOpacity>
                            )}
                        </View>

                        <View style={styles.filterRow}>
                            {filterOptions.map(opt => (
                                <TouchableOpacity
                                    key={opt.key}
                                    style={[
                                        styles.filterChip,
                                        { backgroundColor: filterMode === opt.key ? accentColor : cardColor }
                                    ]}
                                    onPress={() => setFilterMode(opt.key)}
                                >
                                    <Text style={[
                                        styles.filterChipText,
                                        { color: filterMode === opt.key ? primaryForeground : mutedForeground }
                                    ]}>
                                        {opt.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                            <View style={{ flex: 1 }} />
                            <TouchableOpacity onPress={handleResetProgress} hitSlop={8}>
                                <Text style={[styles.resetLink, { color: mutedForeground }]}>{t('deckDetailsReset')}</Text>
                            </TouchableOpacity>
                        </View>

                        {(cardQuery.length > 0 || filterMode !== 'all') && (
                            <Text style={[styles.filterResultText, { color: mutedForeground }]}>
                                {t('deckDetailsCardsShown').replace('{n}', String(visibleCards.length)).replace('{total}', String(cards.length))}
                            </Text>
                        )}
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
            <BottomSheet
                visible={addCardModalVisible}
                onClose={() => setAddCardModalVisible(false)}
                sheetStyle={[styles.modalContent, { backgroundColor, paddingBottom: Math.max(insets.bottom, 24) }]}
            >
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: textColor }]}>{t('deckDetailsAddFlashcard')}</Text>
                            <TouchableOpacity onPress={() => setAddCardModalVisible(false)} accessibilityLabel="Close" accessibilityRole="button">
                                <X size={20} color={textColor} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <View style={{ gap: 20 }}>
                                <View style={{ gap: 10 }}>
                                    <CardTextInput
                                        label={t('swipeQuestion')}
                                        value={newQuestion}
                                        onChangeText={setNewQuestion}
                                        placeholder={t('deckDetailsQuestionPlaceholder')}
                                        multiline
                                    />
                                    <CardImagePicker text={newQuestion} onChangeText={setNewQuestion} />
                                </View>
                                <View style={{ gap: 10 }}>
                                    <CardTextInput
                                        label={t('swipeAnswer')}
                                        value={newAnswer}
                                        onChangeText={setNewAnswer}
                                        placeholder={t('deckDetailsAnswerPlaceholder')}
                                        multiline
                                    />
                                    <CardImagePicker text={newAnswer} onChangeText={setNewAnswer} />
                                </View>
                                <Button
                                    title={t('deckDetailsAddToDeck')}
                                    onPress={handleAddCard}
                                    style={{ marginTop: 12, height: 56, borderRadius: 16 }}
                                />
                            </View>
                        </ScrollView>
            </BottomSheet>

            {/* Edit Card Modal */}
            <BottomSheet
                visible={editModalVisible}
                onClose={() => setEditModalVisible(false)}
                sheetStyle={[styles.modalContent, { backgroundColor, paddingBottom: Math.max(insets.bottom, 24) }]}
            >
                        <View style={styles.modalHeader}>
                            <View>
                                <Text style={[styles.modalTitle, { color: textColor }]}>{t('deckDetailsEditFlashcard')}</Text>
                                <Text style={[styles.modalSubtitle, { color: mutedForeground }]}>{t('deckDetailsLongPressHint')}</Text>
                            </View>
                            <TouchableOpacity onPress={() => setEditModalVisible(false)} accessibilityLabel="Close" accessibilityRole="button">
                                <X size={24} color={textColor} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.editControls}>
                            <TouchableOpacity
                                style={[styles.toggleBtn, !isEditHighlightMode && { backgroundColor: accentColor }]}
                                onPress={() => setIsEditHighlightMode(false)}
                            >
                                <Edit2 size={16} color={!isEditHighlightMode ? primaryForeground : textColor} />
                                <Text style={[styles.toggleBtnText, { color: !isEditHighlightMode ? primaryForeground : textColor }]}>{t('deckDetailsText')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.toggleBtn, isEditHighlightMode && { backgroundColor: accentColor }]}
                                onPress={() => setIsEditHighlightMode(true)}
                            >
                                <Play size={16} color={isEditHighlightMode ? primaryForeground : textColor} />
                                <Text style={[styles.toggleBtnText, { color: isEditHighlightMode ? primaryForeground : textColor }]}>{t('deckDetailsHighlights')}</Text>
                            </TouchableOpacity>
                            <View style={{ flex: 1 }} />
                            <TouchableOpacity
                                style={[styles.deleteBtn, { backgroundColor: '#ef444420' }]}
                                onPress={() => editingIndex !== null && handleDeleteCard(editingIndex)}
                                accessibilityLabel="Delete flashcard"
                                accessibilityRole="button"
                            >
                                <Trash2 size={18} color="#ef4444" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            <View style={{ gap: 20, paddingTop: 10 }}>
                                {isEditHighlightMode ? (
                                    <View style={[styles.highlightEditor, { backgroundColor: secondaryBg }]}>
                                        <Text style={[styles.editorLabel, { color: mutedForeground }]}>{editFlipped ? t('feedAnswerChip') : t('deckDetailsQuestionLabel')}</Text>
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
                                            <Text style={[styles.miniFlipText, { color: textColor }]}>{t('deckDetailsSwitchSide')}</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <>
                                        <View style={{ gap: 10 }}>
                                            <CardTextInput
                                                label={t('swipeQuestion')}
                                                value={editQuestion}
                                                onChangeText={setEditQuestion}
                                                multiline
                                            />
                                            <CardImagePicker text={editQuestion} onChangeText={setEditQuestion} />
                                        </View>
                                        <View style={{ gap: 10 }}>
                                            <CardTextInput
                                                label={t('swipeAnswer')}
                                                value={editAnswer}
                                                onChangeText={setEditAnswer}
                                                multiline
                                            />
                                            <CardImagePicker text={editAnswer} onChangeText={setEditAnswer} />
                                        </View>
                                    </>
                                )}
                                <Button
                                    title={t('saveChanges')}
                                    onPress={handleUpdateCard}
                                    style={{ marginTop: 12, height: 56, borderRadius: 16 }}
                                />
                            </View>
                        </ScrollView>
            </BottomSheet>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    headerDashboard: {
        padding: 20,
        gap: 14,
    },
    mainProgressCard: {
        padding: 18,
        borderRadius: 24,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 14,
        elevation: 5,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
    },
    progressCircleContainer: {
        width: 68,
        height: 68,
        borderRadius: 34,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 4,
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
    },
    cardSearchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: 16,
        paddingHorizontal: 14,
        height: 44,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
    },
    cardSearchInput: {
        flex: 1,
        fontSize: 14,
        fontWeight: '500',
        height: '100%',
    },
    filterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 12,
    },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 16,
    },
    filterChipText: {
        fontSize: 12,
        fontWeight: '700',
    },
    resetLink: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
        textDecorationLine: 'underline',
    },
    filterResultText: {
        fontSize: 12,
        fontWeight: '600',
        marginTop: 10,
        marginLeft: 4,
    },
    optionsCard: {
        borderRadius: 18,
        paddingHorizontal: 16,
        paddingVertical: 4,
    },
    optionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        minHeight: 48,
    },
    optionLabel: {
        fontSize: 11,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    optionChips: {
        flexDirection: 'row',
        gap: 6,
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
        flexShrink: 1,
    },
    optionDivider: {
        height: 1,
        opacity: 0.6,
    },
    progressStatsRight: {
        flex: 1,
        marginLeft: 16,
    },
    deckTitleRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 10,
        marginBottom: 6,
    },
    deckActions: {
        flexDirection: 'row',
        gap: 6,
        flexShrink: 0,
    },
    deckTitleLarge: {
        flex: 1,
        fontSize: 22,
        fontWeight: '800',
        letterSpacing: -0.5,
        lineHeight: 27,
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
    imagePlaceholder: {
        opacity: 0.45,
        fontStyle: 'italic',
    },
    wordTextHighlightFront: {
        fontSize: 18,
    },
    studyBlock: {
        gap: 10,
    },
    modeRow: {
        flexDirection: 'row',
        gap: 10,
    },
    modeTile: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 12,
        borderRadius: 16,
    },
    modeTileText: {
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: -0.2,
    },
    confusionSection: {
        marginHorizontal: 4,
        marginBottom: 16,
        gap: 10,
    },
    confusionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    confusionTitle: {
        fontSize: 15,
        fontWeight: '800',
    },
    drillBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 12,
    },
    drillBtnText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '900',
    },
    confusionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: 18,
        padding: 14,
        borderLeftWidth: 3,
        borderLeftColor: '#f59e0b',
    },
    confusionQ: {
        fontSize: 14,
        fontWeight: '700',
    },
    confusionA: {
        fontSize: 12,
        fontWeight: '600',
        marginTop: 2,
    },
    confusionBadge: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
    },
    confusionBadgeText: {
        fontSize: 13,
        fontWeight: '900',
        color: '#f59e0b',
    },
    mainActionBtn: {
        height: 56,
        borderRadius: 18,
    },
    wordTextHighlighted: {
        fontWeight: '800',
        color: '#000',
    }
});
