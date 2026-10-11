import { useToast } from '@/components/ui/Toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { Deck, getDecks, updateDeckNotes } from '@/utils/Storage';
import { Stack, useLocalSearchParams } from 'expo-router';
import { CheckCircle2, NotebookPen } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MarkdownRenderer from '../components/MarkdownRenderer';
import { Button } from '../components/ui/Button';

// The per-deck notebook is a full route rather than a bottom sheet. In a sheet
// the editor was a fixed-height box inside a modal: once the keyboard came up
// there was no room left, and the caret disappeared underneath it while you
// typed. As a page the editor simply owns whatever height is left — Android
// resizes the window for the keyboard, the input shrinks with it, and a
// multiline TextInput keeps its own caret in view.
export default function NotebookScreen() {
    const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
    const insets = useSafeAreaInsets();
    const { t } = useLanguage();
    const { showToast } = useToast();

    const [deck, setDeck] = useState<Deck | null>(null);
    const [notes, setNotes] = useState('');
    const [editing, setEditing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [savedAt, setSavedAt] = useState(0);

    const backgroundColor = useThemeColor({}, 'background');
    const textColor = useThemeColor({}, 'text');
    const successColor = useThemeColor({}, 'success');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const secondaryBg = useThemeColor({}, 'secondary');
    const accentColor = useThemeColor({}, 'primary');
    const primaryForeground = useThemeColor({}, 'primaryForeground');
    const inputBorder = useThemeColor({}, 'input');

    useEffect(() => {
        let cancelled = false;
        getDecks()
            .then(decks => {
                if (cancelled) return;
                const found = decks.find(d => d.id === id) || null;
                setDeck(found);
                setNotes(found?.notes || '');
                // Land straight in the editor for an empty notebook; otherwise
                // show what's there and let the user choose to edit.
                setEditing(!found?.notes);
            })
            .catch(() => { })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [id]);

    const save = useCallback(async (value: string) => {
        if (!id) return;
        try {
            await updateDeckNotes(id, value);
            setDeck(prev => prev ? { ...prev, notes: value } : prev);
            return true;
        } catch (e) {
            console.error('Error saving deck notes:', e);
            return false;
        }
    }, [id]);

    const handleSave = async () => {
        const ok = await save(notes);
        if (ok) {
            setEditing(false);
            setSavedAt(Date.now());
        } else {
            showToast({ message: t('error'), type: 'error' });
        }
    };

    // Notes are the one thing here that must never be lost to a stray back
    // gesture, so an unsaved draft is flushed on the way out. The ref mirrors
    // the latest values because the unmount cleanup is registered once.
    const flushRef = useRef({ notes: '', saved: '' });
    flushRef.current = { notes, saved: deck?.notes || '' };
    useEffect(() => {
        return () => {
            const { notes: draft, saved } = flushRef.current;
            if (draft !== saved) save(draft);
        };
    }, [save]);

    const dirty = notes !== (deck?.notes || '');
    const justSaved = savedAt > 0 && !dirty;

    if (loading) {
        return (
            <View style={[styles.container, styles.centered, { backgroundColor }]}>
                <Stack.Screen options={{ title: t('deckDetailsNotebook') }} />
                <ActivityIndicator color={accentColor} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor, paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Stack.Screen options={{ title: name || deck?.name || t('deckDetailsNotebook') }} />

            <View style={[styles.toggleRow, { backgroundColor: secondaryBg }]}>
                <TouchableOpacity
                    style={[styles.toggleBtn, editing && { backgroundColor: accentColor }]}
                    onPress={() => setEditing(true)}
                    accessibilityRole="button"
                >
                    <Text style={[styles.toggleText, { color: editing ? primaryForeground : mutedForeground }]}>
                        {t('deckDetailsNotebookEdit')}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.toggleBtn, !editing && { backgroundColor: accentColor }]}
                    onPress={() => setEditing(false)}
                    accessibilityRole="button"
                >
                    <Text style={[styles.toggleText, { color: !editing ? primaryForeground : mutedForeground }]}>
                        {t('deckDetailsNotebookPreview')}
                    </Text>
                </TouchableOpacity>
            </View>

            <View style={styles.statusRow}>
                {editing ? (
                    <Text style={[styles.hint, { color: mutedForeground }]}>{t('deckDetailsNotebookHint')}</Text>
                ) : justSaved ? (
                    <>
                        <CheckCircle2 size={14} color={successColor} strokeWidth={3} />
                        <Text style={[styles.savedText, { color: successColor }]}>{t('deckDetailsNotebookSaved')}</Text>
                    </>
                ) : null}
            </View>

            {editing ? (
                // flex:1 is the whole point: the editor takes the space that's
                // actually left once the keyboard is up, instead of a fixed
                // height that the keyboard covers.
                <TextInput
                    style={[styles.editor, { color: textColor, backgroundColor: secondaryBg + '30', borderColor: inputBorder }]}
                    value={notes}
                    onChangeText={setNotes}
                    placeholder={t('deckDetailsNotebookPlaceholder')}
                    placeholderTextColor={mutedForeground}
                    selectionColor={accentColor}
                    multiline
                    textAlignVertical="top"
                    autoFocus={!notes}
                />
            ) : notes.trim().length > 0 ? (
                <ScrollView style={styles.preview} contentContainerStyle={styles.previewContent} showsVerticalScrollIndicator={false}>
                    <MarkdownRenderer content={notes} fontSize={16} />
                </ScrollView>
            ) : (
                <View style={styles.emptyState}>
                    <NotebookPen size={32} color={mutedForeground} strokeWidth={2} />
                    <Text style={[styles.emptyText, { color: mutedForeground }]}>{t('deckDetailsNotebookEmpty')}</Text>
                </View>
            )}

            {editing && (
                <Button
                    title={t('saveChanges')}
                    onPress={handleSave}
                    disabled={!dirty}
                    style={styles.saveBtn}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 16,
    },
    centered: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    toggleRow: {
        flexDirection: 'row',
        borderRadius: 12,
        padding: 4,
        gap: 4,
    },
    toggleBtn: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 10,
        borderRadius: 9,
    },
    toggleText: {
        fontSize: 14,
        fontWeight: '700',
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 18,
        marginTop: 10,
        marginBottom: 6,
        marginLeft: 4,
    },
    hint: {
        fontSize: 12,
        fontWeight: '500',
    },
    savedText: {
        fontSize: 12,
        fontWeight: '700',
    },
    editor: {
        flex: 1,
        borderWidth: 1.5,
        borderRadius: 16,
        padding: 16,
        fontSize: 16,
        fontWeight: '500',
        lineHeight: 24,
    },
    preview: {
        flex: 1,
    },
    previewContent: {
        paddingBottom: 24,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    emptyText: {
        fontSize: 14,
        fontWeight: '500',
        textAlign: 'center',
    },
    saveBtn: {
        marginTop: 16,
        height: 56,
        borderRadius: 16,
    },
});
