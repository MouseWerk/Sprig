import AsyncStorage from '@react-native-async-storage/async-storage';
import { migrateKey } from './StorageMigration';

// User-tunable knobs for the gamification + focus features. Stored as one
// JSON blob in AsyncStorage with an in-memory mirror so synchronous readers
// (like the haptics wrapper) never have to await.

// Toggleable/reorderable Home dashboard sections, in addition to the always-
// shown header, level card, and "today" row (those are contextual, not
// static sections a user would want to hide).
export type HomeSectionId = 'grove' | 'focus' | 'decks';

export interface Preferences {
    dailyGoal: number;            // cards/day that fill the goal ring
    defaultFocusMinutes: number;  // pre-selected focus session length
    streakReminderEnabled: boolean;
    reminderHour: number;         // hour of day (0-23) the daily reminder fires
    hapticsEnabled: boolean;
    cardTextScale: number;        // multiplier applied to card question/answer font sizes
    studySessionLength: number;   // cards per Quiz/Type session
    homeSectionOrder: HomeSectionId[];  // display order for Home's toggleable sections
    homeSectionsHidden: HomeSectionId[]; // subset of the above currently hidden
}

export const PREFS_STORAGE_KEY = 'sprig_prefs';
const LEGACY_PREFS_KEY = 'csvtudyapp_prefs';

export const DEFAULT_HOME_SECTION_ORDER: HomeSectionId[] = ['grove', 'focus', 'decks'];

export const DEFAULT_PREFS: Preferences = {
    dailyGoal: 20,
    defaultFocusMinutes: 25,
    streakReminderEnabled: true,
    reminderHour: 19,
    hapticsEnabled: true,
    cardTextScale: 1,
    studySessionLength: 20,
    homeSectionOrder: DEFAULT_HOME_SECTION_ORDER,
    homeSectionsHidden: [],
};

export const REMINDER_HOUR_MIN = 5;
export const REMINDER_HOUR_MAX = 23;

export const DAILY_GOAL_OPTIONS = [10, 20, 30, 50];
export const FOCUS_MINUTES_OPTIONS = [15, 25, 45, 60];
export const CARD_TEXT_SCALE_OPTIONS = [0.85, 1, 1.15, 1.3];
export const STUDY_SESSION_LENGTH_OPTIONS = [10, 20, 30, 50];

let cache: Preferences = { ...DEFAULT_PREFS };
let loaded = false;
const listeners = new Set<(prefs: Preferences) => void>();

async function load(): Promise<void> {
    if (loaded) return;
    loaded = true;
    try {
        const raw = await migrateKey(LEGACY_PREFS_KEY, PREFS_STORAGE_KEY);
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
