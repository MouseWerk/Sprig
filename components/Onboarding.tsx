import { useThemeColor } from '@/hooks/use-theme-color';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BookOpen, FileText, Repeat, Sprout } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Modal, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SprigLogo } from './SprigLogo';

const ONBOARDED_KEY = 'csvtudyapp_onboarded';

interface Slide {
    icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
    title: string;
    body: string;
    tint: string;
    brand?: boolean; // show the Sprig mark instead of a tinted icon
}

const SLIDES: Slide[] = [
    {
        icon: BookOpen,
        title: 'Welcome to Sprig',
        body: 'Turn any CSV, TSV or text file into a swipeable flashcard deck in seconds. Your first deck is one tap away.',
        tint: '#2E5C4E',
        brand: true,
    },
    {
        icon: Repeat,
        title: 'Study Smarter',
        body: 'Swipe to grade each card. Spaced repetition schedules every card for the perfect moment so you remember more with less effort.',
        tint: '#22c55e',
    },
    {
        icon: FileText,
        title: 'Your PDF Library',
        body: 'Keep textbooks and notes in the Library tab. The reader remembers your page and lets you jump, zoom and resume right where you left off.',
        tint: '#f97316',
    },
    {
        icon: Sprout,
        title: 'Stay Focused',
        body: 'Grow a plant while you study. Leave the app for too long and it wilts — a gentle nudge to keep your attention on the cards.',
        tint: '#10b981',
    },
];

// Full-screen first-run walkthrough. Shows once, then never again unless
// storage is cleared. Rendered near the app root so it overlays every tab.
export function Onboarding() {
    const insets = useSafeAreaInsets();
    const [visible, setVisible] = useState(false);
    const [index, setIndex] = useState(0);
    const scrollRef = useRef<ScrollView>(null);
    const width = Dimensions.get('window').width;

    const backgroundColor = useThemeColor({}, 'background');
    const textColor = useThemeColor({}, 'text');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const primaryColor = useThemeColor({}, 'primary');
    const primaryForeground = useThemeColor({}, 'primaryForeground');
    const secondaryBg = useThemeColor({}, 'secondary');

    useEffect(() => {
        AsyncStorage.getItem(ONBOARDED_KEY).then(v => {
            if (!v) setVisible(true);
        }).catch(() => { });
    }, []);

    const finish = () => {
        setVisible(false);
        AsyncStorage.setItem(ONBOARDED_KEY, 'true').catch(() => { });
    };

    const goNext = () => {
        if (index >= SLIDES.length - 1) {
            finish();
            return;
        }
        const next = index + 1;
        scrollRef.current?.scrollTo({ x: next * width, animated: true });
        setIndex(next);
    };

    const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const i = Math.round(e.nativeEvent.contentOffset.x / width);
        if (i !== index) setIndex(i);
    };

    const isLast = index === SLIDES.length - 1;

    return (
        <Modal visible={visible} animationType="fade" onRequestClose={finish}>
            <View style={[styles.container, { backgroundColor, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
                <View style={styles.topBar}>
                    <TouchableOpacity onPress={finish} hitSlop={12} style={{ opacity: isLast ? 0 : 1 }} disabled={isLast}>
                        <Text style={[styles.skip, { color: mutedForeground }]}>Skip</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView
                    ref={scrollRef}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onScroll={onScroll}
                    scrollEventThrottle={16}
                    style={{ flex: 1 }}
                >
                    {SLIDES.map((slide, i) => {
                        const Icon = slide.icon;
                        return (
                            <View key={i} style={[styles.slide, { width }]}>
                                {slide.brand ? (
                                    <View style={styles.brandWrap}>
                                        <SprigLogo size={132} />
                                    </View>
                                ) : (
                                    <View style={[styles.iconWrap, { backgroundColor: slide.tint + '1A' }]}>
                                        <Icon size={72} color={slide.tint} strokeWidth={1.75} />
                                    </View>
                                )}
                                <Text style={[styles.title, { color: textColor }]}>{slide.title}</Text>
                                <Text style={[styles.body, { color: mutedForeground }]}>{slide.body}</Text>
                            </View>
                        );
                    })}
                </ScrollView>

                <View style={styles.dots}>
                    {SLIDES.map((_, i) => (
                        <View
                            key={i}
                            style={[
                                styles.dot,
                                {
                                    backgroundColor: i === index ? primaryColor : secondaryBg,
                                    width: i === index ? 24 : 8,
                                },
                            ]}
                        />
                    ))}
                </View>

                <View style={styles.footer}>
                    <TouchableOpacity
                        style={[styles.nextBtn, { backgroundColor: primaryColor }]}
                        onPress={goNext}
                        activeOpacity={0.9}
                    >
                        <Text style={[styles.nextText, { color: primaryForeground }]}>
                            {isLast ? 'Get Started' : 'Next'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    topBar: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        paddingHorizontal: 24,
        paddingTop: 12,
        height: 44,
    },
    skip: {
        fontSize: 15,
        fontWeight: '700',
    },
    slide: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 40,
    },
    iconWrap: {
        width: 160,
        height: 160,
        borderRadius: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 48,
    },
    brandWrap: {
        marginBottom: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 28,
        fontWeight: '900',
        letterSpacing: -0.6,
        textAlign: 'center',
        marginBottom: 16,
    },
    body: {
        fontSize: 16,
        lineHeight: 24,
        textAlign: 'center',
        maxWidth: 320,
    },
    dots: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        marginBottom: 24,
    },
    dot: {
        height: 8,
        borderRadius: 4,
    },
    footer: {
        paddingHorizontal: 24,
        paddingBottom: 12,
    },
    nextBtn: {
        height: 58,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    nextText: {
        fontSize: 17,
        fontWeight: '800',
        letterSpacing: -0.2,
    },
});
