import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

// ---------------------------------------------------------------------------
// GrowingPlant — a procedurally drawn plant that visibly grows with progress.
// The stem extends along a curve, leaves unfurl one by one as the stem passes
// them, and a bud opens into a bloom over the final stretch. Also renders a
// drooped wilted variant. Shared by the Focus session screen, the small focus
// companion on the study screens, and the Grove.
//
// `species` selects one of several plant varieties (stem curve, leaf shape,
// bloom type). Species 0 is the original flower and stays the default so the
// focus screens keep their look; the Grove assigns species per deck.
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
    return Math.max(0, Math.min(1, v));
}

type BloomKind = 'petals' | 'tulip' | 'bell' | 'daisy' | 'berries' | 'sunflower' | 'rose';

interface LeafSpec { t: number; angle: number; size: number; opacity: number }

interface SpeciesSpec {
    // Cubic bezier control values for the stem, soil (60,104) up to the tip.
    stemX: [number, number, number, number];
    stemY: [number, number, number, number];
    leafD: string;
    leaves: LeafSpec[];
    bloom: BloomKind;
}

// Leaf silhouettes, all pointing along +x and placed via transforms.
const LEAF_ALMOND = 'M0 0 C5 -6, 14 -7, 19 -1 C14 6, 5 5, 0 0 Z';
const LEAF_SLENDER = 'M0 0 C4 -3, 15 -5, 22 -1 C15 3, 4 2, 0 0 Z';
const LEAF_ROUND = 'M0 0 C4 -7, 12 -8, 15 -2 C12 4, 4 4, 0 0 Z';

const SPECIES: SpeciesSpec[] = [
    {
        // 0 — the original five-petal flower
        stemX: [60, 50, 70, 57],
        stemY: [104, 82, 56, 24],
        leafD: LEAF_ALMOND,
        leaves: [
            { t: 0.06, angle: -168, size: 0.55, opacity: 0.7 },
            { t: 0.06, angle: -12, size: 0.55, opacity: 0.7 },
            { t: 0.3, angle: -26, size: 0.95, opacity: 0.95 },
            { t: 0.45, angle: -154, size: 1.1, opacity: 0.8 },
            { t: 0.6, angle: -22, size: 1.0, opacity: 0.95 },
            { t: 0.74, angle: -158, size: 0.8, opacity: 0.8 },
        ],
        bloom: 'petals',
    },
    {
        // 1 — tulip: tall straight stem, slender upward leaves, cup bloom
        stemX: [60, 58, 62, 60],
        stemY: [104, 80, 50, 26],
        leafD: LEAF_SLENDER,
        leaves: [
            { t: 0.08, angle: -150, size: 0.8, opacity: 0.7 },
            { t: 0.12, angle: -30, size: 0.9, opacity: 0.8 },
            { t: 0.34, angle: -40, size: 1.1, opacity: 0.95 },
            { t: 0.5, angle: -142, size: 1.0, opacity: 0.8 },
        ],
        bloom: 'tulip',
    },
    {
        // 2 — bellflower: arcing stem with a bloom that hangs from the tip
        stemX: [60, 52, 74, 68],
        stemY: [104, 84, 52, 30],
        leafD: LEAF_ROUND,
        leaves: [
            { t: 0.07, angle: -165, size: 0.7, opacity: 0.7 },
            { t: 0.22, angle: -20, size: 0.95, opacity: 0.9 },
            { t: 0.42, angle: -152, size: 1.05, opacity: 0.8 },
            { t: 0.6, angle: -24, size: 0.85, opacity: 0.9 },
        ],
        bloom: 'bell',
    },
    {
        // 3 — daisy: gently weaving stem, many thin petals
        stemX: [60, 66, 52, 58],
        stemY: [104, 80, 54, 28],
        leafD: LEAF_SLENDER,
        leaves: [
            { t: 0.08, angle: -155, size: 0.7, opacity: 0.7 },
            { t: 0.1, angle: -25, size: 0.7, opacity: 0.7 },
            { t: 0.36, angle: -150, size: 0.95, opacity: 0.85 },
            { t: 0.55, angle: -28, size: 0.9, opacity: 0.9 },
            { t: 0.7, angle: -156, size: 0.7, opacity: 0.8 },
        ],
        bloom: 'daisy',
    },
    {
        // 4 — berry bush: squat stem crowded with leaves, berries on top
        stemX: [60, 56, 66, 60],
        stemY: [104, 86, 62, 40],
        leafD: LEAF_ALMOND,
        leaves: [
            { t: 0.08, angle: -170, size: 0.65, opacity: 0.7 },
            { t: 0.1, angle: -10, size: 0.65, opacity: 0.7 },
            { t: 0.28, angle: -30, size: 0.9, opacity: 0.9 },
            { t: 0.38, angle: -150, size: 0.95, opacity: 0.8 },
            { t: 0.52, angle: -20, size: 0.9, opacity: 0.95 },
            { t: 0.64, angle: -160, size: 0.85, opacity: 0.8 },
            { t: 0.78, angle: -35, size: 0.7, opacity: 0.9 },
            { t: 0.86, angle: -145, size: 0.6, opacity: 0.8 },
        ],
        bloom: 'berries',
    },
    {
        // 5 — sunflower (rare, grown from a harvested seed): the tallest
        // stem in the grove with a big ringed bloom
        stemX: [60, 59, 61, 60],
        stemY: [104, 78, 46, 20],
        leafD: LEAF_ALMOND,
        leaves: [
            { t: 0.1, angle: -160, size: 0.85, opacity: 0.7 },
            { t: 0.14, angle: -20, size: 0.85, opacity: 0.75 },
            { t: 0.4, angle: -28, size: 1.15, opacity: 0.95 },
            { t: 0.55, angle: -152, size: 1.05, opacity: 0.8 },
        ],
        bloom: 'sunflower',
    },
    {
        // 6 — rose (rare, grown from a harvested seed): layered swirl bloom
        stemX: [60, 54, 68, 59],
        stemY: [104, 82, 54, 27],
        leafD: LEAF_ROUND,
        leaves: [
            { t: 0.08, angle: -165, size: 0.7, opacity: 0.7 },
            { t: 0.26, angle: -22, size: 0.9, opacity: 0.9 },
            { t: 0.44, angle: -150, size: 0.95, opacity: 0.8 },
            { t: 0.62, angle: -26, size: 0.85, opacity: 0.9 },
        ],
        bloom: 'rose',
    },
];

// Everyday varieties are hash-assigned to decks; anything past this index is
// a rare variety that only a harvested seed can plant.
export const BASE_SPECIES_COUNT = 5;
export const PLANT_SPECIES_COUNT = SPECIES.length;

export const SPECIES_NAMES: string[] = ['Wildflower', 'Tulip', 'Bellflower', 'Daisy', 'Berry Bush', 'Sunflower', 'Rose'];

// Planters — a purely cosmetic vessel drawn under the soil, purchased with
// dew and assigned per deck (see docs/grove-spec.md, phase 4). 'classic' is
// the bare soil mound every plant already had and stays free. Line-art only,
// drawn in the same single soilColor as everything else so the grove keeps
// its monochrome slate look — no new hues, just shape.
export const POT_STYLES = ['classic', 'terracotta', 'bowl', 'hex', 'scalloped'] as const;
export type PotStyle = typeof POT_STYLES[number];
export const POT_NAMES: Record<PotStyle, string> = {
    classic: 'Bare Soil',
    terracotta: 'Terracotta',
    bowl: 'Round Bowl',
    hex: 'Hex Planter',
    scalloped: 'Scalloped',
};

function Pot({ style, color }: { style: PotStyle; color: string }) {
    switch (style) {
        case 'terracotta':
            return (
                <>
                    <Path d="M43 106 L77 106 L71 121 L49 121 Z" fill={color} opacity={0.3} />
                    <Path d="M43 106 L77 106 L71 121 L49 121 Z" stroke={color} strokeWidth={1.4} fill="none" opacity={0.75} />
                    <Path d="M40 106 L80 106" stroke={color} strokeWidth={3} strokeLinecap="round" opacity={0.85} />
                </>
            );
        case 'bowl':
            return (
                <>
                    <Ellipse cx={60} cy={113} rx={23} ry={8} fill={color} opacity={0.3} />
                    <Ellipse cx={60} cy={113} rx={23} ry={8} stroke={color} strokeWidth={1.4} fill="none" opacity={0.7} />
                    <Ellipse cx={60} cy={106} rx={25} ry={3.4} fill={color} opacity={0.85} />
                </>
            );
        case 'hex':
            return (
                <>
                    <Path d="M45 106 L75 106 L82 113 L73 121 L47 121 L38 113 Z" fill={color} opacity={0.3} />
                    <Path d="M45 106 L75 106 L82 113 L73 121 L47 121 L38 113 Z" stroke={color} strokeWidth={1.4} fill="none" opacity={0.75} />
                    <Path d="M42 106 L78 106" stroke={color} strokeWidth={3} strokeLinecap="round" opacity={0.85} />
                </>
            );
        case 'scalloped':
            return (
                <>
                    <Path d="M44 108 L76 108 L70 121 L50 121 Z" fill={color} opacity={0.3} />
                    <Path d="M44 108 L76 108 L70 121 L50 121 Z" stroke={color} strokeWidth={1.4} fill="none" opacity={0.75} />
                    {[46, 53, 60, 67, 74].map(cx => (
                        <Circle key={cx} cx={cx} cy={107} r={2.6} fill={color} opacity={0.85} />
                    ))}
                </>
            );
        default:
            return null;
    }
}

// Pre-sampled stem points per species so the visible portion can be sliced.
const STEM_SAMPLES = 48;
const STEM_POINTS: [number, number][][] = SPECIES.map(spec =>
    Array.from({ length: STEM_SAMPLES + 1 }, (_, i) => {
        const t = i / STEM_SAMPLES;
        const u = 1 - t;
        const b = (a: number, c1: number, c2: number, d: number) =>
            u * u * u * a + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t * d;
        return [
            b(spec.stemX[0], spec.stemX[1], spec.stemX[2], spec.stemX[3]),
            b(spec.stemY[0], spec.stemY[1], spec.stemY[2], spec.stemY[3]),
        ] as [number, number];
    })
);

function Bloom({ kind, tip, budK, bloomK, color }: {
    kind: BloomKind;
    tip: [number, number];
    budK: number;
    bloomK: number;
    color: string;
}) {
    const ease = (k: number) => 1 - (1 - k) * (1 - k);

    if (budK > 0 && bloomK < 1 && kind !== 'berries') {
        // A swelling bud precedes every bloom except the berry cluster
        if (bloomK <= 0) {
            return <Circle cx={tip[0]} cy={tip[1]} r={3.5 * ease(budK)} fill={color} opacity={0.9} />;
        }
    }
    if (bloomK <= 0) {
        if (kind === 'berries' && budK > 0) {
            return <Circle cx={tip[0]} cy={tip[1]} r={2.5 * ease(budK)} fill={color} opacity={0.8} />;
        }
        return null;
    }

    const s = ease(bloomK).toFixed(3);
    switch (kind) {
        case 'petals':
            return (
                <G transform={`translate(${tip[0]} ${tip[1]}) scale(${s})`}>
                    {[0, 72, 144, 216, 288].map(angle => (
                        <Ellipse key={angle} cx={0} cy={-7} rx={4.2} ry={7.2} fill={color} opacity={0.5} transform={`rotate(${angle})`} />
                    ))}
                    <Circle cx={0} cy={0} r={3} fill={color} />
                </G>
            );
        case 'tulip':
            return (
                <G transform={`translate(${tip[0]} ${tip[1]}) scale(${s})`}>
                    <Ellipse cx={-3.6} cy={-5} rx={3.4} ry={7} fill={color} opacity={0.45} transform="rotate(-16 -3.6 -5)" />
                    <Ellipse cx={3.6} cy={-5} rx={3.4} ry={7} fill={color} opacity={0.45} transform="rotate(16 3.6 -5)" />
                    <Ellipse cx={0} cy={-6} rx={3.8} ry={7.6} fill={color} opacity={0.75} />
                </G>
            );
        case 'bell':
            // Hangs from the stem tip like a snowdrop
            return (
                <G transform={`translate(${tip[0]} ${tip[1]}) rotate(24) scale(${s})`}>
                    <Path d="M0 1 C-4.5 2, -5 7, -4.5 10 L4.5 10 C5 7, 4.5 2, 0 1 Z" fill={color} opacity={0.7} />
                    <Ellipse cx={-3} cy={11} rx={1.5} ry={2.2} fill={color} opacity={0.55} />
                    <Ellipse cx={0} cy={11.5} rx={1.5} ry={2.4} fill={color} opacity={0.7} />
                    <Ellipse cx={3} cy={11} rx={1.5} ry={2.2} fill={color} opacity={0.55} />
                </G>
            );
        case 'daisy':
            return (
                <G transform={`translate(${tip[0]} ${tip[1]}) scale(${s})`}>
                    {Array.from({ length: 10 }, (_, i) => i * 36).map(angle => (
                        <Ellipse key={angle} cx={0} cy={-7.5} rx={1.9} ry={7} fill={color} opacity={0.45} transform={`rotate(${angle})`} />
                    ))}
                    <Circle cx={0} cy={0} r={3.2} fill={color} opacity={0.9} />
                </G>
            );
        case 'berries':
            return (
                <G transform={`translate(${tip[0]} ${tip[1]}) scale(${s})`}>
                    <Circle cx={0} cy={-4} r={2.6} fill={color} opacity={0.85} />
                    <Circle cx={-3.6} cy={0.5} r={2.4} fill={color} opacity={0.6} />
                    <Circle cx={3.6} cy={0.5} r={2.4} fill={color} opacity={0.7} />
                    <Circle cx={0} cy={2.5} r={2.2} fill={color} opacity={0.5} />
                </G>
            );
        case 'sunflower':
            return (
                <G transform={`translate(${tip[0]} ${tip[1]}) scale(${s})`}>
                    {Array.from({ length: 12 }, (_, i) => i * 30).map(angle => (
                        <Ellipse key={angle} cx={0} cy={-8} rx={2.4} ry={6.8} fill={color} opacity={0.5} transform={`rotate(${angle})`} />
                    ))}
                    <Circle cx={0} cy={0} r={4.8} fill={color} opacity={0.9} />
                    <Circle cx={0} cy={0} r={2.4} fill={color} opacity={0.5} />
                </G>
            );
        case 'rose':
            return (
                <G transform={`translate(${tip[0]} ${tip[1]}) scale(${s})`}>
                    {[0, 72, 144, 216, 288].map(angle => (
                        <Ellipse key={angle} cx={0} cy={-4.5} rx={4.6} ry={5.4} fill={color} opacity={0.3} transform={`rotate(${angle})`} />
                    ))}
                    {[36, 108, 180, 252, 324].map(angle => (
                        <Ellipse key={angle} cx={0} cy={-2.8} rx={3.2} ry={4} fill={color} opacity={0.45} transform={`rotate(${angle})`} />
                    ))}
                    <Circle cx={0} cy={0} r={2.6} fill={color} opacity={0.85} />
                </G>
            );
    }
}

export interface GrowingPlantProps {
    progress: number;   // 0..1 session progress
    size: number;
    color: string;      // stem, foliage and bloom
    soilColor: string;
    wilted?: boolean;
    sway?: boolean;     // gentle idle sway while alive
    species?: number;   // plant variety; defaults to the original flower
    potStyle?: PotStyle; // cosmetic planter; defaults to bare soil
}

export function GrowingPlant({ progress, size, color, soilColor, wilted = false, sway = false, species = 0, potStyle = 'classic' }: GrowingPlantProps) {
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

    const idx = ((Math.floor(species) % SPECIES.length) + SPECIES.length) % SPECIES.length;
    const spec = SPECIES[idx];
    const points = STEM_POINTS[idx];

    // The stem starts as a small sprout nub and reaches full height at 100%.
    const p = clamp01(progress);
    const stemFrac = wilted ? 1 : Math.min(1, 0.14 + 0.86 * Math.pow(p, 0.85));
    const lastIdx = Math.max(1, Math.round(stemFrac * STEM_SAMPLES));
    const tip = points[lastIdx];
    const stemD = 'M' + points
        .slice(0, lastIdx + 1)
        .map(([x, y], i) => `${i === 0 ? '' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
        .join(' ');

    // Bud swells late in the session, then the bloom opens.
    const budK = clamp01((p - 0.7) / 0.14);
    const bloomK = clamp01((p - 0.86) / 0.14);
    const ease = (k: number) => 1 - (1 - k) * (1 - k);

    return (
        <Animated.View style={{ width: size, height: size, transform: [{ rotate }], transformOrigin: '50% 100%' }}>
            <Svg width={size} height={size} viewBox="0 0 120 120">
                <Ellipse cx={60} cy={105} rx={17} ry={4.5} fill={soilColor} />
                <Pot style={potStyle} color={soilColor} />

                {wilted ? (
                    <>
                        {/* Bent-over stem with a hanging head and dropped leaves */}
                        <Path
                            d="M60 104 C54 84, 60 66, 72 60 C80 56, 87 59, 87 67"
                            stroke={color} strokeWidth={3.6} strokeLinecap="round" fill="none"
                        />
                        <G transform="translate(58 82) rotate(150)">
                            <Path d={spec.leafD} fill={color} opacity={0.75} />
                        </G>
                        <G transform="translate(64 70) rotate(28) scale(0.9)">
                            <Path d={spec.leafD} fill={color} opacity={0.6} />
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

                        {spec.leaves.map((leaf, i) => {
                            const k = ease(clamp01((stemFrac - leaf.t - 0.02) / (leaf.t < 0.1 ? 0.06 : 0.1)));
                            if (k < 0.03) return null;
                            const pIdx = Math.min(STEM_SAMPLES, Math.round(leaf.t * STEM_SAMPLES));
                            const [x, y] = points[pIdx];
                            return (
                                <G key={i} transform={`translate(${x} ${y}) rotate(${leaf.angle}) scale(${(k * leaf.size).toFixed(3)})`}>
                                    <Path d={spec.leafD} fill={color} opacity={leaf.opacity} />
                                </G>
                            );
                        })}

                        <Bloom kind={spec.bloom} tip={tip} budK={budK} bloomK={bloomK} color={color} />
                    </>
                )}
            </Svg>
        </Animated.View>
    );
}
