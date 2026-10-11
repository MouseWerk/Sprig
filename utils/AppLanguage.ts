import AsyncStorage from '@react-native-async-storage/async-storage';
import { Language, TranslationKey, translations } from '../constants/translations';

// Language helpers usable outside the React tree: scheduled notifications
// and the home-screen widget run without a LanguageProvider, so they read
// the same stored choice LanguageContext saves.

export const LANGUAGE_STORAGE_KEY = 'sprig_language';

// Best-effort device-locale default for a first launch with no saved choice.
// Pure JS (Hermes' built-in Intl), so this never needs a native module or
// rebuild — if Intl is unavailable for any reason, English is the fallback.
export function detectDefaultLanguage(): Language {
    try {
        const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
        if (locale.toLowerCase().startsWith('de')) return 'de';
    } catch {
        // ignore — fall through to English
    }
    return 'en';
}

// The language the app shows: the saved choice, else the device default
// (the same rule LanguageContext applies on launch).
export async function getAppLanguage(): Promise<Language> {
    try {
        const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (saved === 'en' || saved === 'de') return saved;
    } catch {
        // fall through to the device default
    }
    return detectDefaultLanguage();
}

export function translate(language: Language, key: TranslationKey): string {
    return translations[language]?.[key] ?? translations.en[key] ?? key;
}

// "1 card" / "5 cards": picks the singular or plural text and fills in {n}
export function plural(t: (key: TranslationKey) => string, n: number, oneKey: TranslationKey, manyKey: TranslationKey): string {
    return t(n === 1 ? oneKey : manyKey).replace('{n}', String(n));
}
