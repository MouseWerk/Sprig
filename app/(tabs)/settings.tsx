import ReviewHeatmap from '@/components/ReviewHeatmap';
import { useCustomTheme } from '@/components/ThemeProvider';
import { useToast } from '@/components/ui/Toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getDecks, getUserStats, UserStats } from '@/utils/Storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Stack, useFocusEffect } from 'expo-router';
import {
    Award,
    BookOpen,
    ChevronRight,
    Clock,
    Database,
    Flame,
    Github,
    Info,
    Monitor,
    Moon,
    ShieldCheck,
    Smartphone,
    Sun,
    TrendingUp
} from 'lucide-react-native';
import React, { useState } from 'react';
import {
    ScrollView,
    Share,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConfirm } from '@/components/ui/ConfirmDialog';

export default function SettingsScreen() {
    const insets = useSafeAreaInsets();

    // UI Colors
    const backgroundColor = useThemeColor({}, 'background');
    const cardColor = useThemeColor({}, 'card');
    const textColor = useThemeColor({}, 'text');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const accentColor = useThemeColor({}, 'primary');
    const secondaryBg = useThemeColor({}, 'secondary');

    const { mode, setThemeMode, theme } = useCustomTheme();
    const { showToast } = useToast();
    const confirm = useConfirm();
    const { t } = useLanguage();
    const [deckCount, setDeckCount] = useState(0);
    const [stats, setStats] = useState<UserStats | null>(null);

    const isDarkMode = theme === 'dark';

    // Refresh stats whenever the tab regains focus (e.g. after a study session)
    useFocusEffect(
        React.useCallback(() => {
            async function fetchStats() {
                try {
                    const [decks, userStats] = await Promise.all([getDecks(), getUserStats()]);
                    setDeckCount(decks.length);
                    setStats(userStats);
                } catch (error) {
                    console.log('Settings error:', error);
                }
            }
            fetchStats();
        }, [])
    );

    const formatStudyTime = (seconds: number) => {
        if (seconds < 60) return `${seconds}s`;
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    };

    const toggleTheme = async () => {
        const nextMode = isDarkMode ? 'light' : 'dark';
        await setThemeMode(nextMode);
    };

    const handleClearCache = async () => {
        const ok = await confirm({
            title: 'Clear Cache',
            message: 'This will clear all temporary data but keep your flashcards. Continue?',
            confirmText: 'Clear',
            destructive: true,
        });
        if (!ok) return;
        const keys = await AsyncStorage.getAllKeys();
        const cacheKeys = keys.filter(k => k.startsWith('csvtudyapp_cache_'));
        await AsyncStorage.multiRemove(cacheKeys);
        showToast({ message: 'Cache cleared successfully!', type: 'success' });
    };

    const handleShare = async () => {
        try {
            await Share.share({
                message: 'Check out FlashMaster - The ultimate flashcard app for CSV and PDF study! 🚀🎓',
            });
        } catch (error) {
            console.error(error);
        }
    };

    const SettingItem = ({ icon: Icon, label, value, onPress, toggle, rightElement }: any) => (
        <TouchableOpacity
            style={[styles.item, { backgroundColor: cardColor }]}
            onPress={onPress}
            activeOpacity={onPress ? 0.7 : 1}
        >
            <View style={[styles.iconContainer, { backgroundColor: secondaryBg }]}>
                <Icon size={20} color={accentColor} strokeWidth={2.5} />
            </View>
            <Text style={[styles.itemLabel, { color: textColor }]}>{label}</Text>
            {value && <Text style={[styles.itemValue, { color: mutedForeground }]}>{value}</Text>}
            {toggle !== undefined && (
                <Switch
                    value={toggle}
                    onValueChange={onPress}
                    trackColor={{ false: '#767577', true: accentColor }}
                    thumbColor="#f4f3f4"
                />
            )}
            {rightElement}
            {onPress && !toggle && !rightElement && <ChevronRight size={18} color={mutedForeground} />}
        </TouchableOpacity>
    );

    const SectionHeader = ({ title }: { title: string }) => (
        <Text style={[styles.sectionHeader, { color: mutedForeground }]}>{title}</Text>
    );

    return (
        <View style={[styles.container, { backgroundColor }]}>
            <Stack.Screen options={{
                headerShown: true,
                title: t('settings_title'),
                headerLargeTitle: true,
                headerShadowVisible: false,
                headerStyle: { backgroundColor },
                headerTintColor: textColor,
            }} />

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: 20, paddingTop: 10, paddingBottom: insets.bottom + 40 }}
            >
                <SectionHeader title="ACTIVITY" />
                <View style={[styles.heatmapCard, { backgroundColor: cardColor }]}>
                    <ReviewHeatmap data={stats?.dailyReviews} />
                </View>

                <SectionHeader title="YOUR PROGRESS" />
                <View style={styles.group}>
                    <SettingItem
                        icon={BookOpen}
                        label="Cards Reviewed"
                        value={`${stats?.totalCardsReviewed ?? 0}`}
                    />
                    <SettingItem
                        icon={Clock}
                        label="Study Time"
                        value={formatStudyTime(stats?.totalStudyTime ?? 0)}
                    />
                    <SettingItem
                        icon={Flame}
                        label="Current Streak"
                        value={`${stats?.currentStreak ?? 0} day${(stats?.currentStreak ?? 0) === 1 ? '' : 's'}`}
                    />
                    <SettingItem
                        icon={TrendingUp}
                        label="Longest Streak"
                        value={`${stats?.longestStreak ?? 0} day${(stats?.longestStreak ?? 0) === 1 ? '' : 's'}`}
                    />
                    <SettingItem
                        icon={Award}
                        label="Achievements"
                        value={`${stats?.achievements?.length ?? 0} / 3`}
                    />
                    <SettingItem
                        icon={Database}
                        label="Decks"
                        value={`${deckCount}`}
                    />
                </View>

                <SectionHeader title={t('theme').toUpperCase()} />
                <View style={styles.group}>
                    <SettingItem
                        icon={isDarkMode ? Moon : Sun}
                        label={t('dark') + ' Mode'}
                        toggle={isDarkMode}
                        onPress={toggleTheme}
                    />
                    <SettingItem
                        icon={Monitor}
                        label={'Use ' + t('system') + ' Theme'}
                        toggle={mode === 'system'}
                        onPress={() => setThemeMode(mode === 'system' ? (theme || 'light') : 'system')}
                    />
                </View>

                <SectionHeader title="STORAGE & DATA" />
                <View style={styles.group}>
                    <SettingItem
                        icon={Database}
                        label="Clear Cache"
                        onPress={handleClearCache}
                    />
                    <SettingItem icon={ShieldCheck} label="Privacy Policy" onPress={() => { }} />
                </View>

                <SectionHeader title="COMMUNITY" />
                <View style={styles.group}>
                    <SettingItem icon={Github} label="Github Repository" onPress={() => { }} />
                    <SettingItem icon={Smartphone} label="Share with Friends" onPress={handleShare} />
                </View>

                <SectionHeader title="ABOUT" />
                <View style={styles.group}>
                    <SettingItem icon={Info} label="Version" value={Constants.expoConfig?.version ?? '1.0.0'} />
                </View>

                <View style={styles.footer}>
                    <Text style={[styles.footerText, { color: mutedForeground }]}>Made with ❤️ for Learners</Text>
                    <Text style={[styles.footerVersion, { color: mutedForeground }]}>FlashMaster © 2026</Text>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    sectionHeader: {
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 1.2,
        marginBottom: 12,
        marginLeft: 4,
        textTransform: 'uppercase',
    },
    heatmapCard: {
        borderRadius: 24,
        padding: 16,
        marginBottom: 28,
        alignItems: 'center',
    },
    group: {
        borderRadius: 24,
        overflow: 'hidden',
        marginBottom: 28,
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
    footer: {
        alignItems: 'center',
        marginTop: 20,
        gap: 4,
    },
    footerText: {
        fontSize: 13,
        fontWeight: '600',
    },
    footerVersion: {
        fontSize: 11,
        fontWeight: '500',
        opacity: 0.6,
    },
});
