import * as Icons from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { WidgetConfigurationScreenProps } from 'react-native-android-widget';
import { Language, TranslationKey } from '../constants/translations';
import { detectDefaultLanguage, getAppLanguage, plural, translate } from '../utils/AppLanguage';
import { countDueCards, Deck, getDecks } from '../utils/Storage';
import { setDeckIdForWidget } from '../utils/PinnedDeck';
import { renderPinnedDeckWidget } from './PinnedDeckWidget';

// Mounted by Android as its own root component (RNWidgetConfigurationScreen,
// registered in index.js) whenever a "Sprig Deck" widget is added to the
// home screen — a separate ReactActivity outside expo-router, so it can't
// rely on ThemeProvider/LanguageProvider from app/_layout.tsx. Kept plain and
// self-contained, matching the monochrome slate look used elsewhere.

const BG = '#ffffff';
const CARD_BG = '#f1f5f9';
const TEXT = '#0f172a';
const MUTED = '#64748b';
const ACCENT = '#0f172a';

export function WidgetConfigScreen({ widgetInfo, renderWidget, setResult }: WidgetConfigurationScreenProps) {
    const [decks, setDecks] = useState<Deck[] | null>(null);
    const [saving, setSaving] = useState(false);
    const [language, setLanguage] = useState<Language>(detectDefaultLanguage);
    const t = (key: TranslationKey) => translate(language, key);

    useEffect(() => {
        getAppLanguage().then(setLanguage).catch(() => { });
        getDecks()
            .then(all => setDecks(all.filter(d => d.type === 'csv')))
            .catch(() => setDecks([]));
    }, []);

    const handlePick = async (deck: Deck) => {
        if (saving) return;
        setSaving(true);
        try {
            const snapshot = await setDeckIdForWidget(widgetInfo.widgetId, deck.id);
            renderWidget(renderPinnedDeckWidget(snapshot, widgetInfo.width, widgetInfo.height, language));
            setResult('ok');
        } catch {
            setSaving(false);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title} accessibilityRole="header">{t('widgetPinTitle')}</Text>
            <Text style={styles.subtitle}>{t('widgetPinSubtitle')}</Text>

            {decks === null ? (
                <ActivityIndicator style={styles.loading} color={ACCENT} />
            ) : decks.length === 0 ? (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>{t('widgetNoDecks')}</Text>
                    <TouchableOpacity style={styles.cancelButton} onPress={() => setResult('cancel')} accessibilityRole="button">
                        <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={decks}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.list}
                    renderItem={({ item }) => {
                        const IconComponent = (Icons as any)[item.icon] || Icons.Book;
                        const due = countDueCards(item);
                        return (
                            <TouchableOpacity
                                style={styles.deckRow}
                                activeOpacity={0.7}
                                disabled={saving}
                                onPress={() => handlePick(item)}
                                accessibilityRole="button"
                            >
                                <View style={styles.deckIconBox}>
                                    <IconComponent size={20} color={TEXT} strokeWidth={2.5} />
                                </View>
                                <View style={styles.deckInfo}>
                                    <Text style={styles.deckName} numberOfLines={1}>{item.name}</Text>
                                    <Text style={styles.deckMeta}>{plural(t, item.totalCards || 0, 'cardsCountOne', 'deckDetailsCardsCount')}</Text>
                                </View>
                                {due > 0 && (
                                    <View style={styles.dueBadge}>
                                        <Text style={styles.dueText}>{t('homeDueCount').replace('{n}', String(due))}</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    }}
                />
            )}

            {saving && (
                <View style={styles.savingOverlay}>
                    <ActivityIndicator color={ACCENT} />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: BG,
        paddingTop: 56,
        paddingHorizontal: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: '800',
        color: TEXT,
    },
    subtitle: {
        fontSize: 14,
        color: MUTED,
        marginTop: 4,
        marginBottom: 20,
    },
    loading: {
        marginTop: 40,
    },
    list: {
        gap: 10,
        paddingBottom: 40,
    },
    deckRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: CARD_BG,
        borderRadius: 16,
        padding: 14,
    },
    deckIconBox: {
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: '#e2e8f0',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    deckInfo: {
        flex: 1,
    },
    deckName: {
        fontSize: 16,
        fontWeight: '700',
        color: TEXT,
    },
    deckMeta: {
        fontSize: 12,
        color: MUTED,
        marginTop: 2,
    },
    dueBadge: {
        backgroundColor: '#ef4444',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        marginLeft: 8,
    },
    dueText: {
        color: '#ffffff',
        fontSize: 12,
        fontWeight: '700',
    },
    emptyState: {
        alignItems: 'center',
        marginTop: 40,
        gap: 16,
    },
    emptyText: {
        fontSize: 14,
        color: MUTED,
        textAlign: 'center',
    },
    cancelButton: {
        paddingHorizontal: 20,
        paddingVertical: 10,
    },
    cancelButtonText: {
        color: TEXT,
        fontWeight: '700',
    },
    savingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255,255,255,0.6)',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
