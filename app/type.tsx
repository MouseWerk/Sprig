import { useThemeColor } from '@/hooks/use-theme-color';
import * as Haptics from '@/utils/AppHaptics';
import { FlashcardData, parseFlashcardsCsv } from '@/utils/CsvParser';
import { AnswerVerdict, checkAnswer } from '@/utils/Fuzzy';
import { getCachedData, setCachedData, updateCardSRS, updateUserStats } from '@/utils/Storage';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Check, FileWarning, Keyboard, Trophy, X } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MarkdownRenderer from '../components/MarkdownRenderer';
import { Button } from '../components/ui/Button';

const MAX_CARDS = 20;

function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

interface TypeCard extends FlashcardData {
    originalIndex: number;
}

export default function TypeScreen() {
    const { id, uri, name } = useLocalSearchParams<{ id: string; uri: string; name?: string }>();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const [cards, setCards] = useState<TypeCard[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [index, setIndex] = useState(0);
    const [typed, setTyped] = useState('');
    const [verdict, setVerdict] = useState<AnswerVerdict | null>(null);
    const [overridden, setOverridden] = useState(false);
    const [score, setScore] = useState(0);
    const [done, setDone] = useState(false);
    const lastTickRef = useRef(Date.now());
    const inputRef = useRef<TextInput>(null);

    const backgroundColor = useThemeColor({}, 'background');
    const textColor = useThemeColor({}, 'text');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const secondaryBg = useThemeColor({}, 'secondary');
    const primaryColor = useThemeColor({}, 'primary');
    const cardColor = useThemeColor({}, 'card');
    const borderColor = useThemeColor({}, 'border');

    useEffect(() => {
        (async () => {
            if (!id || !uri) { setLoading(false); return; }
            try {
                let parsed = await getCachedData<FlashcardData[]>(id);
                if (!parsed) {
                    parsed = await parseFlashcardsCsv(uri);
                    if (parsed.length > 0) await setCachedData(id, parsed);
                }
                const enriched: TypeCard[] = (parsed || [])
                    .map((c, i) => ({ ...c, originalIndex: i }))
                    .filter(c => c.question?.trim() && c.answer?.trim());
                setCards(shuffle(enriched).slice(0, MAX_CARDS));
            } catch (e) {
                console.error('Error loading typing cards:', e);
                setCards([]);
            } finally {
                setLoading(false);
            }
        })();
    }, [id, uri]);

    const total = cards?.length ?? 0;
    const current = cards?.[index];

    const applyResult = (grade: number) => {
        if (!id || !current) return;
        updateCardSRS(id, current.originalIndex, grade).catch(() => { });
        const now = Date.now();
        const delta = Math.min(Math.round((now - lastTickRef.current) / 1000), 60);
        lastTickRef.current = now;
        updateUserStats(1, delta, grade).catch(() => { });
    };

    const handleCheck = () => {
        if (!current || verdict) return;
        const v = checkAnswer(typed, current.answer);
        setVerdict(v);
        if (v === 'exact' || v === 'close') {
            setScore(s => s + 1);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            applyResult(v === 'exact' ? 5 : 4);
        } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            applyResult(0);
        }
    };

    // "I was right": the fuzzy check judged too harshly (synonyms, alternate
    // phrasing). Count it as correct - trust over friction.
    const handleOverride = () => {
        if (verdict !== 'wrong' || overridden) return;
        setOverridden(true);
        setScore(s => s + 1);
        if (id && current) updateCardSRS(id, current.originalIndex, 4).catch(() => { });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const handleNext = () => {
        if (index + 1 >= total) {
            setDone(true);
        } else {
            setIndex(i => i + 1);
            setTyped('');
            setVerdict(null);
            setOverridden(false);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    };

    const restart = () => {
        setCards(c => (c ? shuffle(c) : c));
        setIndex(0);
        setTyped('');
        setVerdict(null);
        setOverridden(false);
        setScore(0);
        setDone(false);
        lastTickRef.current = Date.now();
    };

    const screenOpts = { headerStyle: { backgroundColor }, headerTintColor: textColor, headerShadowVisible: false };

    if (loading) {
        return (
            <View style={[styles.container, styles.center, { backgroundColor }]}>
                <Stack.Screen options={{ title: 'Type the Answer', ...screenOpts }} />
                <ActivityIndicator size="large" color={primaryColor} />
            </View>
        );
    }

    if (!cards || cards.length === 0) {
        return (
            <View style={[styles.container, styles.center, { backgroundColor, paddingHorizontal: 32 }]}>
                <Stack.Screen options={{ title: 'Type the Answer', ...screenOpts }} />
                <FileWarning size={48} color="#ef4444" strokeWidth={2} />
                <Text style={[styles.emptyTitle, { color: textColor }]}>No cards to practice</Text>
                <Text style={[styles.emptyText, { color: mutedForeground }]}>Add some cards to this deck first.</Text>
                <Button title="Go Back" onPress={() => router.back()} style={{ marginTop: 16, width: 200 }} />
            </View>
        );
    }

    if (done) {
        const pct = Math.round((score / total) * 100);
        return (
            <View style={[styles.container, styles.center, { backgroundColor, paddingBottom: insets.bottom }]}>
                <Stack.Screen options={{ title: name || 'Type the Answer', ...screenOpts }} />
                <View style={[styles.trophyWrap, { backgroundColor: '#facc1520' }]}>
                    <Trophy size={56} color="#eab308" strokeWidth={1.5} />
                </View>
                <Text style={[styles.resultScore, { color: textColor }]}>{score} / {total}</Text>
                <Text style={[styles.resultPct, { color: primaryColor }]}>{pct}% typed correctly</Text>
                <Text style={[styles.emptyText, { color: mutedForeground }]}>
                    {pct >= 80 ? 'Excellent recall!' : pct >= 50 ? 'Solid — typing makes it stick.' : 'Tough round. Try the same deck again.'}
                </Text>
                <View style={{ width: '100%', maxWidth: 300, gap: 12, marginTop: 24 }}>
                    <Button title="Try Again" onPress={restart} style={{ height: 52 }} />
                    <Button title="Done" variant="secondary" onPress={() => router.back()} style={{ height: 52 }} />
                </View>
            </View>
        );
    }

    const banner = verdict === null ? null : verdict === 'exact'
        ? { color: '#22c55e', label: 'Correct!' }
        : verdict === 'close'
            ? { color: '#22c55e', label: 'Close enough — counted as correct' }
            : overridden
                ? { color: '#22c55e', label: 'Counted as correct' }
                : { color: '#ef4444', label: 'Not quite' };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[styles.container, { backgroundColor }]}
        >
            <Stack.Screen options={{ title: name || 'Type the Answer', ...screenOpts }} />

            <View style={styles.progressWrap}>
                <View style={[styles.progressTrack, { backgroundColor: secondaryBg }]}>
                    <View style={[styles.progressFill, { width: `${(index / total) * 100}%`, backgroundColor: primaryColor }]} />
                </View>
                <Text style={[styles.progressText, { color: mutedForeground }]}>
                    {index + 1} / {total} · Score {score}
                </Text>
            </View>

            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={[styles.questionCard, { backgroundColor: cardColor, borderColor: secondaryBg }]}>
                    <View style={styles.qLabelRow}>
                        <Keyboard size={14} color={mutedForeground} strokeWidth={2.5} />
                        <Text style={[styles.qLabel, { color: mutedForeground }]}>TYPE THE ANSWER</Text>
                    </View>
                    <MarkdownRenderer content={current!.question} fontSize={20} />
                </View>

                <TextInput
                    ref={inputRef}
                    style={[styles.input, {
                        color: textColor,
                        backgroundColor: cardColor,
                        borderColor: banner ? banner.color : borderColor,
                    }]}
                    value={typed}
                    onChangeText={setTyped}
                    placeholder="Your answer…"
                    placeholderTextColor={mutedForeground}
                    editable={!verdict}
                    autoFocus
                    autoCorrect={false}
                    autoCapitalize="none"
                    multiline
                    onSubmitEditing={handleCheck}
                    blurOnSubmit
                    returnKeyType="done"
                    accessibilityLabel="Answer input"
                />

                {banner && (
                    <View style={[styles.banner, { backgroundColor: banner.color + '18' }]}>
                        {banner.color === '#22c55e'
                            ? <Check size={18} color={banner.color} strokeWidth={3} />
                            : <X size={18} color={banner.color} strokeWidth={3} />}
                        <Text style={[styles.bannerText, { color: banner.color }]}>{banner.label}</Text>
                    </View>
                )}

                {verdict && (
                    <View style={[styles.answerCard, { backgroundColor: secondaryBg }]}>
                        <Text style={[styles.answerLabel, { color: mutedForeground }]}>CORRECT ANSWER</Text>
                        <MarkdownRenderer content={current!.answer} fontSize={16} />
                    </View>
                )}

                {verdict === 'wrong' && !overridden && (
                    <TouchableOpacity onPress={handleOverride} style={styles.overrideLink} accessibilityRole="button" accessibilityLabel="Count my answer as correct">
                        <Text style={[styles.overrideText, { color: mutedForeground }]}>My answer was right — count it</Text>
                    </TouchableOpacity>
                )}
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                {verdict === null ? (
                    <Button
                        title="Check"
                        onPress={handleCheck}
                        style={{ height: 56 }}
                        disabled={typed.trim().length === 0}
                    />
                ) : (
                    <Button
                        title={index + 1 >= total ? 'See Results' : 'Next'}
                        onPress={handleNext}
                        style={{ height: 56 }}
                    />
                )}
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { alignItems: 'center', justifyContent: 'center' },
    progressWrap: { paddingHorizontal: 20, paddingTop: 12, gap: 8 },
    progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 4 },
    progressText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
    scroll: { padding: 20, gap: 14 },
    questionCard: { borderRadius: 22, padding: 22, borderWidth: 1.5 },
    qLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    qLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
    input: {
        borderRadius: 18, borderWidth: 2, paddingHorizontal: 18, paddingVertical: 14,
        fontSize: 17, fontWeight: '600', minHeight: 58, textAlignVertical: 'top',
    },
    banner: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
    },
    bannerText: { fontSize: 14, fontWeight: '800' },
    answerCard: { borderRadius: 18, padding: 16, gap: 6 },
    answerLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
    overrideLink: { alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 12 },
    overrideText: { fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
    footer: { paddingHorizontal: 20, paddingTop: 8 },
    trophyWrap: { width: 110, height: 110, borderRadius: 55, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    resultScore: { fontSize: 44, fontWeight: '900', letterSpacing: -1 },
    resultPct: { fontSize: 20, fontWeight: '800', marginTop: 4, marginBottom: 12 },
    emptyTitle: { fontSize: 22, fontWeight: '900', marginTop: 16, marginBottom: 8, letterSpacing: -0.5 },
    emptyText: { fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 320 },
});
