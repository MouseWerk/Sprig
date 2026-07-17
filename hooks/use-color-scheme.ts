import { ThemeContext } from '@/components/ThemeProvider';
import { useContext } from 'react';
import { useColorScheme as useDeviceColorScheme } from 'react-native';

export function useColorScheme() {
    const themeContext = useContext(ThemeContext);
    const deviceScheme = useDeviceColorScheme();
    return themeContext ? themeContext.theme : deviceScheme;
}
