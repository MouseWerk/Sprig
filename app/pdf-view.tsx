import { useThemeColor } from '@/hooks/use-theme-color';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { ChevronLeft, ChevronRight, Share2 } from 'lucide-react-native';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Pdf from 'react-native-pdf';

const PDFViewScreen = () => {
    const { uri, name } = useLocalSearchParams<{ uri: string, name?: string }>();
    const [totalPages, setTotalPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const pdfRef = useRef<any>(null);

    const backgroundColor = useThemeColor({}, 'background');
    const textColor = useThemeColor({}, 'text');
    const secondaryBg = useThemeColor({}, 'secondary');
    const accentColor = useThemeColor({}, 'primary');
    const mutedForeground = useThemeColor({}, 'mutedForeground');

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
            Alert.alert('Error', 'Failed to open document in external app.');
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
                    <TouchableOpacity onPress={openInExternal} style={{ marginRight: 8 }}>
                        <Share2 size={22} color={textColor} strokeWidth={2.5} />
                    </TouchableOpacity>
                )
            }} />

            <View style={styles.content}>
                <Pdf
                    ref={pdfRef}
                    source={{ uri }}
                    style={[styles.pdf, { backgroundColor }]}
                    trustAllCerts={false}
                    onLoadComplete={(numberOfPages) => {
                        setTotalPages(numberOfPages);
                        setLoading(false);
                    }}
                    onPageChanged={(page) => {
                        setCurrentPage(page);
                    }}
                    onError={(error) => {
                        console.error('PDF Error:', error);
                        setLoading(false);
                        Alert.alert('Error', 'Failed to load PDF. Try opening in external viewer.');
                    }}
                    enablePaging={true}
                    horizontal={true}
                    spacing={0}
                    fitPolicy={0}
                />

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
                        onPress={() => pdfRef.current?.setPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage <= 1}
                        style={[styles.navBtn, currentPage <= 1 && { opacity: 0.3 }]}
                    >
                        <ChevronLeft size={28} color={textColor} strokeWidth={2.5} />
                    </TouchableOpacity>

                    <View style={[styles.pageIndicator, { backgroundColor: backgroundColor }]}>
                        <Text style={[styles.pageText, { color: textColor }]}>
                            Page <Text style={{ fontWeight: '900', color: accentColor }}>{currentPage}</Text> of {totalPages}
                        </Text>
                    </View>

                    <TouchableOpacity
                        onPress={() => pdfRef.current?.setPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage >= totalPages}
                        style={[styles.navBtn, currentPage >= totalPages && { opacity: 0.3 }]}
                    >
                        <ChevronRight size={28} color={textColor} strokeWidth={2.5} />
                    </TouchableOpacity>
                </View>
            </View>
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
        paddingVertical: 10,
        borderRadius: 20,
        minWidth: 140,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pageText: {
        fontSize: 14,
        fontWeight: '600',
    }
});

export default PDFViewScreen;
