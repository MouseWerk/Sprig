import { useThemeColor } from '@/hooks/use-theme-color';
import { FlashcardData, parseFlashcardsCsv } from '@/utils/CsvParser';
import { getCachedData, recordConfusion, recordQuizCompleted, setCachedData, updateUserStats } from '@/utils/Storage';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Check, FileWarning, Trophy, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MarkdownRenderer from '../components/MarkdownRenderer';
import { Button } from '../components/ui/Button';

interface QuizOption {
    text: string;
    cardIndex: number; // which card this answer belongs to (for confusion pairs)
}

interface Question {
    prompt: string;
    correct: string;
    cardIndex: number; // index of the prompt's card in the deck
    options: QuizOption[]; // shuffled, includes correct
}

const MAX_QUESTIONS = 20;

function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// Build multiple-choice questions: prompt = question, correct = its answer,
// distractors = three other cards' answers (deduped). Each answer remembers
// which card it came from so wrong picks can be logged as confusion pairs.
function buildQuestions(cards: FlashcardData[]): Question[] {
    const clean = cards
        .map((c, i) => ({ ...c, idx: i }))
        .filter(c => c.question?.trim() && c.answer?.trim());

    // First card owning each distinct answer text
    const ownerByAnswer = new Map<string, number>();
    for (const c of clean) {
        const a = c.answer.trim();
        if (!ownerByAnswer.has(a)) ownerByAnswer.set(a, c.idx);
    }
    const answers = Array.from(ownerByAnswer.keys());
    if (answers.length < 4) return [];

    return shuffle(clean).slice(0, MAX_QUESTIONS).map(card => {
        const correct = card.answer.trim();
        const distractors: QuizOption[] = [];
        const pool = shuffle(answers.filter(a => a !== correct));
        for (const a of pool) {
            if (distractors.length >= 3) break;
            distractors.push({ text: a, cardIndex: ownerByAnswer.get(a)! });
        }
        return {
            prompt: card.question,
            correct,
            cardIndex: card.idx,
            options: shuffle([{ text: correct, cardIndex: card.idx }, ...distractors]),
        };
    });
}

export default function QuizScreen() {
    const { id, uri, name } = useLocalSearchParams<{ id: string; uri: string; name?: string }>();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const [cards, setCards] = useState<FlashcardData[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [index, setIndex] = useState(0);
    const [selected, setSelected] = useState<string | null>(null);
    const [score, setScore] = useState(0);
    const [done, setDone] = useState(false);
    const lastTickRef = useRef(Date.now());

    const backgroundColor = useThemeColor({}, 'background');
    const textColor = useThemeColor({}, 'text');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const secondaryBg = useThemeColor({}, 'secondary');
    const primaryColor = useThemeColor({}, 'primary');
    const cardColor = useThemeColor({}, 'card');

    useEffect(() => {
        (async () => {
            if (!id || !uri) { setLoading(false); return; }
            try {
                let parsed = await getCachedData<FlashcardData[]>(id);
                if (!parsed) {
                    parsed = await parseFlashcardsCsv(uri);
                    if (parsed.length > 0) await setCachedData(id, parsed);
                }
                setCards(parsed || []);
            } catch (e) {
                console.error('Error loading quiz cards:', e);
                setCards([]);
            } finally {
                setLoading(false);
            }
        })();
    }, [id, uri]);

    const questions = useMemo(() => (cards ? buildQuestions(cards) : []), [cards]);
    const current = questions[index];

    const handleSelect = (option: QuizOption) => {
        if (selected) return; // already answered
        setSelected(option.text);
        const correct = option.text === current.correct;
        if (correct) {
            setScore(s => s + 1);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            // Remember which two cards got mixed up ("confusion pair")
            if (id) recordConfusion(id, current.cardIndex, option.cardIndex).catch(() => { });
        }
        // Feed the gamification: quiz answers grant XP + keep the streak alive
        const now = Date.now();
        const delta = Math.min(Math.round((now - lastTickRef.current) / 1000), 60);
        lastTickRef.current = now;
        updateUserStats(1, delta, correct ? 5 : 0).catch(() => { });
    };

    const handleNext = () => {
        if (index + 1 >= questions.length) {
            setDone(true);
            // Count the finished round for achievements + a small XP bonus
            recordQuizCompleted().catch(() => { });
        } else {
            setIndex(i => i + 1);
            setSelected(null);
        }
    };

    const restart = () => {
        setIndex(0);
        setSelected(null);
        setScore(0);
        setDone(false);
        lastTickRef.current = Date.now();
        // Re-shuffle by nudging cards reference
        setCards(c => (c ? [...c] : c));
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.center, { backgroundColor }]}>
                <Stack.Screen options={{ title: 'Quiz', headerStyle: { backgroundColor }, headerTintColor: textColor, headerShadowVisible: false }} />
                <ActivityIndicator size="large" color={primaryColor} />
            </View>
        );
    }

    if (questions.length === 0) {
        return (
            <View style={[styles.container, styles.center, { backgroundColor, paddingHorizontal: 32 }]}>
                <Stack.Screen options={{ title: 'Quiz', headerStyle: { backgroundColor }, headerTintColor: textColor, headerShadowVisible: false }} />
                <FileWarning size={48} color="#ef4444" strokeWidth={2} />
                <Text style={[styles.emptyTitle, { color: textColor }]}>Not enough cards</Text>
                <Text style={[styles.emptyText, { color: mutedForeground }]}>
                    Quiz mode needs at least 4 cards with distinct answers. Add more cards and try again.
                </Text>
                <Button title="Go Back" onPress={() => router.back()} style={{ marginTop: 8, width: 200 }} />
            </View>
        );
    }

    if (done) {
        const pct = Math.round((score / questions.length) * 100);
        return (
            <View style={[styles.container, styles.center, { backgroundColor, paddingBottom: insets.bottom }]}>
                <Stack.Screen options={{ title: name || 'Quiz', headerStyle: { backgroundColor }, headerTintColor: textColor, headerShadowVisible: false }} />
                <View style={[styles.trophyWrap, { backgroundColor: '#facc1520' }]}>
                    <Trophy size={56} color="#eab308" strokeWidth={1.5} />
                </View>
                <Text style={[styles.resultScore, { color: textColor }]}>{score} / {questions.length}</Text>
                <Text style={[styles.resultPct, { color: primaryColor }]}>{pct}% correct</Text>
                <Text style={[styles.emptyText, { color: mutedForeground }]}>
                    {pct >= 80 ? 'Excellent work! 🎉' : pct >= 50 ? 'Nice — keep practicing!' : 'Keep at it, you\'ll get there.'}
                </Text>
                <View style={{ width: '100%', maxWidth: 300, gap: 12, marginTop: 24 }}>
                    <Button title="Try Again" onPress={restart} style={{ height: 52 }} />
                    <Button title="Done" variant="secondary" onPress={() => router.back()} style={{ height: 52 }} />
                </View>
            </View>
        );
    }

    const answered = selected !== null;

    return (
        <View style={[styles.container, { backgroundColor, paddingBottom: insets.bottom + 16 }]}>
            <Stack.Screen options={{ title: name || 'Quiz', headerStyle: { backgroundColor }, headerTintColor: textColor, headerShadowVisible: false }} />

            <View style={styles.progressWrap}>
                <View style={[styles.progressTrack, { backgroundColor: secondaryBg }]}>
                    <View style={[styles.progressFill, { width: `${((index) / questions.length) * 100}%`, backgroundColor: primaryColor }]} />
                </View>
                <Text style={[styles.progressText, { color: mutedForeground }]}>
                    {index + 1} / {questions.length} · Score {score}
                </Text>
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                <View style={[styles.questionCard, { backgroundColor: cardColor, borderColor: secondaryBg }]}>
                    <Text style={[styles.qLabel, { color: mutedForeground }]}>QUESTION {index + 1}</Text>
                    <MarkdownRenderer content={current.prompt} fontSize={20} />
                </View>

                <View style={{ gap: 12, marginTop: 20 }}>
                    {current.options.map((option, i) => {
                        const isCorrect = option.text === current.correct;
                        const isChosen = option.text === selected;
                        let bg = cardColor;
                        let border = secondaryBg;
                        let icon = null;
                        if (answered) {
                            if (isCorrect) { bg = '#22c55e18'; border = '#22c55e'; icon = <Check size={18} color="#22c55e" strokeWidth={3} />; }
                            else if (isChosen) { bg = '#ef444418'; border = '#ef4444'; icon = <X size={18} color="#ef4444" strokeWidth={3} />; }
                        }
                        return (
                            <TouchableOpacity
                                key={i}
                                style={[styles.option, { backgroundColor: bg, borderColor: border }]}
                                onPress={() => handleSelect(option)}
                                activeOpacity={answered ? 1 : 0.7}
                                disabled={answered}
                            >
                                <View style={{ flex: 1 }}>
                                    <MarkdownRenderer content={option.text} fontSize={15} />
                                </View>
                                {icon}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView>

            {answered && (
                <View style={styles.footer}>
                    <Button
                        title={index + 1 >= questions.length ? 'See Results' : 'Next Question'}
                        onPress={handleNext}
                        style={{ height: 56 }}
                    />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { alignItems: 'center', justifyContent: 'center' },
    progressWrap: { paddingHorizontal: 20, paddingTop: 12, gap: 8 },
    progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 4 },
    progressText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
    scroll: { padding: 20 },
    questionCard: {
        borderRadius: 22, padding: 22, borderWidth: 1.5, minHeight: 120,
    } as any,
    qLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 1, marginBottom: 10 },
    option: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        borderRadius: 18, padding: 18, borderWidth: 2,
    },
    footer: { paddingHorizontal: 20, paddingTop: 8 },
    trophyWrap: {
        width: 110, height: 110, borderRadius: 55, alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    },
    resultScore: { fontSize: 44, fontWeight: '900', letterSpacing: -1 },
    resultPct: { fontSize: 20, fontWeight: '800', marginTop: 4, marginBottom: 12 },
    emptyTitle: { fontSize: 22, fontWeight: '900', marginTop: 16, marginBottom: 8, letterSpacing: -0.5 },
    emptyText: { fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 320 },
});
