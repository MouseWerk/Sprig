import { ImageViewerHost } from '@/components/ImageViewer';
import { IncomingImportSheet } from '@/components/IncomingImportSheet';
import { Onboarding } from '@/components/Onboarding';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { LanguageProvider, useLanguage } from '@/contexts/LanguageContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { TranslationKey } from '@/constants/translations';
import { commitIncomingImport, DetectedIncomingFile, detectIncomingFile, discardIncomingFile, IncomingImportError, isFileUrl } from '@/utils/IncomingFile';
import { plural } from '@/utils/AppLanguage';
import { rearmStreakReminderOnLaunch } from '@/utils/Notifications';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// "Open with Sprig": files launched from other apps arrive as the app's
// launch URL (cold start) or a url event (already running). expo-router
// tries to match that same content:// / file:// URL against the app's own
// routes and fails, landing on its "Unmatched Route" screen — so as soon as
// we recognize the URL as an incoming file, we steer navigation back into
// the app instead of leaving the user stuck there. The file itself isn't
// imported until the user confirms a name/folder in IncomingImportSheet —
// mirroring the in-app pickers instead of guessing both from the filename.
const ROUTE_FOR_KIND: Record<DetectedIncomingFile['kind'], '/explore' | '/audio' | '/decks'> = {
  pdf: '/explore',
  audio: '/audio',
  zip: '/decks',
  csv: '/decks',
};

const IMPORT_ERROR_KEYS: Record<IncomingImportError, TranslationKey> = {
  'anki-new-format': 'decksAnkiNewFormat',
  'anki-empty': 'decksAnkiEmpty',
  'anki-failed': 'decksAnkiFailed',
  'not-sprig': 'decksNotSprigFile',
  'no-cards': 'deckDetailsNoImportPairs',
};

function useIncomingFiles() {
  const { showToast } = useToast();
  const { t, language } = useLanguage();
  // The url listener is registered once; read the current language through
  // a ref so a later language switch still names imports correctly.
  const languageRef = useRef(language);
  languageRef.current = language;
  const router = useRouter();
  const [pending, setPending] = useState<DetectedIncomingFile | null>(null);

  useEffect(() => {
    const handle = async (url: string | null) => {
      // Home-screen widget taps (`sprig://study?deckId=…`) are a real route —
      // app/study.tsx — so expo-router handles them itself; nothing to do here.
      if (!isFileUrl(url)) return;
      router.replace('/decks');
      try {
        const detected = await detectIncomingFile(url, languageRef.current);
        if (!detected) return; // already handled
        router.replace(ROUTE_FOR_KIND[detected.kind]);
        setPending(detected);
      } catch (e) {
        console.error('Incoming file detection failed:', e);
        showToast({ message: t('layoutImportFailed'), type: 'error' });
      }
    };

    Linking.getInitialURL().then(handle).catch(() => { });
    const sub = Linking.addEventListener('url', ({ url }) => { handle(url); });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancel = () => {
    if (pending) discardIncomingFile(pending);
    setPending(null);
  };

  const handleConfirm = async (name: string, folderId: string | null) => {
    if (!pending) return;
    const detected = pending;
    setPending(null);
    try {
      const result = await commitIncomingImport(detected, name, folderId);
      router.replace(ROUTE_FOR_KIND[detected.kind]);
      showToast({
        message: result.kind === 'pdf'
          ? t('layoutPdfAdded').replace('{name}', result.name)
          : result.kind === 'audio'
            ? t('layoutAudioImported').replace('{name}', result.name)
            : t('layoutDeckImported').replace('{name}', result.name).replace('{cards}', plural(t, result.cards ?? 0, 'cardsCountOne', 'deckDetailsCardsCount')),
        type: 'success',
      });
    } catch (e: any) {
      console.error('Incoming file import failed:', e);
      const key = IMPORT_ERROR_KEYS[e?.message as IncomingImportError] ?? 'layoutImportFailed';
      showToast({ message: t(key), type: 'error' });
    }
  };

  return { pending, handleCancel, handleConfirm };
}

function RootLayoutNav() {
  const { t } = useLanguage();
  const textColor = useThemeColor({}, 'text');
  const backgroundColor = useThemeColor({}, 'background');
  const { pending, handleCancel, handleConfirm } = useIncomingFiles();
  const backTitle = t('layoutBack');

  useEffect(() => {
    rearmStreakReminderOnLaunch().catch(() => { });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="study" options={{ headerShown: false }} />
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
        <Stack.Screen name="notebook" options={{
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
      <IncomingImportSheet detected={pending} onCancel={handleCancel} onConfirm={handleConfirm} />
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
