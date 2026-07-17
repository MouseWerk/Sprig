import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Appearance, ColorSchemeName } from 'react-native';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
    theme: ColorSchemeName;
    mode: ThemeMode;
    setThemeMode: (mode: ThemeMode) => Promise<void>;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'csvtudyapp_theme_mode';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [mode, setMode] = useState<ThemeMode>('system');
    const [systemColorScheme, setSystemColorScheme] = useState<ColorSchemeName>(Appearance.getColorScheme());

    useEffect(() => {
        // Load saved theme
        const loadTheme = async () => {
            const savedMode = await AsyncStorage.getItem(THEME_STORAGE_KEY) as ThemeMode;
            if (savedMode) {
                setMode(savedMode);
            }
        };
        loadTheme();

        // Listen for system theme changes
        const subscription = Appearance.addChangeListener(({ colorScheme }) => {
            setSystemColorScheme(colorScheme);
        });

        return () => subscription.remove();
    }, []);

    const setThemeMode = async (newMode: ThemeMode) => {
        setMode(newMode);
        await AsyncStorage.setItem(THEME_STORAGE_KEY, newMode);
    };

    const activeTheme = mode === 'system' ? systemColorScheme : mode;

    return (
        <ThemeContext.Provider value={{ theme: activeTheme, mode, setThemeMode }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useCustomTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useCustomTheme must be used within a ThemeProvider');
    }
    return context;
};
