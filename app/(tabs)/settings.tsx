import { useCustomTheme } from '@/components/ThemeProvider';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import MongoDBClient from '@/utils/MongoDBClient';
import { getDecks } from '@/utils/Storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { Stack, useRouter } from 'expo-router';
import {
    ChevronRight,
    CircleUser,
    Cloud,
    CloudOff,
    Database,
    Github,
    Info,
    LogOut,
    Monitor,
    Moon,
    RefreshCw,
    ShieldCheck,
    Smartphone,
    Sun,
    Wifi
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    Share,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SettingsScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { user, logout } = useAuth();

    // UI Colors
    const backgroundColor = useThemeColor({}, 'background');
    const cardColor = useThemeColor({}, 'card');
    const textColor = useThemeColor({}, 'text');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const accentColor = useThemeColor({}, 'primary');
    const secondaryBg = useThemeColor({}, 'secondary');
    const borderColor = useThemeColor({}, 'border');

    const { mode, setThemeMode, theme } = useCustomTheme();
    const { showToast } = useToast();
    const { t } = useLanguage();
    const [deckCount, setDeckCount] = useState(0);
    const [isOnline, setIsOnline] = useState(false);
    const [lastSync, setLastSync] = useState<string | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [dbConnected, setDbConnected] = useState(false);

    const isDarkMode = theme === 'dark';

    const handleLogout = () => {
        Alert.alert(
            'Logout',
            'Are you sure you want to logout? Your data will be kept on the server.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Logout',
                    style: 'destructive',
                    onPress: async () => {
                        await logout();
                        router.replace('/login');
                    }
                }
            ]
        );
    };

    useEffect(() => {
        async function fetchStats() {
            try {
                const decks = await getDecks();
                setDeckCount(decks.length);
                
                // Check network status safely
                try {
                    const netState = await NetInfo.fetch();
                    setIsOnline(netState.isConnected ?? false);
                } catch (e) {
                    console.log('NetInfo error:', e);
                    setIsOnline(false);
                }
                
                // Check last sync
                const lastSyncTime = await AsyncStorage.getItem('lastSync');
                setLastSync(lastSyncTime);
                
                // Check DB connection
                checkDBConnection();
            } catch (error) {
                console.log('Settings error:', error);
            }
        }
        fetchStats();
        
        // Listen to network changes
        let unsubscribe: (() => void) | undefined;
        try {
            unsubscribe = NetInfo.addEventListener(state => {
                setIsOnline(state.isConnected ?? false);
            });
        } catch (e) {
            console.log('NetInfo listener error:', e);
        }
        
        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    const checkDBConnection = async () => {
        try {
            // Try to ping MongoDB
            const data = await MongoDBClient.find('decks');
            setDbConnected(true);
        } catch (error) {
            console.log('DB connection error:', error);
            setDbConnected(false);
        }
    };

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            console.log('Starting sync...');
            // Sync all data
            await MongoDBClient.syncQueue();
            const now = new Date().toISOString();
            await AsyncStorage.setItem('lastSync', now);
            setLastSync(now);
            showToast({ message: t('syncComplete'), type: 'success' });
            await checkDBConnection();
        } catch (error: any) {
            console.error('Sync error in settings:', error);
            showToast({ message: `${t('syncFailed')}: ${error.message || 'Unknown error'}`, type: 'error' });
        } finally {
            setIsSyncing(false);
        }
    };

    const formatLastSync = (timestamp: string | null) => {
        if (!timestamp) return t('never');
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        return date.toLocaleDateString();
    };

    const toggleTheme = async () => {
        const nextMode = isDarkMode ? 'light' : 'dark';
        await setThemeMode(nextMode);
    };

    const handleClearCache = () => {
        Alert.alert(
            'Clear Cache',
            'This will clear all temporary data but keep your flashcards. Continue?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: async () => {
                        const keys = await AsyncStorage.getAllKeys();
                        const cacheKeys = keys.filter(k => k.startsWith('csvtudyapp_cache_'));
                        await AsyncStorage.multiRemove(cacheKeys);
                        showToast({ message: 'Cache cleared successfully!', type: 'success' });
                    }
                }
            ]
        );
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
                <View style={[styles.profileCard, { backgroundColor: secondaryBg }]}>
                    <View style={[styles.avatar, { backgroundColor: accentColor }]}>
                        <CircleUser size={40} color="#fff" />
                    </View>
                    <View style={styles.profileInfo}>
                        <Text style={[styles.profileName, { color: textColor }]}>{user?.name || 'User'}</Text>
                        <Text style={[styles.profileSub, { color: mutedForeground }]}>{user?.email}</Text>
                    </View>
                </View>

                <SectionHeader title="ACCOUNT" />
                <View style={styles.group}>
                    <SettingItem
                        icon={LogOut}
                        label="Logout"
                        onPress={handleLogout}
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

                <SectionHeader title={t('syncSettings').toUpperCase()} />
                <View style={styles.group}>
                    <View style={[styles.item, { backgroundColor: cardColor }]}>
                        <View style={[styles.iconContainer, { backgroundColor: secondaryBg }]}>
                            {isOnline ? (
                                <Wifi size={20} color={accentColor} strokeWidth={2.5} />
                            ) : (
                                <CloudOff size={20} color={mutedForeground} strokeWidth={2.5} />
                            )}
                        </View>
                        <Text style={[styles.itemLabel, { color: textColor }]}>{t('networkStatus')}</Text>
                        <View style={[styles.statusBadge, { backgroundColor: isOnline ? '#10b981' : '#ef4444' }]}>
                            <Text style={styles.statusText}>{isOnline ? t('online') : t('offline')}</Text>
                        </View>
                    </View>
                    
                    <View style={[styles.item, { backgroundColor: cardColor }]}>
                        <View style={[styles.iconContainer, { backgroundColor: secondaryBg }]}>
                            {dbConnected ? (
                                <Cloud size={20} color={accentColor} strokeWidth={2.5} />
                            ) : (
                                <CloudOff size={20} color={mutedForeground} strokeWidth={2.5} />
                            )}
                        </View>
                        <Text style={[styles.itemLabel, { color: textColor }]}>{t('databaseConnection')}</Text>
                        <View style={[styles.statusBadge, { backgroundColor: dbConnected ? '#10b981' : '#6b7280' }]}>
                            <Text style={styles.statusText}>{dbConnected ? t('connected') : t('disconnected')}</Text>
                        </View>
                    </View>
                    
                    <View style={[styles.item, { backgroundColor: cardColor }]}>
                        <View style={[styles.iconContainer, { backgroundColor: secondaryBg }]}>
                            <RefreshCw size={20} color={accentColor} strokeWidth={2.5} />
                        </View>
                        <Text style={[styles.itemLabel, { color: textColor }]}>{t('lastSync')}</Text>
                        <Text style={[styles.itemValue, { color: mutedForeground }]}>{formatLastSync(lastSync)}</Text>
                    </View>
                    
                    <TouchableOpacity
                        style={[styles.item, { backgroundColor: cardColor }]}
                        onPress={handleSync}
                        disabled={isSyncing}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.iconContainer, { backgroundColor: accentColor }]}>
                            {isSyncing ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Database size={20} color="#fff" strokeWidth={2.5} />
                            )}
                        </View>
                        <Text style={[styles.itemLabel, { color: textColor }]}>
                            {isSyncing ? t('syncing') : t('syncNow')}
                        </Text>
                        <ChevronRight size={18} color={mutedForeground} />
                    </TouchableOpacity>
                </View>

                <SectionHeader title="COMMUNITY" />
                <View style={styles.group}>
                    <SettingItem icon={Github} label="Github Repository" onPress={() => { }} />
                    <SettingItem icon={Smartphone} label="Share with Friends" onPress={handleShare} />
                </View>

                <SectionHeader title="ABOUT" />
                <View style={styles.group}>
                    <SettingItem icon={Info} label="Version" value="1.2.4" />
                    <SettingItem icon={Info} label="Build Number" value="1024" />
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
    profileCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
        borderRadius: 24,
        marginBottom: 32,
    },
    avatar: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    profileInfo: {
        marginLeft: 16,
    },
    profileName: {
        fontSize: 20,
        fontWeight: '800',
    },
    profileSub: {
        fontSize: 14,
        fontWeight: '500',
        marginTop: 2,
    },
    sectionHeader: {
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 1.2,
        marginBottom: 12,
        marginLeft: 4,
        textTransform: 'uppercase',
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
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '800',
        textTransform: 'uppercase',
    }
});
