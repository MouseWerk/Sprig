import { ReviewHeatmap } from '@/components/ReviewHeatmap';
import { LevelCard } from '@/components/LevelCard';
import { useThemeColor } from '@/hooks/use-theme-color';
import { ACHIEVEMENTS, unlockedCount } from '@/utils/Achievements';
import { getLevelInfo } from '@/utils/Levels';
import { getDecks, getUserStats, UserStats } from '@/utils/Storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { Award, BookOpen, ChevronRight, Clock, Database, Flame, Snowflake, TrendingUp, Zap } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

    useFocusEffect(
        useCallback(() => {
            Promise.all([getUserStats(), getDecks()])
                .then(([userStats, decks]) => {
                    setStats(userStats);
                    setDeckCount(decks.length);
                })
                .catch(() => { });
        }, [])
    );

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

                <SectionHeader title="ACTIVITY" />
                <View style={[styles.heatmapCard, { backgroundColor: cardColor }]}>
                    <ReviewHeatmap data={stats?.dailyReviews} />
                </View>

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
