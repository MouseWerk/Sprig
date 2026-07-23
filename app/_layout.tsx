import { ImageViewerHost } from '@/components/ImageViewer';
import { IncomingImportSheet } from '@/components/IncomingImportSheet';
import { Onboarding } from '@/components/Onboarding';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { LanguageProvider, useLanguage } from '@/contexts/LanguageContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { commitIncomingImport, DetectedIncomingFile, detectIncomingFile, discardIncomingFile, isFileUrl } from '@/utils/IncomingFile';
import { buildPinnedDeckSession } from '@/utils/PinnedDeck';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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

function useIncomingFiles() {
  const { showToast } = useToast();
  const { t } = useLanguage();
  const router = useRouter();
  const [pending, setPending] = useState<DetectedIncomingFile | null>(null);

  useEffect(() => {
    const handle = async (url: string | null) => {
      // Home-screen widget tap: jump straight into a session for the
      // currently pinned deck (see components/PinnedDeckWidget).
      if (url?.startsWith('sprig://study')) {
        const session = await buildPinnedDeckSession();
        if (session) {
          router.push({
            pathname: '/swipe',
            params: {
              id: session.deckId,
              uri: session.uri,
              name: session.deckName,
              mode: 'all',
              cards: session.cardIndices.join(','),
            },
          });
        } else {
          router.replace('/decks');
        }
        return;
      }

      if (!isFileUrl(url)) return;
      router.replace('/decks');
      try {
        const detected = await detectIncomingFile(url);
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
            : t('layoutDeckImported').replace('{name}', result.name).replace('{n}', String(result.cards)),
        type: 'success',
      });
    } catch (e) {
      console.error('Incoming file import failed:', e);
      showToast({ message: t('layoutImportFailed'), type: 'error' });
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
