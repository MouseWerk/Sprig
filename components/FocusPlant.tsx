import { useThemeColor } from '@/hooks/use-theme-color';
import * as Haptics from '@/utils/AppHaptics';
import { RotateCcw } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, AppState, AppStateStatus, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { cancelNotification, ensureNotificationPermissions, scheduleFocusWarning } from '../utils/Notifications';

// Grace period: leave the app for longer than this and the plant withers.
const GRACE_MS = 10_000;

interface Stage {
    min: number;      // focus seconds needed to reach this stage
    emoji: string;
    label: string;
}

// Growth stages. The plant reaches full bloom after 6 minutes of focus.
const STAGES: Stage[] = [
    { min: 0, emoji: '🌱', label: 'Seedling' },
    { min: 45, emoji: '🌿', label: 'Sprouting' },
    { min: 120, emoji: '🪴', label: 'Growing' },
    { min: 240, emoji: '🌳', label: 'Flourishing' },
    { min: 360, emoji: '🌸', label: 'In bloom' },
];

function stageIndexFor(seconds: number): number {
    let idx = 0;
    for (let i = 0; i < STAGES.length; i++) {
        if (seconds >= STAGES[i].min) idx = i;
    }
    return idx;
}

function formatTime(totalSeconds: number): string {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

interface FocusPlantProps {
    // Only grows while the study session is actually running
    active: boolean;
}

// A Forest-style focus companion. The plant grows the longer you stay
// focused in the app; if you leave the app for more than GRACE_MS and
// come back, it withers and has to be replanted.
export function FocusPlant({ active }: FocusPlantProps) {
    const [focusSeconds, setFocusSeconds] = useState(0);
    const [dead, setDead] = useState(false);

    const awayStartRef = useRef<number | null>(null);
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const warningIdRef = useRef<string | null>(null);

    // Mirror state into refs so the AppState listener (subscribed once) always
    // reads the latest values without re-subscribing.
    const deadRef = useRef(dead);
    deadRef.current = dead;
    const activeRef = useRef(active);
    activeRef.current = active;

    const popAnim = useRef(new Animated.Value(1)).current;
    const swayAnim = useRef(new Animated.Value(0)).current;

    const textColor = useThemeColor({}, 'text');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const secondaryBg = useThemeColor({}, 'secondary');
    const primaryColor = useThemeColor({}, 'primary');

    const stageIndex = stageIndexFor(focusSeconds);
    const stage = STAGES[stageIndex];

    // Progress toward the next stage (0..1); full once in bloom
    const nextStage = STAGES[stageIndex + 1];
    const stageProgress = nextStage
        ? Math.min(1, (focusSeconds - stage.min) / (nextStage.min - stage.min))
        : 1;

    // Tick focus time forward once per second while active, foregrounded,
    // and alive. Backgrounding suspends JS, so time only counts in-app.
    useEffect(() => {
        const shouldRun = active && !dead;
        if (shouldRun) {
            tickRef.current = setInterval(() => {
                setFocusSeconds(s => s + 1);
            }, 1000);
        }
        return () => {
            if (tickRef.current) {
                clearInterval(tickRef.current);
                tickRef.current = null;
            }
        };
    }, [active, dead]);

    // Ask for notification permission once a focus session is underway, so we
    // can warn the user if they wander off and the plant is about to wilt.
    useEffect(() => {
        if (active) ensureNotificationPermissions();
    }, [active]);

    // Watch for the user leaving the app. Subscribed once; reads live state
    // via refs. Any non-active state (background OR inactive — iOS reports
    // 'inactive' when minimizing) starts the away clock and schedules a wilt
    // notification. Returning after the grace period kills the plant.
    useEffect(() => {
        const handleChange = (next: AppStateStatus) => {
            if (next === 'active') {
                const start = awayStartRef.current;
                awayStartRef.current = null;
                // If we came back in time, cancel the pending wilt notification
                cancelNotification(warningIdRef.current);
                warningIdRef.current = null;
                if (start !== null && !deadRef.current && activeRef.current) {
                    if (Date.now() - start > GRACE_MS) {
                        setDead(true);
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                    }
                }
            } else {
                // Leaving the app (background/inactive). Only arm once.
                if (awayStartRef.current === null && activeRef.current && !deadRef.current) {
                    awayStartRef.current = Date.now();
                    scheduleFocusWarning(GRACE_MS / 1000).then(id => {
                        // If we already returned before scheduling resolved, drop it
                        if (awayStartRef.current === null) {
                            cancelNotification(id);
                        } else {
                            warningIdRef.current = id;
                        }
                    });
                }
            }
        };
        const sub = AppState.addEventListener('change', handleChange);
        return () => sub.remove();
    }, []);

    // Pop the plant when it advances to a new growth stage
    useEffect(() => {
        popAnim.setValue(0.55);
        Animated.spring(popAnim, {
            toValue: 1,
            friction: 4,
            tension: 90,
            useNativeDriver: true,
        }).start();
        if (stageIndex > 0) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stageIndex]);

    // Gentle idle sway while the plant is alive
    useEffect(() => {
        if (dead) {
            swayAnim.stopAnimation();
            swayAnim.setValue(0);
            return;
        }
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(swayAnim, { toValue: 1, duration: 2200, useNativeDriver: true }),
                Animated.timing(swayAnim, { toValue: -1, duration: 2200, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [dead, swayAnim]);

    const replant = () => {
        setDead(false);
        setFocusSeconds(0);
        awayStartRef.current = null;
        cancelNotification(warningIdRef.current);
        warningIdRef.current = null;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    };

    // Cancel any pending wilt notification if we leave the study screen
    useEffect(() => {
        return () => {
            cancelNotification(warningIdRef.current);
            warningIdRef.current = null;
        };
    }, []);

    const rotate = swayAnim.interpolate({
        inputRange: [-1, 1],
        outputRange: ['-4deg', '4deg'],
    });

    // Plant container grows a little with each stage
    const potSize = 46 + stageIndex * 5;
    const emojiSize = 24 + stageIndex * 4;

    if (dead) {
        return (
            <View style={[styles.container, { backgroundColor: '#ef444415' }]}>
                <View style={[styles.pot, { width: potSize, height: potSize, backgroundColor: '#ef444420' }]}>
                    <Text style={{ fontSize: emojiSize }}>🥀</Text>
                </View>
                <View style={styles.info}>
                    <Text style={[styles.title, { color: '#ef4444' }]}>Your plant withered</Text>
                    <Text style={[styles.subtitle, { color: mutedForeground }]} numberOfLines={1}>
                        You left for more than 10s. Stay in the app to keep it alive.
                    </Text>
                </View>
                <TouchableOpacity
                    style={[styles.replantBtn, { backgroundColor: primaryColor }]}
                    onPress={replant}
                    activeOpacity={0.85}
                >
                    <RotateCcw size={16} color="#fff" strokeWidth={2.5} />
                    <Text style={styles.replantText}>Replant</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: secondaryBg }]}>
            <Animated.View style={[
                styles.pot,
                { width: potSize, height: potSize, backgroundColor: primaryColor + '18', transform: [{ scale: popAnim }, { rotate }] },
            ]}>
                <Text style={{ fontSize: emojiSize }}>{stage.emoji}</Text>
            </Animated.View>

            <View style={styles.info}>
                <Text style={[styles.title, { color: textColor }]}>{stage.label}</Text>
                <View style={[styles.progressTrack, { backgroundColor: primaryColor + '20' }]}>
                    <View style={[styles.progressFill, { width: `${Math.round(stageProgress * 100)}%`, backgroundColor: primaryColor }]} />
                </View>
            </View>

            <View style={styles.timerWrap}>
                <Text style={[styles.timer, { color: textColor }]}>{formatTime(focusSeconds)}</Text>
                <Text style={[styles.timerLabel, { color: mutedForeground }]}>focus</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        marginHorizontal: 20,
        marginTop: 8,
        marginBottom: 4,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 20,
    },
    pot: {
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    info: {
        flex: 1,
        gap: 6,
    },
    title: {
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: -0.2,
    },
    subtitle: {
        fontSize: 11,
        fontWeight: '500',
    },
    progressTrack: {
        height: 5,
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 3,
    },
    timerWrap: {
        alignItems: 'center',
        minWidth: 48,
    },
    timer: {
        fontSize: 18,
        fontWeight: '900',
        letterSpacing: -0.5,
        fontVariant: ['tabular-nums'],
    },
    timerLabel: {
        fontSize: 9,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    replantBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 14,
    },
    replantText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '800',
    },
});
