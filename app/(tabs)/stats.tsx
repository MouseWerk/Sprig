import { ReviewHeatmap } from '@/components/ReviewHeatmap';
import { LevelCard } from '@/components/LevelCard';
import { useThemeColor } from '@/hooks/use-theme-color';
import { ACHIEVEMENTS, unlockedCount } from '@/utils/Achievements';
import { getLevelInfo } from '@/utils/Levels';
import { getDecks, getHardestCards, getUserStats, HardCard, UserStats } from '@/utils/Storage';
import { startTodaySession, TodayDeckEntry } from '@/utils/TodayPlan';
import { useFocusEffect, useRouter } from 'expo-router';
import { Award, BookOpen, Brain, ChevronRight, Clock, Database, Flame, Snowflake, TrendingUp, Zap } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface WeekRecap {
    thisWeek: number;
    activeDays: number;
    bestDay: string | null;
    bestCount: number;
    deltaPct: number | null; // vs previous 7 days; null when last week was empty
}

// Sums the last 7 days (incl. today) and the 7 before from the per-day
// review counts the heatmap already stores.
function computeWeekRecap(dailyReviews: Record<string, number> | undefined): WeekRecap {
    const recap: WeekRecap = { thisWeek: 0, activeDays: 0, bestDay: null, bestCount: 0, deltaPct: null };
    if (!dailyReviews) return recap;
    let lastWeek = 0;
    for (let i = 0; i < 14; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        const n = dailyReviews[key] || 0;
        if (i < 7) {
            recap.thisWeek += n;
            if (n > 0) recap.activeDays++;
            if (n > recap.bestCount) {
                recap.bestCount = n;
                recap.bestDay = DAY_NAMES[d.getDay()];
            }
        } else {
            lastWeek += n;
        }
    }
    if (lastWeek > 0) {
        recap.deltaPct = Math.round(((recap.thisWeek - lastWeek) / lastWeek) * 100);
    }
    return recap;
}

export default function StatsScreen() {
    const insets = useSafeAreaInsets();

    const backgroundColor = useThemeColor({}, 'background');
    const cardColor = useThemeColor({}, 'card');
    const textColor = useThemeColor({}, 'text');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const accentColor = useThemeColor({}, 'primary');
    const secondaryBg = useThemeColor({}, 'secondary');

    const router = useRouter();
    const [stats, setStats] = useState<UserStats | null>(null);
    const [deckCount, setDeckCount] = useState(0);
    const [hardest, setHardest] = useState<HardCard[]>([]);

    useFocusEffect(
        useCallback(() => {
            Promise.all([getUserStats(), getDecks(), getHardestCards(8)])
                .then(([userStats, decks, hard]) => {
                    setStats(userStats);
                    setDeckCount(decks.length);
                    setHardest(hard);
                })
                .catch(() => { });
        }, [])
    );

    // Drill all listed hard cards, grouped per deck and chained like a
    // Today session.
    const drillHardest = () => {
        if (hardest.length === 0) return;
        const byDeck = new Map<string, TodayDeckEntry>();
        for (const c of hardest) {
            const entry = byDeck.get(c.deckId) ?? { deckId: c.deckId, deckName: c.deckName, uri: c.deckUri, cardIndices: [] };
            if (!entry.cardIndices.includes(c.cardIndex)) entry.cardIndices.push(c.cardIndex);
            byDeck.set(c.deckId, entry);
        }
        const entries = Array.from(byDeck.values());
        const first = startTodaySession({ entries, totalCards: hardest.length, dueCount: 0, examCount: 0, trickyCount: hardest.length });
        if (!first) return;
        router.push({
            pathname: '/swipe',
            params: {
                id: first.deckId,
                uri: first.uri,
                name: first.deckName,
                mode: 'all',
                cards: first.cardIndices.join(','),
                today: '1',
            },
        });
    };

    const recap = computeWeekRecap(stats?.dailyReviews);

    const formatStudyTime = (seconds: number) => {
        if (seconds < 60) return `${seconds}s`;
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    };

    // A streak only counts if the last study day was today or yesterday
    const displayStreak = (() => {
        if (!stats?.lastStudyDate) return 0;
        const last = stats.lastStudyDate.split('T')[0];
        const today = new Date().toISOString().split('T')[0];
        const y = new Date();
        y.setDate(y.getDate() - 1);
        const yesterday = y.toISOString().split('T')[0];
        return (last === today || last === yesterday) ? stats.currentStreak : 0;
    })();

    const level = getLevelInfo(stats?.totalXp ?? 0);
    const unlocked = stats ? unlockedCount(stats) : 0;

    const StatRow = ({ icon: Icon, label, value, onPress }: any) => (
        <TouchableOpacity
            style={[styles.item, { backgroundColor: cardColor }]}
            onPress={onPress}
            activeOpacity={onPress ? 0.7 : 1}
        >
            <View style={[styles.iconContainer, { backgroundColor: secondaryBg }]}>
                <Icon size={20} color={accentColor} strokeWidth={2.5} />
            </View>
            <Text style={[styles.itemLabel, { color: textColor }]}>{label}</Text>
            {value !== undefined && <Text style={[styles.itemValue, { color: mutedForeground }]}>{value}</Text>}
            {onPress && <ChevronRight size={18} color={mutedForeground} />}
        </TouchableOpacity>
    );

    const SectionHeader = ({ title }: { title: string }) => (
        <Text style={[styles.sectionHeader, { color: mutedForeground }]}>{title}</Text>
    );

    return (
        <View style={[styles.container, { backgroundColor }]}>
            <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
                <Text style={[styles.title, { color: textColor }]}>Stats</Text>
                <View style={[styles.levelPill, { backgroundColor: accentColor + '18' }]}>
                    <Zap size={13} color={accentColor} strokeWidth={2.5} fill={accentColor} />
                    <Text style={[styles.levelPillText, { color: accentColor }]}>Level {level.level}</Text>
                </View>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}
            >
                {stats && <LevelCard stats={stats} displayStreak={displayStreak} />}

                {recap.thisWeek > 0 && (
                    <>
                        <SectionHeader title="THIS WEEK" />
                        <View style={[styles.recapCard, { backgroundColor: cardColor }]}>
                            <View style={styles.recapTop}>
                                <Text style={[styles.recapBig, { color: textColor }]}>{recap.thisWeek}</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.recapLabel, { color: mutedForeground }]}>
                                        cards in the last 7 days
                                    </Text>
                                    {recap.deltaPct !== null && (
                                        <Text style={[styles.recapDelta, { color: recap.deltaPct >= 0 ? '#22c55e' : '#ef4444' }]}>
                                            {recap.deltaPct >= 0 ? '▲' : '▼'} {Math.abs(recap.deltaPct)}% vs the week before
                                        </Text>
                                    )}
                                </View>
                            </View>
                            <Text style={[styles.recapSub, { color: mutedForeground }]}>
                                {recap.activeDays} active day{recap.activeDays === 1 ? '' : 's'}
                                {recap.bestDay ? ` · best: ${recap.bestDay} (${recap.bestCount})` : ''}
                            </Text>
                        </View>
                    </>
                )}

                <SectionHeader title="ACTIVITY" />
                <View style={[styles.heatmapCard, { backgroundColor: cardColor }]}>
                    <ReviewHeatmap data={stats?.dailyReviews} />
                </View>

                {hardest.length > 0 && (
                    <>
                        <View style={styles.hardHeaderRow}>
                            <SectionHeader title="TOUGHEST CARDS" />
                            <TouchableOpacity
                                style={[styles.hardDrillBtn, { backgroundColor: accentColor }]}
                                onPress={drillHardest}
                                accessibilityLabel="Drill your toughest cards"
                                accessibilityRole="button"
                            >
                                <Brain size={13} color={backgroundColor} strokeWidth={2.5} />
                                <Text style={[styles.hardDrillText, { color: backgroundColor }]}>Drill</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.group}>
                            {hardest.map(c => (
                                <View key={`${c.deckId}-${c.cardIndex}`} style={[styles.item, { backgroundColor: cardColor }]}>
                                    <View style={[styles.hardDot, { backgroundColor: c.easeFactor <= 1.5 ? '#ef4444' : c.easeFactor <= 2.0 ? '#f97316' : '#eab308' }]} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.hardQuestion, { color: textColor }]} numberOfLines={1}>{c.question}</Text>
                                        <Text style={[styles.hardDeck, { color: mutedForeground }]} numberOfLines={1}>{c.deckName}</Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </>
                )}

                <SectionHeader title="LIFETIME" />
                <View style={styles.group}>
                    <StatRow icon={Zap} label="Level" value={`Lvl ${level.level} · ${level.rank}`} />
                    <StatRow icon={Zap} label="Total XP" value={`${(stats?.totalXp ?? 0).toLocaleString()} XP`} />
                    <StatRow icon={BookOpen} label="Cards Reviewed" value={`${stats?.totalCardsReviewed ?? 0}`} />
                    <StatRow icon={Clock} label="Study Time" value={formatStudyTime(stats?.totalStudyTime ?? 0)} />
                    <StatRow icon={Flame} label="Current Streak" value={`${stats?.currentStreak ?? 0} day${(stats?.currentStreak ?? 0) === 1 ? '' : 's'}`} />
                    <StatRow icon={TrendingUp} label="Longest Streak" value={`${stats?.longestStreak ?? 0} day${(stats?.longestStreak ?? 0) === 1 ? '' : 's'}`} />
                    <StatRow icon={Snowflake} label="Streak Freezes" value={`${stats?.streakFreezes ?? 0}`} />
                    <StatRow icon={Database} label="Decks" value={`${deckCount}`} />
                </View>

                <SectionHeader title="ACHIEVEMENTS" />
                <View style={styles.group}>
                    <StatRow
                        icon={Award}
                        label="Achievements"
                        value={`${unlocked} / ${ACHIEVEMENTS.length}`}
                        onPress={() => router.push('/achievements')}
                    />
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingBottom: 20,
    },
    title: {
        fontSize: 32,
        fontWeight: '900',
        letterSpacing: -1,
    },
    levelPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 14,
    },
    levelPillText: {
        fontSize: 13,
        fontWeight: '800',
    },
    sectionHeader: {
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 1.2,
        marginBottom: 12,
        marginTop: 20,
        marginLeft: 4,
        textTransform: 'uppercase',
    },
    heatmapCard: {
        borderRadius: 24,
        padding: 16,
        alignItems: 'center',
    },
    recapCard: {
        borderRadius: 24,
        padding: 18,
        gap: 8,
    },
    recapTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },
    recapBig: {
        fontSize: 40,
        fontWeight: '900',
        letterSpacing: -1,
    },
    recapLabel: {
        fontSize: 13,
        fontWeight: '600',
    },
    recapDelta: {
        fontSize: 12,
        fontWeight: '800',
        marginTop: 2,
    },
    recapSub: {
        fontSize: 12,
        fontWeight: '600',
    },
    hardHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingRight: 4,
    },
    hardDrillBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        marginTop: 8,
    },
    hardDrillText: {
        fontSize: 12,
        fontWeight: '900',
    },
    hardDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 14,
        marginLeft: 4,
    },
    hardQuestion: {
        fontSize: 14,
        fontWeight: '700',
    },
    hardDeck: {
        fontSize: 11,
        fontWeight: '600',
        marginTop: 1,
    },
    group: {
        borderRadius: 24,
        overflow: 'hidden',
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        paddingVertical: 14,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    itemLabel: {
        flex: 1,
        fontSize: 16,
        fontWeight: '600',
    },
    itemValue: {
        fontSize: 14,
        fontWeight: '500',
        marginRight: 8,
    },
});
