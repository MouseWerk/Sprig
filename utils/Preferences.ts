import AsyncStorage from '@react-native-async-storage/async-storage';

// User-tunable knobs for the gamification + focus features. Stored as one
// JSON blob in AsyncStorage with an in-memory mirror so synchronous readers
// (like the haptics wrapper) never have to await.

export interface Preferences {
    dailyGoal: number;            // cards/day that fill the goal ring
    defaultFocusMinutes: number;  // pre-selected focus session length
    streakReminderEnabled: boolean;
    reminderHour: number;         // hour of day (0-23) the daily reminder fires
    hapticsEnabled: boolean;
}

export const PREFS_STORAGE_KEY = 'csvtudyapp_prefs';

export const DEFAULT_PREFS: Preferences = {
    dailyGoal: 20,
    defaultFocusMinutes: 25,
    streakReminderEnabled: true,
    reminderHour: 19,
    hapticsEnabled: true,
};

export const REMINDER_HOUR_MIN = 5;
export const REMINDER_HOUR_MAX = 23;

export const DAILY_GOAL_OPTIONS = [10, 20, 30, 50];
export const FOCUS_MINUTES_OPTIONS = [15, 25, 45, 60];

let cache: Preferences = { ...DEFAULT_PREFS };
let loaded = false;
const listeners = new Set<(prefs: Preferences) => void>();

async function load(): Promise<void> {
    if (loaded) return;
    loaded = true;
    try {
        const raw = await AsyncStorage.getItem(PREFS_STORAGE_KEY);
        if (raw) {
            cache = { ...DEFAULT_PREFS, ...JSON.parse(raw) };
            notify();
        }
    } catch {
        // keep defaults
    }
}

function notify() {
    for (const l of listeners) l({ ...cache });
}

// Synchronous read of the in-memory mirror (defaults until load resolves).
export function getPrefsSync(): Preferences {
    return { ...cache };
}

export async function getPrefs(): Promise<Preferences> {
    await load();
    return { ...cache };
}

export async function setPref<K extends keyof Preferences>(key: K, value: Preferences[K]): Promise<Preferences> {
    await load();
    cache = { ...cache, [key]: value };
    notify();
    try {
        await AsyncStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(cache));
    } catch {
        // in-memory value still applies for this session
    }
    return { ...cache };
}

// Subscribe to changes; returns an unsubscribe. Fires immediately once the
// stored value has been loaded so late subscribers catch up.
export function subscribePrefs(listener: (prefs: Preferences) => void): () => void {
    listeners.add(listener);
    load().then(() => listener({ ...cache }));
    return () => { listeners.delete(listener); };
}

// Kick off the initial load as soon as the module is imported
load();
