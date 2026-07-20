import { Language, TranslationKey, translations } from '@/constants/translations';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';

const LANGUAGE_STORAGE_KEY = 'sprig_language';

// Best-effort device-locale default for a first launch with no saved choice.
// Pure JS (Hermes' built-in Intl), so this never needs a native module or
// rebuild — if Intl is unavailable for any reason, English is the fallback.
function detectDefaultLanguage(): Language {
    try {
        const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
        if (locale.toLowerCase().startsWith('de')) return 'de';
    } catch {
        // ignore — fall through to English
    }
    return 'en';
}

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
    const [language, setLanguageState] = useState<Language>('en');

    useEffect(() => {
        AsyncStorage.getItem(LANGUAGE_STORAGE_KEY).then(saved => {
            if (saved === 'en' || saved === 'de') {
                setLanguageState(saved);
            } else {
                setLanguageState(detectDefaultLanguage());
            }
        }).catch(() => { });
    }, []);

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
        AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang).catch(() => { });
    };

    const t = (key: TranslationKey): string => {
        return translations[language][key] ?? translations.en[key] ?? key;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
};
