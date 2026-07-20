import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useKeepAwake } from 'expo-keep-awake';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { ChevronLeft, ChevronRight, Share2, X } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, PanResponder, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { View as RNView } from 'react-native';
import Pdf from 'react-native-pdf';
import { getPdfPage, setPdfPage } from '../utils/Storage';

interface PageSliderProps {
    page: number;
    total: number;
    color: string;
    trackColor: string;
    labelColor: string;
    onCommit: (page: number) => void;
}

// Scrub bar for long documents — pure JS (same pageX technique as the sound
// mixer's VolumeBar). Dragging previews the target page; the PDF only jumps
// once on release, since re-rendering a page per move tick is too heavy.
function PageSlider({ page, total, color, trackColor, labelColor, onCommit }: PageSliderProps) {
    const containerRef = useRef<RNView>(null);
    const widthRef = useRef(1);
    const originXRef = useRef(0);
    const totalRef = useRef(total);
    totalRef.current = total;
    const onCommitRef = useRef(onCommit);
    onCommitRef.current = onCommit;

    const [dragPage, setDragPage] = useState<number | null>(null);
    const dragPageRef = useRef<number | null>(null);

    const measure = () => {
        containerRef.current?.measure((_x, _y, width, _height, pageX) => {
            widthRef.current = width || 1;
            originXRef.current = pageX;
        });
    };

    const pageForX = (pageX: number): number => {
        const t = Math.max(1, totalRef.current);
        const fraction = Math.max(0, Math.min(1, (pageX - originXRef.current) / widthRef.current));
        return Math.max(1, Math.min(t, Math.round(1 + fraction * (t - 1))));
    };

    const pan = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: (e) => {
                measure();
                const p = pageForX(e.nativeEvent.pageX);
                dragPageRef.current = p;
                setDragPage(p);
            },
            onPanResponderMove: (e) => {
                const p = pageForX(e.nativeEvent.pageX);
                dragPageRef.current = p;
                setDragPage(p);
            },
            onPanResponderRelease: () => {
                if (dragPageRef.current !== null) onCommitRef.current(dragPageRef.current);
                dragPageRef.current = null;
                setDragPage(null);
            },
            onPanResponderTerminate: () => {
                dragPageRef.current = null;
                setDragPage(null);
            },
        })
    ).current;

    const shownPage = dragPage ?? page;
    const fraction = total > 1 ? (shownPage - 1) / (total - 1) : 0;

    return (
        <View
            ref={containerRef}
            style={styles.sliderHit}
            onLayout={measure}
            accessibilityRole="adjustable"
            accessibilityLabel="Page position"
            accessibilityValue={{ min: 1, max: total, now: shownPage }}
            {...pan.panHandlers}
        >
            {dragPage !== null && (
                <Text style={[styles.sliderPreview, { color: labelColor }]}>{dragPage}</Text>
            )}
            <View style={[styles.sliderTrack, { backgroundColor: trackColor }]}>
                <View style={[styles.sliderFill, { width: `${fraction * 100}%`, backgroundColor: color }]} />
            </View>
            <View
                pointerEvents="none"
                style={[styles.sliderThumb, { backgroundColor: color, left: `${fraction * 100}%` }]}
            />
        </View>
    );
}

const PDFViewScreen = () => {
    const { id, uri, name } = useLocalSearchParams<{ id?: string, uri: string, name?: string }>();
    const [totalPages, setTotalPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [initialPage, setInitialPage] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [jumpVisible, setJumpVisible] = useState(false);
    const [jumpValue, setJumpValue] = useState('');
    // Tap the page to hide the header/footer for distraction-free reading
    const [immersive, setImmersive] = useState(false);
    const pdfRef = useRef<any>(null);
    const { showToast } = useToast();

    // Reading shouldn't fight the screen timeout
    useKeepAwake();

    // Latest page + a debounce timer so we persist reading position without
    // hammering AsyncStorage on every scroll tick.
    const latestPageRef = useRef(1);
    const totalPagesRef = useRef(0);
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
            setPdfPage(id, latestPageRef.current, totalPagesRef.current || undefined).catch(() => { });
        }, 600);
    };

    // Flush the last position on unmount
    useEffect(() => {
        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            if (id) setPdfPage(id, latestPageRef.current, totalPagesRef.current || undefined).catch(() => { });
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
                headerShown: !immersive,
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
                            totalPagesRef.current = numberOfPages;
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
                        onPageSingleTap={() => setImmersive(v => !v)}
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

            {!immersive && (
            <View style={[styles.footer, { backgroundColor: secondaryBg }]}>
                {totalPages > 1 && (
                    <PageSlider
                        page={currentPage}
                        total={totalPages}
                        color={accentColor}
                        trackColor={mutedForeground + '30'}
                        labelColor={textColor}
                        onCommit={goToPage}
                    />
                )}
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
            )}

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
    sliderHit: {
        paddingTop: 18,
        paddingBottom: 10,
        justifyContent: 'center',
    },
    sliderTrack: {
        height: 5,
        borderRadius: 3,
        overflow: 'hidden',
    },
    sliderFill: {
        height: '100%',
        borderRadius: 3,
    },
    sliderThumb: {
        position: 'absolute',
        top: 18 + 2.5 - 8,
        width: 16,
        height: 16,
        borderRadius: 8,
        marginLeft: -8,
    },
    sliderPreview: {
        position: 'absolute',
        top: -6,
        alignSelf: 'center',
        fontSize: 15,
        fontWeight: '900',
        fontVariant: ['tabular-nums'],
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
