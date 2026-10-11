import { Language, TranslationKey, translations } from '@/constants/translations';
import { detectDefaultLanguage, LANGUAGE_STORAGE_KEY } from '@/utils/AppLanguage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';

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
