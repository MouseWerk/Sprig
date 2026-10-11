import { useLanguage } from '@/contexts/LanguageContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getLevelInfo, rankLabelKey } from '@/utils/Levels';
import { getPrefsSync, subscribePrefs } from '@/utils/Preferences';
import { localDateKey, UserStats } from '@/utils/Storage';
import { Flame, Snowflake, Target, Zap } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LevelBadge } from './LevelBadge';

interface LevelCardProps {
    stats: UserStats;
    displayStreak: number;
}

// Home-screen gamification banner: level ring + rank + XP progress, plus a
// daily goal ring fed by today's review count.
export function LevelCard({ stats, displayStreak }: LevelCardProps) {
    const { t } = useLanguage();
    const textColor = useThemeColor({}, 'text');
    const successColor = useThemeColor({}, 'success');
    const streakColor = useThemeColor({}, 'streak');
    const infoColor = useThemeColor({}, 'info');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const secondaryBg = useThemeColor({}, 'secondary');
    const cardColor = useThemeColor({}, 'card');
    const primaryColor = useThemeColor({}, 'primary');

    const [dailyGoal, setDailyGoal] = useState(getPrefsSync().dailyGoal);
    useEffect(() => subscribePrefs(p => setDailyGoal(p.dailyGoal)), []);

    const info = getLevelInfo(stats.totalXp || 0);

    const today = localDateKey();
    const todayCount = stats.dailyReviews?.[today] || 0;
    const goalProgress = Math.min(1, todayCount / dailyGoal);
    const goalMet = todayCount >= dailyGoal;

    return (
        <View style={[styles.card, { backgroundColor: cardColor }]}>
            <View style={styles.topRow}>
                <LevelBadge
                    level={info.level}
                    progress={info.progress}
                    size={68}
                    color={primaryColor}
                    trackColor={primaryColor + '22'}
                    textColor={textColor}
                />
                <View style={styles.levelInfo}>
                    <Text style={[styles.rank, { color: textColor }]}>{t(rankLabelKey(info.rank))}</Text>
                    <View style={styles.xpRow}>
                        <Zap size={13} color={primaryColor} strokeWidth={2.5} fill={primaryColor} />
                        <Text style={[styles.xpText, { color: mutedForeground }]}>
                            {t('levelCardXpToNext').replace('{xp}', String(info.xpToNext)).replace('{level}', String(info.level + 1))}
                        </Text>
                    </View>
                    <View style={[styles.xpTrack, { backgroundColor: primaryColor + '18' }]}>
                        <View style={[styles.xpFill, { width: `${Math.round(info.progress * 100)}%`, backgroundColor: primaryColor }]} />
                    </View>
                </View>
            </View>

            <View style={[styles.divider, { backgroundColor: mutedForeground + '18' }]} />

            <View style={styles.statsRow}>
                <View style={styles.statItem}>
                    <View style={[styles.statIcon, { backgroundColor: streakColor + '1F' }]}>
                        <Flame size={18} color={streakColor} strokeWidth={2.5} fill={displayStreak > 0 ? streakColor : 'none'} />
                    </View>
                    <View>
                        <Text style={[styles.statValue, { color: textColor }]}>{displayStreak}</Text>
                        <View style={styles.streakLabelRow}>
                            <Text style={[styles.statLabel, { color: mutedForeground }]}>{t('levelCardDayStreak')}</Text>
                            {(stats.streakFreezes ?? 0) > 0 && (
                                <View style={[styles.freezeBadge, { backgroundColor: infoColor + '1F' }]}>
                                    <Snowflake size={10} color={infoColor} strokeWidth={2.5} />
                                    <Text style={[styles.freezeCount, { color: infoColor }]}>{stats.streakFreezes}</Text>
                                </View>
                            )}
                        </View>
                    </View>
                </View>

                <View style={[styles.statDivider, { backgroundColor: mutedForeground + '18' }]} />

                <View style={styles.statItem}>
                    <View style={[styles.statIcon, { backgroundColor: goalMet ? successColor + '1F' : primaryColor + '18' }]}>
                        <Target size={18} color={goalMet ? successColor : primaryColor} strokeWidth={2.5} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.statValue, { color: textColor }]}>
                            {Math.min(todayCount, dailyGoal)}<Text style={{ color: mutedForeground, fontSize: 13 }}> / {dailyGoal}</Text>
                        </Text>
                        <Text style={[styles.statLabel, { color: mutedForeground }]}>
                            {goalMet ? t('levelCardGoalReached') : t('levelCardDailyGoal')}
                        </Text>
                        <View style={[styles.goalTrack, { backgroundColor: secondaryBg }]}>
                            <View style={[styles.goalFill, { width: `${Math.round(goalProgress * 100)}%`, backgroundColor: goalMet ? successColor : primaryColor }]} />
                        </View>
                    </View>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 24,
        padding: 18,
        marginHorizontal: 10,
        marginBottom: 12,
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    levelInfo: {
        flex: 1,
        gap: 6,
    },
    rank: {
        fontSize: 20,
        fontWeight: '900',
        letterSpacing: -0.4,
    },
    xpRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    xpText: {
        fontSize: 12,
        fontWeight: '700',
    },
    xpTrack: {
        height: 7,
        borderRadius: 4,
        overflow: 'hidden',
    },
    xpFill: {
        height: '100%',
        borderRadius: 4,
    },
    divider: {
        height: 1,
        marginVertical: 16,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statItem: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    statDivider: {
        width: 1,
        height: 40,
        marginHorizontal: 14,
    },
    statIcon: {
        width: 36,
        height: 36,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statValue: {
        fontSize: 18,
        fontWeight: '900',
    },
    statLabel: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    streakLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    freezeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        paddingHorizontal: 5,
        paddingVertical: 1,
        borderRadius: 6,
    },
    freezeCount: {
        fontSize: 10,
        fontWeight: '900',
    },
    goalTrack: {
        height: 5,
        borderRadius: 3,
        overflow: 'hidden',
        marginTop: 5,
        width: '100%',
    },
    goalFill: {
        height: '100%',
        borderRadius: 3,
    },
});
