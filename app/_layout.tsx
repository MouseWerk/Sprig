import { ImageViewerHost } from '@/components/ImageViewer';
import { Onboarding } from '@/components/Onboarding';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { LanguageProvider, useLanguage } from '@/contexts/LanguageContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { importIncomingFile, isFileUrl } from '@/utils/IncomingFile';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { Linking } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// "Open with Sprig": files launched from other apps arrive as the app's
// launch URL (cold start) or a url event (already running).
function useIncomingFiles() {
  const { showToast } = useToast();
  const { t } = useLanguage();

  useEffect(() => {
    const handle = async (url: string | null) => {
      if (!isFileUrl(url)) return;
      try {
        const result = await importIncomingFile(url);
        if (!result) return; // already handled
        showToast({
          message: result.kind === 'pdf'
            ? t('layoutPdfAdded').replace('{name}', result.name)
            : t('layoutDeckImported').replace('{name}', result.name).replace('{n}', String(result.cards)),
          type: 'success',
        });
      } catch (e) {
        console.error('Incoming file import failed:', e);
        showToast({ message: t('layoutImportFailed'), type: 'error' });
      }
    };

    Linking.getInitialURL().then(handle).catch(() => { });
    const sub = Linking.addEventListener('url', ({ url }) => { handle(url); });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function RootLayoutNav() {
  const { t } = useLanguage();
  const textColor = useThemeColor({}, 'text');
  const backgroundColor = useThemeColor({}, 'background');
  useIncomingFiles();
  const backTitle = t('layoutBack');

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="swipe" options={{
          headerBackTitle: backTitle,
          headerTintColor: textColor,
          headerStyle: { backgroundColor },
          headerTitleStyle: { fontWeight: '600' }
        }} />
        <Stack.Screen name="pdf-view" options={{
          headerBackTitle: backTitle,
          headerTintColor: textColor,
          headerStyle: { backgroundColor },
          headerTitleStyle: { fontWeight: '600' }
        }} />
        <Stack.Screen name="deck-details" options={{
          headerBackTitle: backTitle,
          headerTintColor: textColor,
          headerStyle: { backgroundColor },
          headerTitleStyle: { fontWeight: '600' }
        }} />
        <Stack.Screen name="achievements" options={{
          headerBackTitle: backTitle,
          headerTintColor: textColor,
          headerStyle: { backgroundColor },
          headerTitleStyle: { fontWeight: '600' }
        }} />
        <Stack.Screen name="grove" options={{
          headerBackTitle: backTitle,
          headerTintColor: textColor,
          headerStyle: { backgroundColor },
          headerTitleStyle: { fontWeight: '600' }
        }} />
        <Stack.Screen name="focus" options={{
          headerBackTitle: backTitle,
          headerTintColor: textColor,
          headerStyle: { backgroundColor },
          headerTitleStyle: { fontWeight: '600' }
        }} />
        <Stack.Screen name="credits" options={{
          headerBackTitle: backTitle,
          headerTintColor: textColor,
          headerStyle: { backgroundColor },
          headerTitleStyle: { fontWeight: '600' }
        }} />
        <Stack.Screen name="quiz" options={{
          headerBackTitle: backTitle,
          headerTintColor: textColor,
          headerStyle: { backgroundColor },
          headerTitleStyle: { fontWeight: '600' }
        }} />
        <Stack.Screen name="type" options={{
          headerBackTitle: backTitle,
          headerTintColor: textColor,
          headerStyle: { backgroundColor },
          headerTitleStyle: { fontWeight: '600' }
        }} />
        <Stack.Screen name="feed" options={{
          headerBackTitle: backTitle,
          headerTintColor: textColor,
          headerStyle: { backgroundColor },
          headerTitleStyle: { fontWeight: '600' }
        }} />
      </Stack>
      <Onboarding />
      <ImageViewerHost />
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
