import { useCustomTheme } from '@/components/ThemeProvider';
import { useColorScheme as useDeviceColorScheme } from 'react-native';

export function useColorScheme() {
    try {
        const { theme } = useCustomTheme();
        return theme;
    } catch (e) {
        return useDeviceColorScheme();
    }
}
