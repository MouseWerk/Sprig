import { Onboarding } from '@/components/Onboarding';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import { ToastProvider } from '@/components/ui/Toast';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

function RootLayoutNav() {
  const textColor = useThemeColor({}, 'text');
  const backgroundColor = useThemeColor({}, 'background');

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="swipe" options={{
          headerBackTitle: 'Back',
          headerTintColor: textColor,
          headerStyle: { backgroundColor },
          headerTitleStyle: { fontWeight: '600' }
        }} />
        <Stack.Screen name="pdf-view" options={{
          headerBackTitle: 'Back',
          headerTintColor: textColor,
          headerStyle: { backgroundColor },
          headerTitleStyle: { fontWeight: '600' }
        }} />
        <Stack.Screen name="deck-details" options={{
          headerBackTitle: 'Back',
          headerTintColor: textColor,
          headerStyle: { backgroundColor },
          headerTitleStyle: { fontWeight: '600' }
        }} />
        <Stack.Screen name="achievements" options={{
          headerBackTitle: 'Back',
          headerTintColor: textColor,
          headerStyle: { backgroundColor },
          headerTitleStyle: { fontWeight: '600' }
        }} />
        <Stack.Screen name="focus" options={{
          headerBackTitle: 'Back',
          headerTintColor: textColor,
          headerStyle: { backgroundColor },
          headerTitleStyle: { fontWeight: '600' }
        }} />
        <Stack.Screen name="credits" options={{
          headerBackTitle: 'Back',
          headerTintColor: textColor,
          headerStyle: { backgroundColor },
          headerTitleStyle: { fontWeight: '600' }
        }} />
        <Stack.Screen name="quiz" options={{
          headerBackTitle: 'Back',
          headerTintColor: textColor,
          headerStyle: { backgroundColor },
          headerTitleStyle: { fontWeight: '600' }
        }} />
        <Stack.Screen name="feed" options={{
          headerBackTitle: 'Back',
          headerTintColor: textColor,
          headerStyle: { backgroundColor },
          headerTitleStyle: { fontWeight: '600' }
        }} />
      </Stack>
      <Onboarding />
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <ToastProvider>
          <ConfirmProvider>
            <RootLayoutNav />
          </ConfirmProvider>
        </ToastProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
