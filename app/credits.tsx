import { useThemeColor } from '@/hooks/use-theme-color';
import { Stack } from 'expo-router';
import { ExternalLink } from 'lucide-react-native';
import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface CreditEntry {
    name: string;
    detail: string;
    license: string;
    url?: string;
}

const SOUND_CREDITS: CreditEntry[] = [
    {
        name: 'Ambient sounds',
        detail: 'Rain, ocean, campfire, wind, forest, birds, river and thunder loops are sourced from the open-source Moodist project.',
        license: 'Pixabay Content License / CC0',
        url: 'https://github.com/remvze/moodist',
    },
];

const SOFTWARE_CREDITS: CreditEntry[] = [
    { name: 'React Native & Expo', detail: 'The framework Sprig is built with.', license: 'MIT', url: 'https://expo.dev' },
    { name: 'Lucide Icons', detail: 'Every icon in the app.', license: 'ISC', url: 'https://lucide.dev' },
    { name: 'react-native-pdf', detail: 'PDF rendering.', license: 'MIT', url: 'https://github.com/wonday/react-native-pdf' },
    { name: 'PapaParse', detail: 'CSV parsing.', license: 'MIT', url: 'https://www.papaparse.com' },
    { name: 'react-native-svg', detail: 'Progress rings and the Sprig logo.', license: 'MIT', url: 'https://github.com/software-mansion/react-native-svg' },
    { name: 'react-native-reanimated & gesture-handler', detail: 'Card swiping and animations.', license: 'MIT', url: 'https://swmansion.com' },
];

export default function CreditsScreen() {
    const insets = useSafeAreaInsets();

    const backgroundColor = useThemeColor({}, 'background');
    const cardColor = useThemeColor({}, 'card');
    const textColor = useThemeColor({}, 'text');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const secondaryBg = useThemeColor({}, 'secondary');

    const openUrl = (url?: string) => {
        if (url) Linking.openURL(url).catch(() => { });
    };

    const renderEntry = (entry: CreditEntry) => (
        <TouchableOpacity
            key={entry.name}
            style={[styles.card, { backgroundColor: cardColor }]}
            onPress={() => openUrl(entry.url)}
            activeOpacity={entry.url ? 0.7 : 1}
            accessibilityLabel={`${entry.name}, ${entry.license} license`}
            accessibilityRole={entry.url ? 'link' : 'text'}
        >
            <View style={{ flex: 1 }}>
                <View style={styles.cardHeader}>
                    <Text style={[styles.cardName, { color: textColor }]}>{entry.name}</Text>
                    <View style={[styles.licenseBadge, { backgroundColor: secondaryBg }]}>
                        <Text style={[styles.licenseText, { color: mutedForeground }]}>{entry.license}</Text>
                    </View>
                </View>
                <Text style={[styles.cardDetail, { color: mutedForeground }]}>{entry.detail}</Text>
            </View>
            {entry.url && <ExternalLink size={16} color={mutedForeground} />}
        </TouchableOpacity>
    );

    return (
        <View style={[styles.container, { backgroundColor }]}>
            <Stack.Screen options={{
                title: 'Credits & Licenses',
                headerStyle: { backgroundColor },
                headerTintColor: textColor,
                headerShadowVisible: false,
            }} />

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
            >
                <Text style={[styles.intro, { color: mutedForeground }]}>
                    Sprig stands on the shoulders of open-source projects and freely
                    licensed sounds. Thank you to everyone behind them. 💚
                </Text>

                <Text style={[styles.sectionHeader, { color: mutedForeground }]}>SOUNDS</Text>
                {SOUND_CREDITS.map(renderEntry)}

                <Text style={[styles.sectionHeader, { color: mutedForeground }]}>SOFTWARE</Text>
                {SOFTWARE_CREDITS.map(renderEntry)}

                <Text style={[styles.footnote, { color: mutedForeground }]}>
                    Full license texts are available from each project&apos;s linked page.
                    The Sprig logo and name are © Mousewerk. Tap {String.fromCharCode(0x2197)} any entry to visit its project.
                </Text>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    intro: {
        fontSize: 14,
        lineHeight: 21,
        marginBottom: 8,
    },
    sectionHeader: {
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        marginTop: 24,
        marginBottom: 12,
        marginLeft: 4,
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderRadius: 18,
        padding: 16,
        marginBottom: 10,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
        flexWrap: 'wrap',
    },
    cardName: {
        fontSize: 15,
        fontWeight: '800',
        letterSpacing: -0.2,
    },
    licenseBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
    },
    licenseText: {
        fontSize: 10,
        fontWeight: '800',
    },
    cardDetail: {
        fontSize: 13,
        lineHeight: 18,
    },
    footnote: {
        fontSize: 12,
        lineHeight: 18,
        marginTop: 20,
        textAlign: 'center',
        opacity: 0.8,
    },
});
