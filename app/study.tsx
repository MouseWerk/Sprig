import { useThemeColor } from '@/hooks/use-theme-color';
import { buildDeckStudySession } from '@/utils/PinnedDeck';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

// Target of the home-screen widget's tap (`sprig://study?deckId=…`, see
// widget/PinnedDeckWidget.tsx). Being a real route matters: expo-router
// handles the deep link itself on both cold and warm starts, so there's no
// "Unmatched Route" flash and no race against a separate Linking listener
// that could leave the user on the Decks tab instead of in the session.
// This screen only resolves what's due right now and hands off to /swipe.
export default function StudyRedirectScreen() {
    const { deckId } = useLocalSearchParams<{ deckId?: string }>();
    const router = useRouter();
    const backgroundColor = useThemeColor({}, 'background');
    const primaryColor = useThemeColor({}, 'primary');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const session = deckId ? await buildDeckStudySession(deckId).catch(() => null) : null;
            if (cancelled) return;
            if (session) {
                // replace, not push: this screen must never stay in the back
                // stack, or "back" would land on a spinner that redirects again.
                router.replace({
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
                // Deck vanished since the widget last showed it — land somewhere
                // useful instead of a dead end.
                router.replace('/decks');
            }
        })();
        return () => { cancelled = true; };
    }, [deckId, router]);

    return (
        <View style={{ flex: 1, backgroundColor, alignItems: 'center', justifyContent: 'center' }}>
            <Stack.Screen options={{ headerShown: false }} />
            <ActivityIndicator color={primaryColor} />
        </View>
    );
}
