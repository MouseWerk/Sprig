import { useThemeColor } from '@/hooks/use-theme-color';
import { extractImageFiles, imageToken, importCardImage, removeImageToken, resolveCardImageUri } from '@/utils/CardImages';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import { ImagePlus, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { showImagePreview } from './ImageViewer';

// Image row for the card editor: shows the images referenced by one card
// side as thumbnails (tap = enlarged preview, badge = remove) plus an
// add button. Works purely on the card text — attaching appends an
// ![img](cardimg/…) token, removing strips it.
interface CardImagePickerProps {
    text: string;
    onChangeText: (next: string) => void;
}

export function CardImagePicker({ text, onChangeText }: CardImagePickerProps) {
    const textColor = useThemeColor({}, 'text');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const secondaryBg = useThemeColor({}, 'secondary');
    const accentColor = useThemeColor({}, 'primary');
    const [busy, setBusy] = useState(false);

    const files = extractImageFiles(text);

    const handleAdd = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: 'image/*',
                copyToCacheDirectory: true,
            });
            if (result.canceled || !result.assets || result.assets.length === 0) return;
            setBusy(true);
            const asset = result.assets[0];
            const fileName = await importCardImage(asset.uri, asset.name);
            const base = text.trimEnd();
            onChangeText(base.length > 0 ? `${base}\n${imageToken(fileName)}` : imageToken(fileName));
        } catch (e) {
            console.error('Error attaching image:', e);
        } finally {
            setBusy(false);
        }
    };

    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {files.map(file => (
                <View key={file} style={styles.thumbWrap}>
                    <TouchableOpacity
                        onPress={() => showImagePreview(resolveCardImageUri(file))}
                        activeOpacity={0.85}
                        accessibilityLabel="Show enlarged image"
                        accessibilityRole="imagebutton"
                    >
                        <Image
                            source={{ uri: resolveCardImageUri(file) }}
                            style={[styles.thumb, { backgroundColor: secondaryBg }]}
                            contentFit="cover"
                        />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.removeBadge}
                        onPress={() => onChangeText(removeImageToken(text, file))}
                        hitSlop={6}
                        accessibilityLabel="Remove image"
                        accessibilityRole="button"
                    >
                        <X size={11} color="#ffffff" strokeWidth={3} />
                    </TouchableOpacity>
                </View>
            ))}

            <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: secondaryBg }]}
                onPress={handleAdd}
                disabled={busy}
                activeOpacity={0.8}
                accessibilityLabel="Add image"
                accessibilityRole="button"
            >
                {busy ? (
                    <ActivityIndicator size="small" color={accentColor} />
                ) : (
                    <>
                        <ImagePlus size={16} color={accentColor} strokeWidth={2.5} />
                        <Text style={[styles.addText, { color: textColor }]}>
                            {files.length > 0 ? 'Add' : 'Add Image'}
                        </Text>
                    </>
                )}
            </TouchableOpacity>
            {files.length === 0 && (
                <Text style={[styles.hint, { color: mutedForeground }]}>optional</Text>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 2,
        paddingRight: 8,
    },
    thumbWrap: {
        position: 'relative',
    },
    thumb: {
        width: 56,
        height: 56,
        borderRadius: 12,
    },
    removeBadge: {
        position: 'absolute',
        top: -5,
        right: -5,
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: '#ef4444',
        alignItems: 'center',
        justifyContent: 'center',
    },
    addBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 40,
        paddingHorizontal: 14,
        borderRadius: 12,
    },
    addText: {
        fontSize: 13,
        fontWeight: '700',
    },
    hint: {
        fontSize: 12,
        fontWeight: '600',
    },
});
