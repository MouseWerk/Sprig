import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// All calls are wrapped so a missing permission, an unsupported platform
// (web / Expo Go limitations), or any native error can never crash a study
// session — notifications are a nice-to-have, not load-bearing.

const STREAK_REMINDER_ID_KEY = 'csvtudyapp_streak_reminder_id';
let handlerConfigured = false;
let permissionGranted: boolean | null = null;

function configureHandler() {
    if (handlerConfigured) return;
    handlerConfigured = true;
    try {
        Notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldShowBanner: true,
                shouldShowList: true,
                shouldPlaySound: true,
                shouldSetBadge: false,
            }),
        });
    } catch {
        // ignore
    }
}

export async function ensureNotificationPermissions(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    if (permissionGranted !== null) return permissionGranted;
    try {
        configureHandler();
        const current = await Notifications.getPermissionsAsync();
        let status = current.status;
        if (status !== 'granted') {
            const req = await Notifications.requestPermissionsAsync();
            status = req.status;
        }
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'Study reminders',
                importance: Notifications.AndroidImportance.DEFAULT,
            });
        }
        permissionGranted = status === 'granted';
    } catch {
        permissionGranted = false;
    }
    return permissionGranted;
}

// Fire a notification after `seconds` warning that the focus plant wilted.
// Returns the scheduled id so it can be cancelled on a timely return.
export async function scheduleFocusWarning(seconds: number): Promise<string | null> {
    if (Platform.OS === 'web') return null;
    try {
        const granted = await ensureNotificationPermissions();
        if (!granted) return null;
        return await Notifications.scheduleNotificationAsync({
            content: {
                title: '🥀 Your focus plant wilted!',
                body: 'You left the app during a focus session. Come back to replant and keep studying.',
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                seconds: Math.max(1, Math.round(seconds)),
                repeats: false,
            },
        });
    } catch {
        return null;
    }
}

export async function cancelNotification(id: string | null): Promise<void> {
    if (!id) return;
    try {
        await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
        // ignore
    }
}

// Schedule a single "keep your streak alive" reminder ~20 hours out,
// replacing any previously scheduled one. Called after a study session.
export async function scheduleStreakReminder(): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
        const granted = await ensureNotificationPermissions();
        if (!granted) return;

        const prevId = await AsyncStorage.getItem(STREAK_REMINDER_ID_KEY);
        if (prevId) {
            await cancelNotification(prevId);
        }

        const id = await Notifications.scheduleNotificationAsync({
            content: {
                title: '🔥 Keep your streak alive!',
                body: 'A few cards today keeps your streak growing. Ready for a quick session?',
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                seconds: 20 * 60 * 60, // ~20 hours
                repeats: false,
            },
        });
        await AsyncStorage.setItem(STREAK_REMINDER_ID_KEY, id);
    } catch {
        // ignore
    }
}
