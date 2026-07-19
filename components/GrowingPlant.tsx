import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

// ---------------------------------------------------------------------------
// GrowingPlant — a procedurally drawn plant that visibly grows with progress.
// The stem extends along a curve, leaves unfurl one by one as the stem passes
// them, and a bud opens into a bloom over the final stretch. Also renders a
// drooped wilted variant. Shared by the Focus session screen and the small
// focus companion on the study screens.
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
    return Math.max(0, Math.min(1, v));
}

// Stem path: cubic bezier from the soil up to the tip (120×120 viewBox,
// y grows downward), pre-sampled so the visible portion can be sliced.
const STEM_SAMPLES = 48;
const STEM_POINTS: [number, number][] = Array.from({ length: STEM_SAMPLES + 1 }, (_, i) => {
    const t = i / STEM_SAMPLES;
    const u = 1 - t;
    const b = (a: number, c1: number, c2: number, d: number) =>
        u * u * u * a + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t * d;
    return [b(60, 50, 70, 57), b(104, 82, 56, 24)];
});

// Almond leaf pointing along +x, ~19 units long; placed via transforms.
const LEAF_D = 'M0 0 C5 -6, 14 -7, 19 -1 C14 6, 5 5, 0 0 Z';

// Where each leaf sits on the stem (t along the curve), how it's angled and
// how large it grows. The first pair are the seed leaves, visible from start.
const LEAVES: { t: number; angle: number; size: number; opacity: number }[] = [
    { t: 0.06, angle: -168, size: 0.55, opacity: 0.7 },
    { t: 0.06, angle: -12, size: 0.55, opacity: 0.7 },
    { t: 0.3, angle: -26, size: 0.95, opacity: 0.95 },
    { t: 0.45, angle: -154, size: 1.1, opacity: 0.8 },
    { t: 0.6, angle: -22, size: 1.0, opacity: 0.95 },
    { t: 0.74, angle: -158, size: 0.8, opacity: 0.8 },
];

export interface GrowingPlantProps {
    progress: number;   // 0..1 session progress
    size: number;
    color: string;      // stem, foliage and bloom
    soilColor: string;
    wilted?: boolean;
    sway?: boolean;     // gentle idle sway while alive
}

export function GrowingPlant({ progress, size, color, soilColor, wilted = false, sway = false }: GrowingPlantProps) {
    const swayAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!sway || wilted) {
            swayAnim.stopAnimation();
            swayAnim.setValue(0);
            return;
        }
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(swayAnim, { toValue: 1, duration: 2600, useNativeDriver: true }),
                Animated.timing(swayAnim, { toValue: -1, duration: 2600, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [sway, wilted, swayAnim]);

    const rotate = swayAnim.interpolate({ inputRange: [-1, 1], outputRange: ['-2.5deg', '2.5deg'] });

    // The stem starts as a small sprout nub and reaches full height at 100%.
    const p = clamp01(progress);
    const stemFrac = wilted ? 1 : Math.min(1, 0.14 + 0.86 * Math.pow(p, 0.85));
    const lastIdx = Math.max(1, Math.round(stemFrac * STEM_SAMPLES));
    const tip = STEM_POINTS[lastIdx];
    const stemD = 'M' + STEM_POINTS
        .slice(0, lastIdx + 1)
        .map(([x, y], i) => `${i === 0 ? '' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
        .join(' ');

    // Bud swells late in the session, then five petals open around it.
    const budK = clamp01((p - 0.7) / 0.14);
    const bloomK = clamp01((p - 0.86) / 0.14);
    const ease = (k: number) => 1 - (1 - k) * (1 - k);

    return (
        <Animated.View style={{ width: size, height: size, transform: [{ rotate }], transformOrigin: '50% 100%' }}>
            <Svg width={size} height={size} viewBox="0 0 120 120">
                <Ellipse cx={60} cy={105} rx={17} ry={4.5} fill={soilColor} />

                {wilted ? (
                    <>
                        {/* Bent-over stem with a hanging head and dropped leaves */}
                        <Path
                            d="M60 104 C54 84, 60 66, 72 60 C80 56, 87 59, 87 67"
                            stroke={color} strokeWidth={3.6} strokeLinecap="round" fill="none"
                        />
                        <G transform="translate(58 82) rotate(150)">
                            <Path d={LEAF_D} fill={color} opacity={0.75} />
                        </G>
                        <G transform="translate(64 70) rotate(28) scale(0.9)">
                            <Path d={LEAF_D} fill={color} opacity={0.6} />
                        </G>
                        {/* Closed flower head hanging down */}
                        <G transform="translate(87 67)">
                            <Ellipse cx={0} cy={7} rx={3.4} ry={6.5} fill={color} opacity={0.55} />
                            <Ellipse cx={-3.5} cy={6} rx={3} ry={6} fill={color} opacity={0.4} transform="rotate(20)" />
                            <Ellipse cx={3.5} cy={6} rx={3} ry={6} fill={color} opacity={0.4} transform="rotate(-20)" />
                        </G>
                        {/* Fallen petals */}
                        <Ellipse cx={76} cy={102} rx={3.4} ry={1.6} fill={color} opacity={0.35} />
                        <Ellipse cx={92} cy={100} rx={3} ry={1.4} fill={color} opacity={0.3} />
                    </>
                ) : (
                    <>
                        <Path d={stemD} stroke={color} strokeWidth={3.6} strokeLinecap="round" fill="none" />

                        {LEAVES.map((leaf, i) => {
                            const k = ease(clamp01((stemFrac - leaf.t - 0.02) / (leaf.t < 0.1 ? 0.06 : 0.1)));
                            if (k < 0.03) return null;
                            const idx = Math.min(STEM_SAMPLES, Math.round(leaf.t * STEM_SAMPLES));
                            const [x, y] = STEM_POINTS[idx];
                            return (
                                <G key={i} transform={`translate(${x} ${y}) rotate(${leaf.angle}) scale(${(k * leaf.size).toFixed(3)})`}>
                                    <Path d={LEAF_D} fill={color} opacity={leaf.opacity} />
                                </G>
                            );
                        })}

                        {budK > 0 && bloomK < 1 && (
                            <Circle cx={tip[0]} cy={tip[1]} r={3.5 * ease(budK)} fill={color} opacity={0.9} />
                        )}
                        {bloomK > 0 && (
                            <G transform={`translate(${tip[0]} ${tip[1]}) scale(${ease(bloomK).toFixed(3)})`}>
                                {[0, 72, 144, 216, 288].map(angle => (
                                    <Ellipse key={angle} cx={0} cy={-7} rx={4.2} ry={7.2} fill={color} opacity={0.5} transform={`rotate(${angle})`} />
                                ))}
                                <Circle cx={0} cy={0} r={3} fill={color} />
                            </G>
                        )}
                    </>
                )}
            </Svg>
        </Animated.View>
    );
}
