import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useThemeColor } from '@/hooks/use-theme-color';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { ChevronLeft, ChevronRight, Share2, X } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Pdf from 'react-native-pdf';
import { getPdfPage, setPdfPage } from '../utils/Storage';

const PDFViewScreen = () => {
    const { id, uri, name } = useLocalSearchParams<{ id?: string, uri: string, name?: string }>();
    const [totalPages, setTotalPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [initialPage, setInitialPage] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [jumpVisible, setJumpVisible] = useState(false);
    const [jumpValue, setJumpValue] = useState('');
    const pdfRef = useRef<any>(null);
    const { showToast } = useToast();

    // Latest page + a debounce timer so we persist reading position without
    // hammering AsyncStorage on every scroll tick.
    const latestPageRef = useRef(1);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const backgroundColor = useThemeColor({}, 'background');
    const textColor = useThemeColor({}, 'text');
    const secondaryBg = useThemeColor({}, 'secondary');
    const accentColor = useThemeColor({}, 'primary');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const borderColor = useThemeColor({}, 'border');

    // Load the saved reading position before mounting the PDF so it opens
    // straight to where the user left off.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const saved = id ? await getPdfPage(id) : 1;
            if (!cancelled) {
                setInitialPage(saved);
                setCurrentPage(saved);
                latestPageRef.current = saved;
            }
        })();
        return () => { cancelled = true; };
    }, [id]);

    const persistPage = (page: number) => {
        if (!id) return;
        latestPageRef.current = page;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            setPdfPage(id, latestPageRef.current).catch(() => { });
        }, 600);
    };

    // Flush the last position on unmount
    useEffect(() => {
        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            if (id) setPdfPage(id, latestPageRef.current).catch(() => { });
        };
    }, [id]);

    const goToPage = (page: number) => {
        const clamped = Math.max(1, Math.min(totalPages || page, page));
        pdfRef.current?.setPage(clamped);
        setCurrentPage(clamped);
        persistPage(clamped);
    };

    const handleJump = () => {
        const n = parseInt(jumpValue, 10);
        setJumpVisible(false);
        setJumpValue('');
        if (!isNaN(n)) goToPage(n);
    };

    if (!uri) {
        return (
            <View style={[styles.container, { backgroundColor, justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: textColor }}>No document selected</Text>
            </View>
        );
    }

    const openInExternal = async () => {
        try {
            await Sharing.shareAsync(uri);
        } catch (e) {
            console.error('Error sharing document:', e);
            showToast({ message: 'Failed to open document in external app', type: 'error' });
        }
    };

    return (
        <View style={[styles.container, { backgroundColor }]}>
            <Stack.Screen options={{
                title: name || 'Document',
                headerStyle: { backgroundColor },
                headerTintColor: textColor,
                headerShadowVisible: false,
                headerRight: () => (
                    <TouchableOpacity onPress={openInExternal} style={{ marginRight: 8 }} accessibilityLabel="Share document" accessibilityRole="button">
                        <Share2 size={22} color={textColor} strokeWidth={2.5} />
                    </TouchableOpacity>
                )
            }} />

            <View style={styles.content}>
                {initialPage !== null && (
                    <Pdf
                        ref={pdfRef}
                        source={{ uri }}
                        page={initialPage}
                        style={[styles.pdf, { backgroundColor }]}
                        trustAllCerts={false}
                        onLoadComplete={(numberOfPages) => {
                            setTotalPages(numberOfPages);
                            setLoading(false);
                            // Clamp a stale saved position if the file changed
                            if (initialPage > numberOfPages) {
                                goToPage(numberOfPages);
                            } else if (initialPage > 1) {
                                showToast({ message: `Resumed on page ${initialPage}`, type: 'info' });
                            }
                        }}
                        onPageChanged={(page) => {
                            setCurrentPage(page);
                            persistPage(page);
                        }}
                        onError={(error) => {
                            console.error('PDF Error:', error);
                            setLoading(false);
                            showToast({ message: 'Failed to load PDF. Try opening in an external viewer.', type: 'error' });
                        }}
                        enablePaging={false}
                        horizontal={false}
                        spacing={8}
                        fitPolicy={0}
                        minScale={1.0}
                        maxScale={4.0}
                        scale={1.0}
                        enableAntialiasing={true}
                    />
                )}

                {loading && (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor, justifyContent: 'center', alignItems: 'center' }]}>
                        <ActivityIndicator size="large" color={accentColor} />
                        <Text style={{ marginTop: 16, color: mutedForeground, fontWeight: '600' }}>Loading document...</Text>
                    </View>
                )}
            </View>

            <View style={[styles.footer, { backgroundColor: secondaryBg }]}>
                <View style={styles.controls}>
                    <TouchableOpacity
                        onPress={() => goToPage(currentPage - 1)}
                        disabled={currentPage <= 1}
                        style={[styles.navBtn, currentPage <= 1 && { opacity: 0.3 }]}
                        accessibilityLabel="Previous page"
                        accessibilityRole="button"
                    >
                        <ChevronLeft size={28} color={textColor} strokeWidth={2.5} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.pageIndicator, { backgroundColor: backgroundColor }]}
                        onPress={() => { setJumpValue(String(currentPage)); setJumpVisible(true); }}
                        disabled={totalPages === 0}
                        activeOpacity={0.7}
                    >
                        <Text style={[styles.pageText, { color: textColor }]}>
                            Page <Text style={{ fontWeight: '900', color: accentColor }}>{currentPage}</Text> of {totalPages}
                        </Text>
                        <Text style={[styles.tapHint, { color: mutedForeground }]}>Tap to jump</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => goToPage(currentPage + 1)}
                        disabled={currentPage >= totalPages}
                        style={[styles.navBtn, currentPage >= totalPages && { opacity: 0.3 }]}
                        accessibilityLabel="Next page"
                        accessibilityRole="button"
                    >
                        <ChevronRight size={28} color={textColor} strokeWidth={2.5} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Jump to page modal */}
            <Modal
                visible={jumpVisible}
                animationType="fade"
                transparent
                onRequestClose={() => setJumpVisible(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                    <View style={styles.modalOverlay}>
                        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setJumpVisible(false)} />
                        <View style={[styles.modalCard, { backgroundColor }]}>
                            <View style={styles.modalHeader}>
                                <Text style={[styles.modalTitle, { color: textColor }]}>Jump to Page</Text>
                                <TouchableOpacity onPress={() => setJumpVisible(false)} accessibilityLabel="Close" accessibilityRole="button">
                                    <X size={20} color={textColor} />
                                </TouchableOpacity>
                            </View>
                            <TextInput
                                style={[styles.jumpInput, { color: textColor, borderColor, backgroundColor: secondaryBg }]}
                                value={jumpValue}
                                onChangeText={setJumpValue}
                                keyboardType="number-pad"
                                placeholder={`1 – ${totalPages}`}
                                placeholderTextColor={mutedForeground}
                                autoFocus
                                onSubmitEditing={handleJump}
                                returnKeyType="go"
                            />
                            <Button title="Go" onPress={handleJump} style={{ marginTop: 16, height: 52 }} />
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        flex: 1,
        position: 'relative',
    },
    pdf: {
        flex: 1,
        width: '100%',
    },
    footer: {
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 10,
    },
    controls: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    navBtn: {
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pageIndicator: {
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 20,
        minWidth: 140,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pageText: {
        fontSize: 14,
        fontWeight: '600',
    },
    tapHint: {
        fontSize: 9,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginTop: 2,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    modalCard: {
        width: '100%',
        maxWidth: 340,
        borderRadius: 28,
        padding: 24,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '900',
        letterSpacing: -0.5,
    },
    jumpInput: {
        height: 56,
        borderRadius: 16,
        borderWidth: 1.5,
        paddingHorizontal: 18,
        fontSize: 20,
        fontWeight: '800',
        textAlign: 'center',
    },
});

export default PDFViewScreen;
