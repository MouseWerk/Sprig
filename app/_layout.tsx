import { ThemeProvider } from '@/components/ThemeProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

function RootLayoutNav() {
  const { isAuthenticated, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const textColor = useThemeColor({}, 'text');
  const backgroundColor = useThemeColor({}, 'background');

  useEffect(() => {
    if (loading) return;

    const inAuth = segments[0] === 'login' || segments[0] === 'register';

    if (!isAuthenticated && !inAuth) {
      // Redirect to login if not authenticated
      router.replace('/login');
    } else if (isAuthenticated && inAuth) {
      // Redirect to home if authenticated and on auth screen
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, segments, loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor }}>
        <ActivityIndicator size="large" color={textColor} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
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
      </Stack>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <ToastProvider>
            <RootLayoutNav />
          </ToastProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
