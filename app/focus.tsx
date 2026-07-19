import { GrowingPlant } from '@/components/GrowingPlant';
import { SoundMixer, anySoundPlaying, stopAllSounds } from '@/components/SoundMixer';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { useThemeColor } from '@/hooks/use-theme-color';
import * as Haptics from '@/utils/AppHaptics';
import { useNavigation } from '@react-navigation/native';
import { FOCUS_MINUTES_OPTIONS, getPrefsSync, setPref } from '@/utils/Preferences';
import { recordFocusSession } from '@/utils/Storage';
import { Stack } from 'expo-router';
import { Coffee, Music, Pause, Play, RotateCcw, X } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { cancelNotification, ensureNotificationPermissions, scheduleFocusWarning } from '../utils/Notifications';

const GRACE_MS = 10_000;
const DURATIONS = FOCUS_MINUTES_OPTIONS;
const BREAK_MINUTES = 5;

function fmt(totalSeconds: number): string {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

type Phase = 'setup' | 'running' | 'paused' | 'done' | 'dead' | 'break';

interface RingProps { size: number; progress: number; color: string; track: string; }
function Ring({ size, progress, color, track }: RingProps) {
    const stroke = 12;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const center = size / 2;
    return (
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
            <Circle cx={center} cy={center} r={r} stroke={track} strokeWidth={stroke} fill="none" />
            <Circle
                cx={center} cy={center} r={r} stroke={color} strokeWidth={stroke} fill="none"
                strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, progress)))}
                strokeLinecap="round" transform={`rotate(-90 ${center} ${center})`}
            />
        </Svg>
    );
}

export default function FocusScreen() {
    const insets = useSafeAreaInsets();
    const { showToast } = useToast();
    const confirm = useConfirm();
    const navigation = useNavigation();

    const [phase, setPhase] = useState<Phase>('setup');
    const [minutes, setMinutes] = useState(() => getPrefsSync().defaultFocusMinutes);
    const [secondsLeft, setSecondsLeft] = useState(() => getPrefsSync().defaultFocusMinutes * 60);
    const [mixerVisible, setMixerVisible] = useState(false);
    const [soundsOn, setSoundsOn] = useState(false);

    const totalRef = useRef(getPrefsSync().defaultFocusMinutes * 60);
    const awayStartRef = useRef<number | null>(null);
    const warningIdRef = useRef<string | null>(null);
    const finishedRef = useRef(false);
    const phaseRef = useRef<Phase>('setup');
    phaseRef.current = phase;

    const backgroundColor = useThemeColor({}, 'background');
    const textColor = useThemeColor({}, 'text');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const secondaryBg = useThemeColor({}, 'secondary');
    const primaryColor = useThemeColor({}, 'primary');
    const primaryForeground = useThemeColor({}, 'primaryForeground');

    // Countdown ticker
    useEffect(() => {
        if (phase !== 'running' && phase !== 'break') return;
        const t = setInterval(() => {
            setSecondsLeft(s => Math.max(0, s - 1));
        }, 1000);
        return () => clearInterval(t);
    }, [phase]);

    // Handle reaching zero here (not inside the tick updater) so completion
    // side effects run exactly once, even under StrictMode / React Compiler.
    useEffect(() => {
        if (secondsLeft > 0) return;
        if (phase === 'running' && !finishedRef.current) {
            finishedRef.current = true;
            finishSession();
        } else if (phase === 'break') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setPhase('setup');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [secondsLeft, phase]);

    // Leave-to-wilt: minimizing during a running session kills the plant.
    useEffect(() => {
        const handle = (next: AppStateStatus) => {
            if (next === 'active') {
                const start = awayStartRef.current;
                awayStartRef.current = null;
                cancelNotification(warningIdRef.current);
                warningIdRef.current = null;
                if (start !== null && phaseRef.current === 'running' && Date.now() - start > GRACE_MS) {
                    setPhase('dead');
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                }
            } else if (phaseRef.current === 'running' && awayStartRef.current === null) {
                awayStartRef.current = Date.now();
                scheduleFocusWarning(GRACE_MS / 1000).then(id => {
                    if (awayStartRef.current === null) cancelNotification(id);
                    else warningIdRef.current = id;
                });
            }
        };
        const sub = AppState.addEventListener('change', handle);
        return () => sub.remove();
    }, []);

    useEffect(() => {
        return () => { cancelNotification(warningIdRef.current); };
    }, []);

    // Leaving mid-session via back would silently kill the plant - confirm
    // first. Setup/done/dead phases navigate away freely.
    useEffect(() => {
        const unsub = navigation.addListener('beforeRemove', (e: any) => {
            if (phaseRef.current !== 'running' && phaseRef.current !== 'paused') return;
            e.preventDefault();
            confirm({
                title: 'Give up this session?',
                message: 'Your plant won\'t survive if you leave now.',
                confirmText: 'Give Up',
                destructive: true,
            }).then(ok => {
                if (ok) navigation.dispatch(e.data.action);
            });
        });
        return unsub;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navigation]);

    const startSession = async (mins: number) => {
        await ensureNotificationPermissions();
        finishedRef.current = false;
        totalRef.current = mins * 60;
        setMinutes(mins);
        setSecondsLeft(mins * 60);
        setPhase('running');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    };

    const finishSession = () => {
        setPhase('done');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        recordFocusSession(minutes)
            .then(result => {
                let delay = 400;
                showToast({ message: `Focus complete · +${result.xpGained} XP`, type: 'success' });
                if (result.leveledUp) {
                    setTimeout(() => showToast({ message: `Level ${result.newLevel}! You're now a ${result.newRank}`, type: 'success' }), delay);
                    delay += 600;
                }
                result.newAchievements.forEach(a => {
                    setTimeout(() => showToast({ message: `Achievement unlocked: ${a.title}`, type: 'success' }), delay);
                    delay += 600;
                });
            })
            .catch(() => { });
    };

    const togglePause = () => {
        setPhase(p => (p === 'running' ? 'paused' : 'running'));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const giveUp = () => {
        awayStartRef.current = null;
        finishedRef.current = false;
        cancelNotification(warningIdRef.current);
        setPhase('setup');
        setSecondsLeft(minutes * 60);
    };

    const replant = () => {
        finishedRef.current = false;
        setPhase('setup');
        setSecondsLeft(minutes * 60);
        awayStartRef.current = null;
    };

    const startBreak = () => {
        setSecondsLeft(BREAK_MINUTES * 60);
        totalRef.current = BREAK_MINUTES * 60;
        setPhase('break');
    };

    const stopSounds = async () => {
        await stopAllSounds();
        setSoundsOn(false);
    };

    const elapsed = totalRef.current - secondsLeft;
    const progress = totalRef.current > 0 ? elapsed / totalRef.current : 0;

    return (
        <View style={[styles.container, { backgroundColor, paddingTop: insets.top, paddingBottom: insets.bottom + 20 }]}>
            <Stack.Screen options={{
                title: 'Focus Session',
                headerStyle: { backgroundColor },
                headerTintColor: textColor,
                headerShadowVisible: false,
            }} />

            {phase === 'setup' && (
                <View style={styles.center}>
                    <View style={{ marginBottom: 8 }}>
                        <GrowingPlant progress={0} size={120} color={primaryColor} soilColor={secondaryBg} sway />
                    </View>
                    <Text style={[styles.title, { color: textColor }]}>Grow a plant by focusing</Text>
                    <Text style={[styles.subtitle, { color: mutedForeground }]}>
                        Pick a length and stay in the app. Leave for more than 10s and your plant wilts.
                    </Text>

                    <View style={styles.durationRow}>
                        {DURATIONS.map(d => (
                            <TouchableOpacity
                                key={d}
                                style={[styles.durationChip, { backgroundColor: minutes === d ? primaryColor : secondaryBg }]}
                                onPress={() => {
                                    setMinutes(d);
                                    setSecondsLeft(d * 60);
                                    // Remember the pick as the new default length
                                    setPref('defaultFocusMinutes', d);
                                }}
                                activeOpacity={0.85}
                            >
                                <Text style={{ color: minutes === d ? primaryForeground : textColor, fontWeight: '900', fontSize: 18 }}>{d}</Text>
                                <Text style={{ color: minutes === d ? primaryForeground : mutedForeground, fontWeight: '700', fontSize: 10 }}>MIN</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: primaryColor }]} onPress={() => startSession(minutes)} activeOpacity={0.9}>
                        <Play size={20} color={primaryForeground} fill={primaryForeground} />
                        <Text style={[styles.primaryBtnText, { color: primaryForeground }]}>Start Focusing</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.soundLink} onPress={() => setMixerVisible(true)}>
                        <Music size={16} color={mutedForeground} />
                        <Text style={[styles.soundLinkText, { color: mutedForeground }]}>
                            {soundsOn ? 'Ambient sounds on' : 'Add ambient sounds'}
                        </Text>
                    </TouchableOpacity>
                </View>
            )}

            {(phase === 'running' || phase === 'paused' || phase === 'break') && (
                <View style={styles.center}>
                    {phase === 'break' && <Text style={[styles.breakLabel, { color: primaryColor }]}>BREAK</Text>}
                    <View style={styles.ringWrap}>
                        <Ring size={280} progress={progress} color={phase === 'break' ? '#22c55e' : primaryColor} track={secondaryBg} />
                        <View style={styles.ringInner}>
                            <View style={{ marginBottom: 2 }}>
                                {phase === 'break'
                                    ? <View style={{ height: 104, justifyContent: 'center' }}><Coffee size={56} color="#22c55e" strokeWidth={2} /></View>
                                    : <GrowingPlant progress={progress} size={104} color={primaryColor} soilColor={secondaryBg} sway={phase === 'running'} />}
                            </View>
                            <Text style={[styles.timer, { color: textColor }]}>{fmt(secondsLeft)}</Text>
                            <Text style={[styles.timerSub, { color: mutedForeground }]}>
                                {phase === 'paused' ? 'Paused' : phase === 'break' ? 'Relax a moment' : 'Stay focused'}
                            </Text>
                        </View>
                    </View>

                    {phase !== 'break' && (
                        <View style={styles.controlsRow}>
                            <TouchableOpacity
                                style={[styles.circleBtn, { backgroundColor: secondaryBg }]}
                                onPress={giveUp}
                                accessibilityLabel="Give up session"
                                accessibilityRole="button"
                            >
                                <X size={24} color={textColor} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.circleBtn, styles.bigBtn, { backgroundColor: primaryColor }]}
                                onPress={togglePause}
                                accessibilityLabel={phase === 'running' ? 'Pause session' : 'Resume session'}
                                accessibilityRole="button"
                            >
                                {phase === 'running'
                                    ? <Pause size={30} color={primaryForeground} fill={primaryForeground} />
                                    : <Play size={30} color={primaryForeground} fill={primaryForeground} />}
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.circleBtn, { backgroundColor: soundsOn ? primaryColor : secondaryBg }]}
                                onPress={() => setMixerVisible(true)}
                                accessibilityLabel="Open ambient sound mixer"
                                accessibilityRole="button"
                            >
                                <Music size={22} color={soundsOn ? primaryForeground : textColor} />
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            )}

            {phase === 'done' && (
                <View style={styles.center}>
                    <View style={{ marginBottom: 12 }}>
                        <GrowingPlant progress={1} size={150} color={primaryColor} soilColor={secondaryBg} sway />
                    </View>
                    <Text style={[styles.title, { color: textColor }]}>Your plant bloomed!</Text>
                    <Text style={[styles.subtitle, { color: mutedForeground }]}>
                        {minutes} focused minutes. Nicely done — take a short break or plant another.
                    </Text>
                    <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#22c55e' }]} onPress={startBreak} activeOpacity={0.9}>
                        <Text style={styles.primaryBtnText}>Take a {BREAK_MINUTES}-min break</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.secondaryBtn, { backgroundColor: secondaryBg }]} onPress={() => setPhase('setup')} activeOpacity={0.9}>
                        <Text style={[styles.secondaryBtnText, { color: textColor }]}>New session</Text>
                    </TouchableOpacity>
                </View>
            )}

            {phase === 'dead' && (
                <View style={styles.center}>
                    <View style={{ marginBottom: 12 }}>
                        <GrowingPlant progress={1} size={150} color="#a8a29e" soilColor={secondaryBg} wilted />
                    </View>
                    <Text style={[styles.title, { color: '#ef4444' }]}>Your plant wilted</Text>
                    <Text style={[styles.subtitle, { color: mutedForeground }]}>
                        You left the app for too long. Stay focused and try again.
                    </Text>
                    <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: primaryColor }]} onPress={replant} activeOpacity={0.9}>
                        <RotateCcw size={18} color={primaryForeground} strokeWidth={2.5} />
                        <Text style={[styles.primaryBtnText, { color: primaryForeground }]}>Try Again</Text>
                    </TouchableOpacity>
                </View>
            )}

            <SoundMixer
                visible={mixerVisible}
                onClose={() => { setMixerVisible(false); setSoundsOn(anySoundPlaying()); }}
            />

            {soundsOn && !mixerVisible && (
                <TouchableOpacity style={styles.stopSoundsBar} onPress={stopSounds}>
                    <Text style={[styles.stopSoundsText, { color: mutedForeground }]}>Stop ambient sounds</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    title: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5, textAlign: 'center', marginBottom: 12 },
    subtitle: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 32, maxWidth: 320 },
    durationRow: { flexDirection: 'row', gap: 12, marginBottom: 36 },
    durationChip: {
        width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    },
    primaryBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        height: 58, borderRadius: 20, paddingHorizontal: 32, minWidth: 240,
    },
    primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
    secondaryBtn: {
        height: 52, borderRadius: 18, paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center',
        marginTop: 12, minWidth: 240,
    },
    secondaryBtnText: { fontSize: 16, fontWeight: '800' },
    soundLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 24 },
    soundLinkText: { fontSize: 14, fontWeight: '700' },
    ringWrap: { width: 280, height: 280, alignItems: 'center', justifyContent: 'center', marginBottom: 40 },
    ringInner: { alignItems: 'center', justifyContent: 'center' },
    timer: { fontSize: 52, fontWeight: '900', letterSpacing: -1, fontVariant: ['tabular-nums'], marginTop: 4 },
    timerSub: { fontSize: 14, fontWeight: '700', marginTop: 2 },
    breakLabel: { fontSize: 14, fontWeight: '900', letterSpacing: 2, marginBottom: 20 },
    controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 24 },
    circleBtn: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
    bigBtn: { width: 76, height: 76, borderRadius: 38 },
    stopSoundsBar: { position: 'absolute', bottom: 24, alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 },
    stopSoundsText: { fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
});
