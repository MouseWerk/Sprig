import { useLanguage } from '@/contexts/LanguageContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getUserStats, UserStats } from '@/utils/Storage';
import { Stack, useFocusEffect } from 'expo-router';
import * as Icons from 'lucide-react-native';
import { Lock } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ACHIEVEMENTS, achievementProgress, AchievementDef, isUnlocked, progressLabel, unlockedCount } from '../utils/Achievements';

export default function AchievementsScreen() {
    const insets = useSafeAreaInsets();
    const { t } = useLanguage();
    const [stats, setStats] = useState<UserStats | null>(null);

    const backgroundColor = useThemeColor({}, 'background');
    const textColor = useThemeColor({}, 'text');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const secondaryBg = useThemeColor({}, 'secondary');
    const primaryColor = useThemeColor({}, 'primary');

    useFocusEffect(
        useCallback(() => {
            getUserStats().then(setStats).catch(() => { });
        }, [])
    );

    const total = ACHIEVEMENTS.length;
    const unlocked = stats ? unlockedCount(stats) : 0;
    const overallProgress = total > 0 ? unlocked / total : 0;

    const renderCard = (a: AchievementDef) => {
        const Icon = ((Icons as any)[a.icon] || Icons.Award) as React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
        const done = stats ? isUnlocked(stats, a) : false;
        const progress = stats ? achievementProgress(stats, a) : 0;

        return (
            <View
                key={a.id}
                style={[
                    styles.card,
                    { backgroundColor: secondaryBg, borderColor: done ? a.color + '55' : 'transparent' },
                ]}
            >
                <View style={[
                    styles.iconCircle,
                    { backgroundColor: done ? a.color + '22' : mutedForeground + '15' },
                ]}>
                    <Icon size={28} color={done ? a.color : mutedForeground} strokeWidth={2.25} />
                    {!done && (
                        <View style={[styles.lockBadge, { backgroundColor: secondaryBg }]}>
                            <Lock size={11} color={mutedForeground} strokeWidth={3} />
                        </View>
                    )}
                </View>

                <Text
                    style={[styles.cardTitle, { color: done ? textColor : mutedForeground }]}
                    numberOfLines={1}
                >
                    {t(a.titleKey)}
                </Text>
                <Text style={[styles.cardDesc, { color: mutedForeground }]} numberOfLines={2}>
                    {t(a.descriptionKey)}
                </Text>

                {done ? (
                    <View style={[styles.unlockedPill, { backgroundColor: a.color + '22' }]}>
                        <Text style={[styles.unlockedText, { color: a.color }]}>{t('achvUnlocked')}</Text>
                    </View>
                ) : (
                    <View style={styles.progressWrap}>
                        <View style={[styles.progressTrack, { backgroundColor: mutedForeground + '20' }]}>
                            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: a.color }]} />
                        </View>
                        <Text style={[styles.progressCaption, { color: mutedForeground }]}>
                            {stats ? progressLabel(stats, a) : ''}
                        </Text>
                    </View>
                )}
            </View>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor }]}>
            <Stack.Screen options={{
                title: t('statsAchievements'),
                headerStyle: { backgroundColor },
                headerTintColor: textColor,
                headerShadowVisible: false,
            }} />

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
            >
                <View style={[styles.summary, { backgroundColor: secondaryBg }]}>
                    <View style={styles.summaryTop}>
                        <Text style={[styles.summaryCount, { color: textColor }]}>{unlocked}</Text>
                        <Text style={[styles.summaryTotal, { color: mutedForeground }]}>{t('achvOfUnlocked').replace('{n}', String(total))}</Text>
                    </View>
                    <View style={[styles.summaryTrack, { backgroundColor: primaryColor + '20' }]}>
                        <View style={[styles.summaryFill, { width: `${Math.round(overallProgress * 100)}%`, backgroundColor: primaryColor }]} />
                    </View>
                    <Text style={[styles.summaryHint, { color: mutedForeground }]}>
                        {unlocked === total ? t('achvCollectedAll') : t('achvKeepStudying')}
                    </Text>
                </View>

                <View style={styles.grid}>
                    {ACHIEVEMENTS.map(renderCard)}
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    summary: {
        borderRadius: 24,
        padding: 20,
        marginBottom: 24,
    },
    summaryTop: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 8,
        marginBottom: 14,
    },
    summaryCount: {
        fontSize: 40,
        fontWeight: '900',
        letterSpacing: -1,
    },
    summaryTotal: {
        fontSize: 16,
        fontWeight: '700',
    },
    summaryTrack: {
        height: 8,
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 12,
    },
    summaryFill: {
        height: '100%',
        borderRadius: 4,
    },
    summaryHint: {
        fontSize: 13,
        fontWeight: '600',
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    card: {
        width: '48.5%',
        borderRadius: 22,
        padding: 16,
        marginBottom: 14,
        borderWidth: 1.5,
    },
    iconCircle: {
        width: 56,
        height: 56,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
    },
    lockBadge: {
        position: 'absolute',
        right: -2,
        bottom: -2,
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: '800',
        letterSpacing: -0.2,
        marginBottom: 4,
    },
    cardDesc: {
        fontSize: 12,
        lineHeight: 16,
        marginBottom: 12,
        minHeight: 32,
    },
    unlockedPill: {
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
    },
    unlockedText: {
        fontSize: 11,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    progressWrap: {
        gap: 6,
    },
    progressTrack: {
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 3,
    },
    progressCaption: {
        fontSize: 11,
        fontWeight: '700',
    },
});
