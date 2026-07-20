import { TranslationKey } from '@/constants/translations';
import { useLanguage } from '@/contexts/LanguageContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { migrateKey } from '@/utils/StorageMigration';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    Check,
    FileText,
    Flame,
    GalleryVerticalEnd,
    HelpCircle,
    Keyboard,
    LucideIcon,
    Music,
    Play,
    Snowflake,
    Sprout,
    Trophy,
    Wifi,
    X,
    Zap,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Modal, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GrowingPlant } from './GrowingPlant';
import { SprigLogo } from './SprigLogo';

const ONBOARDED_KEY = 'sprig_onboarded';
const LEGACY_ONBOARDED_KEY = 'csvtudyapp_onboarded';

// The mounted Onboarding instance registers itself here so Settings can
// replay the intro on demand without any navigation plumbing.
let replayTrigger: (() => void) | null = null;
export function replayOnboarding() {
    AsyncStorage.multiRemove([ONBOARDED_KEY, LEGACY_ONBOARDED_KEY]).catch(() => { });
    replayTrigger?.();
}

// ---------------------------------------------------------------------------
// Slide vignettes — each one is a miniature of the real app UI, built from
// the same shapes, colors and icons the screens use, instead of a generic
// tinted icon. Everything stays in the monochrome slate + forest palette.
// ---------------------------------------------------------------------------

function Chip({ icon: Icon, label, tint }: { icon: LucideIcon; label: string; tint?: string }) {
    const textColor = useThemeColor({}, 'text');
    const secondaryBg = useThemeColor({}, 'secondary');
    const accent = useThemeColor({}, 'primary');
    return (
        <View style={[styles.chip, { backgroundColor: secondaryBg }]}>
            <Icon size={13} color={tint ?? accent} strokeWidth={2.5} />
            <Text style={[styles.chipText, { color: textColor }]}>{label}</Text>
        </View>
    );
}

// Skeleton line standing in for text inside the mock UI
function Bar({ width, color }: { width: number; color: string }) {
    return <View style={{ width, height: 9, borderRadius: 5, backgroundColor: color }} />;
}

function WelcomeVignette() {
    const { t } = useLanguage();
    return (
        <View style={styles.vignette}>
            <SprigLogo size={128} />
            <View style={styles.chipRow}>
                <Chip icon={Zap} label={t('cards')} />
                <Chip icon={FileText} label={t('pdfs')} />
                <Chip icon={Music} label={t('audio')} />
                <Chip icon={Sprout} label={t('onboardFocus')} />
            </View>
        </View>
    );
}

function StudyVignette() {
    const { t } = useLanguage();
    const cardColor = useThemeColor({}, 'card');
    const secondaryBg = useThemeColor({}, 'secondary');
    const mutedForeground = useThemeColor({}, 'mutedForeground');

    return (
        <View style={styles.vignette}>
            <View style={styles.stackWrap}>
                <View style={[styles.mockCard, styles.mockCardBehind, { backgroundColor: secondaryBg }]} />
                <View style={[styles.mockCard, { backgroundColor: cardColor, borderColor: secondaryBg }]}>
                    <Text style={[styles.mockLabel, { color: mutedForeground }]}>{t('onboardQuestion')}</Text>
                    <View style={{ gap: 8, alignItems: 'center' }}>
                        <Bar width={150} color={secondaryBg} />
                        <Bar width={96} color={secondaryBg} />
                    </View>
                    <View style={styles.gradeRow}>
                        <View style={[styles.gradePill, { backgroundColor: '#ef444415' }]}>
                            <X size={14} color="#ef4444" strokeWidth={3} />
                            <Text style={[styles.gradeText, { color: '#ef4444' }]}>{t('onboardAgain')}</Text>
                        </View>
                        <View style={[styles.gradePill, { backgroundColor: '#22c55e15' }]}>
                            <Check size={14} color="#22c55e" strokeWidth={3} />
                            <Text style={[styles.gradeText, { color: '#22c55e' }]}>{t('onboardGotIt')}</Text>
                        </View>
                    </View>
                </View>
            </View>
            <View style={styles.chipRow}>
                <Chip icon={HelpCircle} label={t('onboardQuiz')} />
                <Chip icon={Keyboard} label={t('onboardType')} />
                <Chip icon={GalleryVerticalEnd} label={t('onboardFeed')} />
            </View>
        </View>
    );
}

function LibraryVignette() {
    const { t } = useLanguage();
    const cardColor = useThemeColor({}, 'card');
    const secondaryBg = useThemeColor({}, 'secondary');
    const accent = useThemeColor({}, 'primary');
    const primaryForeground = useThemeColor({}, 'primaryForeground');

    return (
        <View style={styles.vignette}>
            <View style={{ gap: 12, width: 272 }}>
                <View style={[styles.mockRow, { backgroundColor: cardColor, borderColor: secondaryBg }]}>
                    <View style={[styles.mockTile, { backgroundColor: accent + '15' }]}>
                        <FileText size={20} color={accent} strokeWidth={2.5} />
                    </View>
                    <View style={{ flex: 1, gap: 7 }}>
                        <Bar width={120} color={secondaryBg} />
                        <View style={[styles.mockProgress, { backgroundColor: secondaryBg }]}>
                            <View style={[styles.mockProgressFill, { width: '62%', backgroundColor: accent }]} />
                        </View>
                    </View>
                </View>
                <View style={[styles.mockRow, { backgroundColor: cardColor, borderColor: secondaryBg }]}>
                    <View style={[styles.mockTile, { backgroundColor: accent + '15' }]}>
                        <Music size={20} color={accent} strokeWidth={2.5} />
                    </View>
                    <View style={{ flex: 1, gap: 7 }}>
                        <Bar width={96} color={secondaryBg} />
                        <Bar width={64} color={secondaryBg} />
                    </View>
                    <View style={[styles.mockPlay, { backgroundColor: accent }]}>
                        <Play size={13} color={primaryForeground} fill={primaryForeground} style={{ marginLeft: 1 }} />
                    </View>
                </View>
            </View>
            <View style={styles.chipRow}>
                <Chip icon={Wifi} label={t('onboardDropFiles')} />
            </View>
        </View>
    );
}

function FocusVignette() {
    const { t } = useLanguage();
    const textColor = useThemeColor({}, 'text');
    const secondaryBg = useThemeColor({}, 'secondary');
    const accent = useThemeColor({}, 'primary');

    // Play the whole session in miniature on a loop: the plant grows to full
    // bloom while the timer counts a 25-minute session down to zero, holds
    // the bloom for a moment, then replants.
    const GROW_MS = 7000;
    const HOLD_MS = 2600;
    const SESSION_SECONDS = 25 * 60;
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const start = Date.now();
        const timer = setInterval(() => {
            const t = (Date.now() - start) % (GROW_MS + HOLD_MS);
            setProgress(Math.min(1, t / GROW_MS));
        }, 60);
        return () => clearInterval(timer);
    }, []);

    const secondsLeft = Math.round(SESSION_SECONDS * (1 - progress));
    const timerLabel = `${Math.floor(secondsLeft / 60)}:${(secondsLeft % 60).toString().padStart(2, '0')}`;

    return (
        <View style={styles.vignette}>
            <GrowingPlant progress={progress} size={150} color={accent} soilColor={secondaryBg} sway />
            <View style={[styles.timerPill, { backgroundColor: secondaryBg }]}>
                <Text style={[styles.timerText, { color: textColor }]}>{timerLabel}</Text>
            </View>
            <View style={styles.chipRow}>
                <Chip icon={Music} label={t('onboardAmbientSounds')} />
            </View>
        </View>
    );
}

function ProgressVignette() {
    const { t } = useLanguage();
    const cardColor = useThemeColor({}, 'card');
    const textColor = useThemeColor({}, 'text');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const secondaryBg = useThemeColor({}, 'secondary');
    const accent = useThemeColor({}, 'primary');

    return (
        <View style={styles.vignette}>
            <View style={[styles.mockStats, { backgroundColor: cardColor, borderColor: secondaryBg }]}>
                <View style={styles.statRow}>
                    <Flame size={18} color="#f97316" strokeWidth={2.5} fill="#f97316" />
                    <Text style={[styles.statText, { color: textColor }]}>{t('onboardDayStreakSample')}</Text>
                    <View style={{ flex: 1 }} />
                    <Snowflake size={14} color={mutedForeground} strokeWidth={2.5} />
                    <Text style={[styles.statSub, { color: mutedForeground }]}>2</Text>
                </View>
                <View style={styles.statRow}>
                    <Zap size={18} color={accent} strokeWidth={2.5} fill={accent} />
                    <Text style={[styles.statText, { color: textColor }]}>{t('onboardLevelSample')}</Text>
                    <Text style={[styles.statSub, { color: mutedForeground }]}>{t('onboardScholarSample')}</Text>
                </View>
                <View style={[styles.mockProgress, { backgroundColor: secondaryBg }]}>
                    <View style={[styles.mockProgressFill, { width: '68%', backgroundColor: accent }]} />
                </View>
            </View>
            <View style={styles.chipRow}>
                <Chip icon={Trophy} label={t('onboardAchievementsSample')} />
            </View>
        </View>
    );
}

interface Slide {
    Vignette: React.ComponentType;
    titleKey: TranslationKey;
    bodyKey: TranslationKey;
}

const SLIDES: Slide[] = [
    { Vignette: WelcomeVignette, titleKey: 'onboardWelcomeTitle', bodyKey: 'onboardWelcomeBody' },
    { Vignette: StudyVignette, titleKey: 'onboardStudyTitle', bodyKey: 'onboardStudyBody' },
    { Vignette: LibraryVignette, titleKey: 'onboardLibraryTitle', bodyKey: 'onboardLibraryBody' },
    { Vignette: FocusVignette, titleKey: 'onboardFocusTitle', bodyKey: 'onboardFocusBody' },
    { Vignette: ProgressVignette, titleKey: 'onboardProgressTitle', bodyKey: 'onboardProgressBody' },
];

// Full-screen first-run walkthrough. Shows once, then never again unless
// storage is cleared. Rendered near the app root so it overlays every tab.
export function Onboarding() {
    const { t } = useLanguage();
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
        migrateKey(LEGACY_ONBOARDED_KEY, ONBOARDED_KEY).then(v => {
            if (!v) setVisible(true);
        }).catch(() => { });
    }, []);

    // Register for on-demand replay (Settings > Replay Intro)
    useEffect(() => {
        replayTrigger = () => {
            setIndex(0);
            scrollRef.current?.scrollTo({ x: 0, animated: false });
            setVisible(true);
        };
        return () => { replayTrigger = null; };
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
                    <Text style={[styles.stepLabel, { color: mutedForeground }]}>
                        {index + 1} / {SLIDES.length}
                    </Text>
                    <TouchableOpacity onPress={finish} hitSlop={12} style={{ opacity: isLast ? 0 : 1 }} disabled={isLast}>
                        <Text style={[styles.skip, { color: mutedForeground }]}>{t('onboardSkip')}</Text>
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
                    {SLIDES.map((slide, i) => (
                        <View key={i} style={[styles.slide, { width }]}>
                            <slide.Vignette />
                            <Text style={[styles.title, { color: textColor }]}>{t(slide.titleKey)}</Text>
                            <Text style={[styles.body, { color: mutedForeground }]}>{t(slide.bodyKey)}</Text>
                        </View>
                    ))}
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
                            {isLast ? t('onboardGetStarted') : t('onboardNext')}
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
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 12,
        height: 44,
    },
    stepLabel: {
        fontSize: 13,
        fontWeight: '800',
        letterSpacing: 1,
        fontVariant: ['tabular-nums'],
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
    vignette: {
        height: 300,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        gap: 20,
    },
    chipRow: {
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap',
        justifyContent: 'center',
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 14,
    },
    chipText: {
        fontSize: 12,
        fontWeight: '700',
    },
    // Study slide
    stackWrap: {
        width: 230,
        height: 172,
    },
    mockCard: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        borderRadius: 24,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        paddingHorizontal: 18,
    },
    mockCardBehind: {
        transform: [{ rotate: '5deg' }, { translateX: 8 }],
        borderWidth: 0,
    },
    mockLabel: {
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1.5,
    },
    gradeRow: {
        flexDirection: 'row',
        gap: 10,
    },
    gradePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 11,
        paddingVertical: 6,
        borderRadius: 12,
    },
    gradeText: {
        fontSize: 12,
        fontWeight: '800',
    },
    // Library slide
    mockRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: 20,
        borderWidth: 1.5,
        padding: 14,
    },
    mockTile: {
        width: 42,
        height: 42,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    mockProgress: {
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
        alignSelf: 'stretch',
    },
    mockProgressFill: {
        height: '100%',
        borderRadius: 3,
    },
    mockPlay: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Focus slide
    timerPill: {
        paddingHorizontal: 18,
        paddingVertical: 8,
        borderRadius: 16,
    },
    timerText: {
        fontSize: 20,
        fontWeight: '900',
        letterSpacing: -0.5,
        fontVariant: ['tabular-nums'],
    },
    // Progress slide
    mockStats: {
        width: 264,
        borderRadius: 24,
        borderWidth: 1.5,
        padding: 18,
        gap: 14,
    },
    statRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
    },
    statText: {
        fontSize: 15,
        fontWeight: '800',
        letterSpacing: -0.2,
    },
    statSub: {
        fontSize: 13,
        fontWeight: '700',
    },
    title: {
        fontSize: 28,
        fontWeight: '900',
        letterSpacing: -0.6,
        textAlign: 'center',
        marginBottom: 14,
    },
    body: {
        fontSize: 15.5,
        lineHeight: 23,
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
