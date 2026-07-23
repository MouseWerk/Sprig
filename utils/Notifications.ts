import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { LANGUAGE_STORAGE_KEY } from '../contexts/LanguageContext';
import { Language, TranslationKey, translations } from '../constants/translations';
import { buildGrovePlants } from './Grove';
import { getPrefs } from './Preferences';
import { getDecks } from './Storage';
import { migrateKey } from './StorageMigration';

// All calls are wrapped so a missing permission, an unsupported platform
// (web / Expo Go limitations), or any native error can never crash a study
// session — notifications are a nice-to-have, not load-bearing.

const STREAK_REMINDER_ID_KEY = 'sprig_streak_reminder_id';
const LEGACY_STREAK_REMINDER_ID_KEY = 'csvtudyapp_streak_reminder_id';
let handlerConfigured = false;
let permissionGranted: boolean | null = null;

// Scheduled notifications fire outside any component tree, so there's no
// LanguageProvider to pull `t()` from — read the same AsyncStorage key
// LanguageContext saves the user's choice under instead.
async function tNotif(key: TranslationKey): Promise<string> {
    let lang: Language = 'en';
    try {
        const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (saved === 'en' || saved === 'de') lang = saved;
    } catch {
        // ignore — English fallback
    }
    return translations[lang][key] ?? translations.en[key] ?? key;
}

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
                title: await tNotif('notifFocusWiltedTitle'),
                body: await tNotif('notifFocusWiltedBody'),
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

// Cancel any pending streak reminder (used when the user disables it)
export async function cancelStreakReminder(): Promise<void> {
    try {
        const prevId = await migrateKey(LEGACY_STREAK_REMINDER_ID_KEY, STREAK_REMINDER_ID_KEY);
        if (prevId) {
            await cancelNotification(prevId);
            await AsyncStorage.removeItem(STREAK_REMINDER_ID_KEY);
        }
    } catch {
        // ignore
    }
}

// Keep the daily "study reminder" in sync with the preferences: a repeating
// notification at the user's chosen hour, replacing any previously scheduled
// one. No-op (and clears any pending one) when the preference is off.
// Idempotent — safe to call after every study session or settings change.
export async function scheduleStreakReminder(): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
        const prefs = await getPrefs();
        if (!prefs.streakReminderEnabled) {
            await cancelStreakReminder();
            return;
        }
        const granted = await ensureNotificationPermissions();
        if (!granted) return;

        const prevId = await migrateKey(LEGACY_STREAK_REMINDER_ID_KEY, STREAK_REMINDER_ID_KEY);
        if (prevId) {
            await cancelNotification(prevId);
        }

        const id = await Notifications.scheduleNotificationAsync({
            content: {
                title: await tNotif('notifStreakTitle'),
                body: await tNotif('notifStreakBody'),
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DAILY,
                hour: Math.max(0, Math.min(23, Math.round(prefs.reminderHour))),
                minute: 0,
            },
        });
        await AsyncStorage.setItem(STREAK_REMINDER_ID_KEY, id);
    } catch {
        // ignore
    }
}
