import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Full-screen image preview. One host is mounted at the app root; any screen
// (card renderer, editors) opens it via showImagePreview(uri) — no per-screen
// modal plumbing needed.

let openViewer: ((uri: string) => void) | null = null;

export function showImagePreview(uri: string) {
    openViewer?.(uri);
}

export function ImageViewerHost() {
    const insets = useSafeAreaInsets();
    const [uri, setUri] = useState<string | null>(null);

    useEffect(() => {
        openViewer = setUri;
        return () => { openViewer = null; };
    }, []);

    const close = () => setUri(null);

    return (
        <Modal visible={uri !== null} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
            <TouchableWithoutFeedback onPress={close} accessibilityLabel="Close image preview" accessibilityRole="button">
                <View style={styles.backdrop}>
                    {uri !== null && (
                        <Image
                            source={{ uri }}
                            style={styles.image}
                            contentFit="contain"
                            transition={120}
                        />
                    )}
                    <TouchableOpacity
                        style={[styles.closeBtn, { top: insets.top + 14 }]}
                        onPress={close}
                        hitSlop={10}
                        accessibilityLabel="Close image preview"
                        accessibilityRole="button"
                    >
                        <X size={22} color="#ffffff" strokeWidth={2.5} />
                    </TouchableOpacity>
                    <Text style={styles.hint}>Tap anywhere to close</Text>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.92)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    image: {
        width: '100%',
        height: '80%',
    },
    closeBtn: {
        position: 'absolute',
        right: 20,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.14)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    hint: {
        position: 'absolute',
        bottom: 40,
        color: 'rgba(255,255,255,0.55)',
        fontSize: 13,
        fontWeight: '600',
    },
});
