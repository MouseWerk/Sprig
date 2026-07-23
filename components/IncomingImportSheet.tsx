import { useLanguage } from '@/contexts/LanguageContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { DetectedIncomingFile } from '@/utils/IncomingFile';
import { Folder, FolderKind, getFolders } from '@/utils/Storage';
import { FileText, Folder as FolderIcon, Layers, Music, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from './ui/Button';
import { BottomSheet } from './ui/BottomSheet';
import { Input } from './ui/Input';

// Shown whenever a file is opened "with Sprig" from another app, so the user
// gets the same name/folder choice the in-app import pickers already give —
// instead of the file silently landing at the root with a guessed name.

function folderKindFor(kind: DetectedIncomingFile['kind']): FolderKind {
    if (kind === 'pdf') return 'pdf';
    if (kind === 'audio') return 'audio';
    return 'deck';
}

interface Props {
    detected: DetectedIncomingFile | null;
    onCancel: () => void;
    onConfirm: (name: string, folderId: string | null) => void;
}

export function IncomingImportSheet({ detected, onCancel, onConfirm }: Props) {
    const { t } = useLanguage();
    const insets = useSafeAreaInsets();
    const backgroundColor = useThemeColor({}, 'background');
    const textColor = useThemeColor({}, 'text');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const secondaryBg = useThemeColor({}, 'secondary');
    const accentColor = useThemeColor({}, 'primary');
    const primaryForeground = useThemeColor({}, 'primaryForeground');

    const [name, setName] = useState('');
    const [folderId, setFolderId] = useState<string | null>(null);
    const [folders, setFolders] = useState<Folder[]>([]);

    useEffect(() => {
        if (!detected) return;
        setName(detected.suggestedName);
        setFolderId(null);
        getFolders(folderKindFor(detected.kind)).then(setFolders).catch(() => setFolders([]));
    }, [detected]);

    const IconComponent = detected?.kind === 'pdf' ? FileText : detected?.kind === 'audio' ? Music : Layers;

    return (
        <BottomSheet
            visible={detected !== null}
            onClose={onCancel}
            sheetStyle={[styles.sheet, { backgroundColor, paddingBottom: Math.max(insets.bottom, 24) }]}
        >
            <View style={styles.header}>
                <View style={styles.headerTitleRow}>
                    <View style={[styles.iconTile, { backgroundColor: accentColor + '15' }]}>
                        <IconComponent size={20} color={accentColor} strokeWidth={2.5} />
                    </View>
                    <Text style={[styles.title, { color: textColor }]}>{t('layoutIncomingTitle')}</Text>
                </View>
                <TouchableOpacity onPress={onCancel} accessibilityLabel="Cancel" accessibilityRole="button">
                    <X size={20} color={textColor} />
                </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
                <Input
                    label={t('layoutIncomingNameLabel')}
                    value={name}
                    onChangeText={setName}
                />

                <Text style={[styles.sectionLabel, { color: textColor }]}>{t('moveToFolder')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.folderPickerContainer}>
                    <TouchableOpacity
                        style={[styles.folderChip, { backgroundColor: folderId === null ? accentColor : secondaryBg }]}
                        onPress={() => setFolderId(null)}
                    >
                        <Text style={[styles.folderChipText, { color: folderId === null ? primaryForeground : textColor }]}>
                            {t('root')}
                        </Text>
                    </TouchableOpacity>
                    {folders.map((folder) => (
                        <TouchableOpacity
                            key={folder.id}
                            style={[styles.folderChip, { backgroundColor: folderId === folder.id ? accentColor : secondaryBg }]}
                            onPress={() => setFolderId(folder.id)}
                        >
                            <FolderIcon size={14} color={folderId === folder.id ? primaryForeground : textColor} />
                            <Text style={[styles.folderChipText, { color: folderId === folder.id ? primaryForeground : textColor }]}>
                                {folder.name}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                <Button
                    title={t('layoutIncomingImportButton')}
                    onPress={() => detected && onConfirm(name.trim() || detected.suggestedName, folderId)}
                    style={styles.importButton}
                />
                <Button
                    title={t('cancel')}
                    variant="ghost"
                    onPress={onCancel}
                    style={styles.cancelButton}
                    textStyle={{ color: mutedForeground }}
                />
            </ScrollView>
        </BottomSheet>
    );
}

const styles = StyleSheet.create({
    sheet: {
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        padding: 24,
        maxHeight: '85%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    iconTile: {
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 19,
        fontWeight: '800',
        letterSpacing: -0.3,
    },
    sectionLabel: {
        fontSize: 14,
        fontWeight: '700',
        marginTop: 16,
        marginBottom: 8,
        marginLeft: 4,
    },
    folderPickerContainer: {
        flexDirection: 'row',
    },
    folderChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 14,
        marginRight: 8,
    },
    folderChipText: {
        fontSize: 13,
        fontWeight: '700',
    },
    importButton: {
        marginTop: 24,
        height: 56,
        borderRadius: 18,
    },
    cancelButton: {
        marginTop: 4,
        height: 44,
    },
});
