import { useToast } from '@/components/ui/Toast';
import { useThemeColor } from '@/hooks/use-theme-color';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Bird, CloudLightning, CloudRain, Droplets, Flame, Square, Trees, Waves, Wind, X } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { View as RNView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface SoundDef {
    id: string;
    name: string;
    icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
    color: string;
    src: number;
}

const SOUNDS: SoundDef[] = [
    { id: 'rain', name: 'Rain', icon: CloudRain, color: '#3b82f6', src: require('../assets/sounds/rain.mp3') },
    { id: 'waves', name: 'Ocean', icon: Waves, color: '#06b6d4', src: require('../assets/sounds/waves.mp3') },
    { id: 'fire', name: 'Campfire', icon: Flame, color: '#f97316', src: require('../assets/sounds/fire.mp3') },
    { id: 'wind', name: 'Wind', icon: Wind, color: '#64748b', src: require('../assets/sounds/wind.mp3') },
    { id: 'forest', name: 'Forest', icon: Trees, color: '#22c55e', src: require('../assets/sounds/forest.mp3') },
    { id: 'birds', name: 'Birds', icon: Bird, color: '#eab308', src: require('../assets/sounds/birds.mp3') },
    { id: 'river', name: 'River', icon: Droplets, color: '#14b8a6', src: require('../assets/sounds/river.mp3') },
    { id: 'thunder', name: 'Thunder', icon: CloudLightning, color: '#8b5cf6', src: require('../assets/sounds/thunder.mp3') },
];

interface MixEntry { playing: boolean; volume: number; }

// Module-level store so playing sounds survive the modal closing — the
// ambience keeps going while you study, and reopening restores the UI.
const players = new Map<string, AudioPlayer>();
const mixState = new Map<string, MixEntry>();
let audioModeSet = false;

async function ensureAudioMode() {
    if (audioModeSet) return;
    audioModeSet = true;
    try {
        await setAudioModeAsync({
            playsInSilentMode: true,
            shouldPlayInBackground: false,
        });
    } catch {
        // ignore
    }
}

export function anySoundPlaying(): boolean {
    for (const e of mixState.values()) {
        if (e.playing) return true;
    }
    return false;
}

export async function stopAllSounds() {
    for (const [id, player] of players) {
        try {
            player.pause();
            player.remove();
        } catch {
            // ignore
        }
        players.delete(id);
    }
    mixState.clear();
}

interface VolumeBarProps {
    value: number;
    color: string;
    trackColor: string;
    onChange: (v: number) => void;
}

// Lightweight draggable volume bar — pure JS, no native slider dependency.
//
// The fill position is LOCAL state, not derived from a parent re-render.
// Dragging used to call all the way up into the mixer's shared re-render,
// which re-rendered the entire 8-tile grid on every touch-move tick and
// made the drag feel laggy/unresponsive. Now the bar updates its own visual
// state instantly and independently; the volume change is still propagated
// up (to actually adjust playback + persist it), it just doesn't have to
// wait on a full-tree re-render to look right.
//
// Also deliberately uses pageX (screen-absolute) minus the track's measured
// screen offset, not nativeEvent.locationX. locationX is relative to
// whatever view currently sits under the finger, which can drift mid-drag
// once the touch moves off its starting element — that produces jitter.
function VolumeBar({ value, color, trackColor, onChange }: VolumeBarProps) {
    const containerRef = useRef<RNView>(null);
    const widthRef = useRef(1);
    const originXRef = useRef(0);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const [display, setDisplay] = useState(value);
    // Stay in sync when the value changes externally (Stop All, reopening
    // the mixer after a value was set elsewhere).
    useEffect(() => { setDisplay(value); }, [value]);

    const updateFromPageX = (pageX: number) => {
        const fraction = Math.max(0, Math.min(1, (pageX - originXRef.current) / widthRef.current));
        setDisplay(fraction);
        onChangeRef.current(fraction);
    };

    const measure = () => {
        containerRef.current?.measure((_x, _y, width, _height, pageX) => {
            widthRef.current = width || 1;
            originXRef.current = pageX;
        });
    };

    const pan = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: (e) => {
                measure();
                updateFromPageX(e.nativeEvent.pageX);
            },
            onPanResponderMove: (e) => {
                updateFromPageX(e.nativeEvent.pageX);
            },
        })
    ).current;

    return (
        <View
            ref={containerRef}
            style={styles.volumeHit}
            onLayout={measure}
            accessibilityRole="adjustable"
            accessibilityLabel="Volume"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(display * 100) }}
            {...pan.panHandlers}
        >
            <View style={[styles.volumeTrack, { backgroundColor: trackColor }]}>
                <View style={[styles.volumeFill, { width: `${Math.round(display * 100)}%`, backgroundColor: color }]} />
            </View>
        </View>
    );
}

// Small animated equalizer bars — the clearest possible "yes, this is
// actually playing" signal, since a border tint alone is easy to miss.
function PlayingIndicator({ color }: { color: string }) {
    const bars = useRef([0, 1, 2].map(() => new Animated.Value(0.35))).current;

    useEffect(() => {
        const loops = bars.map((bar, i) =>
            Animated.loop(
                Animated.sequence([
                    Animated.delay(i * 120),
                    Animated.timing(bar, { toValue: 1, duration: 320, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
                    Animated.timing(bar, { toValue: 0.35, duration: 320, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
                ])
            )
        );
        loops.forEach(l => l.start());
        return () => loops.forEach(l => l.stop());
    }, [bars]);

    return (
        <View style={styles.eqRow}>
            {bars.map((bar, i) => (
                <Animated.View
                    key={i}
                    style={[
                        styles.eqBar,
                        {
                            backgroundColor: color,
                            height: bar.interpolate({ inputRange: [0.35, 1], outputRange: [4, 12] }),
                        },
                    ]}
                />
            ))}
        </View>
    );
}

interface SoundMixerProps {
    visible: boolean;
    onClose: () => void;
}

const CLOSED_TRANSLATE_Y = 480;

export function SoundMixer({ visible, onClose }: SoundMixerProps) {
    const insets = useSafeAreaInsets();
    const { showToast } = useToast();
    const [, forceRender] = useState(0);
    const rerender = () => forceRender(n => n + 1);
    const [loadingId, setLoadingId] = useState<string | null>(null);

    // The native Modal stays mounted slightly longer than `visible` so the
    // close animation (backdrop fade + sheet slide-down) can finish before
    // the modal actually disappears, instead of vanishing mid-transition.
    const [mounted, setMounted] = useState(visible);
    const overlayOpacity = useRef(new Animated.Value(0)).current;
    const sheetTranslateY = useRef(new Animated.Value(CLOSED_TRANSLATE_Y)).current;

    useEffect(() => {
        if (visible) {
            setMounted(true);
            Animated.parallel([
                Animated.timing(overlayOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
                Animated.spring(sheetTranslateY, { toValue: 0, damping: 22, stiffness: 220, mass: 0.9, useNativeDriver: true }),
            ]).start();
        } else if (mounted) {
            Animated.parallel([
                Animated.timing(overlayOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
                Animated.timing(sheetTranslateY, { toValue: CLOSED_TRANSLATE_Y, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
            ]).start(({ finished }) => {
                // If this close was interrupted by a reopen (e.g. rapid
                // tap), `finished` is false — don't unmount out from under
                // the animation that's now playing us back in.
                if (finished) setMounted(false);
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    const backgroundColor = useThemeColor({}, 'background');
    const textColor = useThemeColor({}, 'text');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const secondaryBg = useThemeColor({}, 'secondary');
    const primaryColor = useThemeColor({}, 'primary');

    const getEntry = (id: string): MixEntry => mixState.get(id) || { playing: false, volume: 0.6 };

    const toggleSound = async (def: SoundDef) => {
        if (loadingId) return; // one load at a time avoids overlapping taps
        await ensureAudioMode();
        const entry = getEntry(def.id);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        if (entry.playing) {
            const player = players.get(def.id);
            if (player) {
                try { player.pause(); } catch { /* ignore */ }
            }
            mixState.set(def.id, { ...entry, playing: false });
            rerender();
            return;
        }

        setLoadingId(def.id);
        try {
            let player = players.get(def.id);
            if (!player) {
                player = createAudioPlayer(def.src);
                player.loop = true;
                players.set(def.id, player);
            }
            player.volume = entry.volume;
            player.play();

            mixState.set(def.id, { ...entry, playing: true });
            rerender();
        } catch (e) {
            console.error('Error playing ambient sound:', def.id, e);
            showToast({ message: `Couldn't play ${def.name}. Try again.`, type: 'error' });
            // Clean up a half-created player so the next tap starts fresh
            const failed = players.get(def.id);
            if (failed) {
                try { failed.remove(); } catch { /* ignore */ }
                players.delete(def.id);
            }
        } finally {
            setLoadingId(null);
        }
    };

    // Called continuously while dragging — deliberately does NOT trigger a
    // parent re-render (see VolumeBar). It only writes through to the audio
    // engine and the shared store.
    const changeVolume = (def: SoundDef, volume: number) => {
        const entry = getEntry(def.id);
        mixState.set(def.id, { ...entry, volume });
        const player = players.get(def.id);
        if (player) {
            try { player.volume = volume; } catch { /* ignore */ }
        }
    };

    const handleStopAll = async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await stopAllSounds();
        rerender();
    };

    // Keep the UI in sync when reopened
    useEffect(() => {
        if (visible) rerender();
    }, [visible]);

    const activeCount = SOUNDS.filter(s => getEntry(s.id).playing).length;

    if (!mounted) return null;

    return (
        <Modal visible={mounted} animationType="none" transparent onRequestClose={onClose}>
            <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
                <TouchableOpacity style={styles.dismiss} activeOpacity={1} onPress={onClose} />
                <Animated.View style={[styles.sheet, { backgroundColor, paddingBottom: Math.max(insets.bottom, 20), transform: [{ translateY: sheetTranslateY }] }]}>
                    <View style={styles.header}>
                        <View>
                            <Text style={[styles.title, { color: textColor }]}>Sound Mixer</Text>
                            <Text style={[styles.subtitle, { color: mutedForeground }]}>
                                {activeCount > 0 ? `${activeCount} playing` : 'Blend ambient sounds to focus'}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Close sound mixer" accessibilityRole="button">
                            <X size={22} color={textColor} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.grid}>
                        {SOUNDS.map(def => {
                            const entry = getEntry(def.id);
                            const Icon = def.icon;
                            const isLoading = loadingId === def.id;
                            return (
                                <View
                                    key={def.id}
                                    style={[
                                        styles.tile,
                                        { backgroundColor: secondaryBg, borderColor: entry.playing ? def.color : 'transparent' },
                                    ]}
                                >
                                    <TouchableOpacity
                                        style={styles.tileTop}
                                        onPress={() => toggleSound(def)}
                                        activeOpacity={0.7}
                                        disabled={isLoading}
                                        accessibilityLabel={`${entry.playing ? 'Stop' : 'Play'} ${def.name} sound`}
                                        accessibilityRole="button"
                                    >
                                        <View style={[
                                            styles.tileIcon,
                                            { backgroundColor: entry.playing ? def.color : def.color + '22' },
                                        ]}>
                                            {isLoading ? (
                                                <ActivityIndicator size="small" color={entry.playing ? '#fff' : def.color} />
                                            ) : (
                                                <Icon size={22} color={entry.playing ? '#fff' : def.color} strokeWidth={2.4} />
                                            )}
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.tileName, { color: textColor }]}>{def.name}</Text>
                                            {entry.playing && <PlayingIndicator color={def.color} />}
                                        </View>
                                    </TouchableOpacity>

                                    <VolumeBar
                                        value={entry.volume}
                                        color={entry.playing ? def.color : mutedForeground}
                                        trackColor={mutedForeground + '25'}
                                        onChange={(v) => changeVolume(def, v)}
                                    />
                                </View>
                            );
                        })}
                    </ScrollView>

                    <TouchableOpacity
                        style={[styles.stopBtn, { backgroundColor: activeCount > 0 ? primaryColor : secondaryBg }]}
                        onPress={handleStopAll}
                        disabled={activeCount === 0}
                        activeOpacity={0.85}
                        accessibilityLabel="Stop all ambient sounds"
                        accessibilityRole="button"
                    >
                        <Square size={16} color={activeCount > 0 ? '#fff' : mutedForeground} fill={activeCount > 0 ? '#fff' : 'none'} strokeWidth={2.5} />
                        <Text style={[styles.stopText, { color: activeCount > 0 ? '#fff' : mutedForeground }]}>Stop All</Text>
                    </TouchableOpacity>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    dismiss: {
        flex: 1,
    },
    sheet: {
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: 24,
        maxHeight: '86%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: '900',
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 13,
        fontWeight: '600',
        marginTop: 2,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    tile: {
        width: '48.5%',
        borderRadius: 20,
        padding: 14,
        marginBottom: 12,
        borderWidth: 2,
    },
    tileTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 14,
    },
    tileIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tileName: {
        fontSize: 15,
        fontWeight: '800',
        letterSpacing: -0.2,
    },
    eqRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 3,
        marginTop: 4,
        height: 12,
    },
    eqBar: {
        width: 3,
        borderRadius: 1.5,
    },
    volumeHit: {
        paddingVertical: 8,
    },
    volumeTrack: {
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
    },
    volumeFill: {
        height: '100%',
        borderRadius: 3,
    },
    stopBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 52,
        borderRadius: 18,
        marginTop: 8,
    },
    stopText: {
        fontSize: 15,
        fontWeight: '800',
    },
});
