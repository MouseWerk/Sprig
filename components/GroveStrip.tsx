import { GrowingPlant } from '@/components/GrowingPlant';
import { useLanguage } from '@/contexts/LanguageContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { GrovePlant } from '@/utils/Grove';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Circle, Path, Svg } from 'react-native-svg';

// A row of grove plants standing side by side on a shared ground line, like a
// window-sill planter. Plant height scales with growth stage so the strip reads
// as a garden silhouette at a glance. Used on the Home dashboard and as the
// hero of the Grove screen.

// Purchased grove-wide backdrop (see docs/grove-spec.md phase 4), drawn as a
// repeating line-art motif along the same ground line every plant stands on.
// Same monochrome-slate rule as the pots: one color, shape carries the design.
function GroundDecoration({ id, color, width }: { id: string; color: string; width: number }) {
    const count = Math.max(3, Math.round(width / 46));
    const step = width / count;
    const items = Array.from({ length: count }, (_, i) => step * (i + 0.5));

    if (id === 'fence') {
        return (
            <Svg width={width} height={22} style={styles.decorationSvg}>
                <Path d={`M0 18 L${width} 18`} stroke={color} strokeWidth={2} opacity={0.5} />
                {items.map((x, i) => (
                    <Path key={i} d={`M${x - 1.5} 6 L${x + 1.5} 6 L${x + 1.5} 20 L${x - 1.5} 20 Z M${x - 4} 9 L${x + 4} 9`} stroke={color} strokeWidth={1.4} fill={color} opacity={0.6} />
                ))}
            </Svg>
        );
    }
    if (id === 'lanterns') {
        return (
            <Svg width={width} height={26} style={styles.decorationSvg}>
                {items.map((x, i) => (
                    <React.Fragment key={i}>
                        <Path d={`M${x} 0 L${x} 8`} stroke={color} strokeWidth={1.2} opacity={0.5} />
                        <Path d={`M${x - 4} 8 L${x + 4} 8 L${x + 3.5} 19 L${x - 3.5} 19 Z`} stroke={color} strokeWidth={1.4} fill={color} opacity={0.35} />
                        <Circle cx={x} cy={13.5} r={1.6} fill={color} opacity={0.75} />
                    </React.Fragment>
                ))}
            </Svg>
        );
    }
    if (id === 'stones') {
        return (
            <Svg width={width} height={10} style={styles.decorationSvg}>
                {items.map((x, i) => (
                    <Path key={i} d={`M${x - 5} 8 Q${x - 5} 2, ${x} 2 Q${x + 5} 2, ${x + 5} 8 Z`} fill={color} opacity={i % 2 === 0 ? 0.55 : 0.4} />
                ))}
            </Svg>
        );
    }
    if (id === 'pathway') {
        return (
            <Svg width={width} height={8} style={styles.decorationSvg}>
                {items.map((x, i) => (
                    <Path key={i} d={`M${x - 7} 1 L${x + 7} 1 L${x + 9} 7 L${x - 9} 7 Z`} fill={color} opacity={i % 2 === 0 ? 0.5 : 0.35} />
                ))}
            </Svg>
        );
    }
    if (id === 'hedge') {
        return (
            <Svg width={width} height={16} style={styles.decorationSvg}>
                {items.map((x, i) => (
                    <Path key={i} d={`M${x - 10} 15 Q${x - 10} 3, ${x} 3 Q${x + 10} 3, ${x + 10} 15 Z`} stroke={color} strokeWidth={1.3} fill={color} opacity={0.42} />
                ))}
            </Svg>
        );
    }
    if (id === 'trellis') {
        return (
            <Svg width={width} height={30} style={styles.decorationSvg}>
                {items.map((x, i) => (
                    <React.Fragment key={i}>
                        <Path d={`M${x - 8} 30 L${x - 8} 4 L${x + 8} 4 L${x + 8} 30`} stroke={color} strokeWidth={1.2} fill="none" opacity={0.5} />
                        <Path d={`M${x - 8} 10 L${x + 8} 18 M${x - 8} 18 L${x + 8} 10 M${x - 8} 22 L${x + 8} 30 M${x - 8} 30 L${x + 8} 22`} stroke={color} strokeWidth={1} opacity={0.4} />
                    </React.Fragment>
                ))}
            </Svg>
        );
    }
    return null;
}

// Rough visual height per decoration, used to stack several at once above
// the ground line without them overlapping.
const DECORATION_HEIGHT: Record<string, number> = {
    stones: 10,
    pathway: 8,
    hedge: 16,
    lanterns: 26,
    trellis: 30,
    fence: 22,
};

interface GroveStripProps {
    plants: GrovePlant[];
    onPressPlant?: (plant: GrovePlant) => void;
    // large = Grove hero, compact = Home dashboard
    large?: boolean;
    decorations?: string[]; // equipped grove-wide backdrop ids, stacked bottom-up
}

export function GroveStrip({ plants, onPressPlant, large = false, decorations = [] }: GroveStripProps) {
    const { t } = useLanguage();
    const textColor = useThemeColor({}, 'text');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const accentColor = useThemeColor({}, 'primary');
    const borderColor = useThemeColor({}, 'border');
    const stripWidth = Math.max(320, plants.length * (large ? 104 : 84));

    const minSize = large ? 76 : 60;
    const growSpan = large ? 56 : 44;
    const slotWidth = large ? 104 : 84;

    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
        >
            <View>
                <View style={styles.row}>
                    {plants.map(plant => {
                        const size = minSize + plant.growth * growSpan;
                        return (
                            <TouchableOpacity
                                key={plant.deckId}
                                style={[styles.slot, { width: slotWidth }]}
                                activeOpacity={0.8}
                                onPress={() => onPressPlant?.(plant)}
                                disabled={!onPressPlant}
                                accessibilityRole="button"
                                accessibilityLabel={`${plant.deckName}${plant.resting ? ', resting' : ''}${plant.dueCards > 0 ? `, ${plant.dueCards} cards due` : ''}`}
                            >
                                <GrowingPlant
                                    progress={plant.growth}
                                    size={size}
                                    color={plant.resting ? mutedForeground : accentColor}
                                    soilColor={borderColor}
                                    wilted={plant.resting}
                                    sway={!plant.resting}
                                    species={plant.species}
                                    potStyle={plant.potStyle}
                                />
                                <Text
                                    style={[styles.name, { color: textColor, fontSize: large ? 13 : 11 }]}
                                    numberOfLines={1}
                                >
                                    {plant.deckName}
                                </Text>
                                {plant.dueCards > 0 ? (
                                    <Text style={[styles.due, { color: mutedForeground }]}>{t('homeDueCount').replace('{n}', String(plant.dueCards))}</Text>
                                ) : (
                                    <Text style={[styles.due, { color: 'transparent' }]}> </Text>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>
                {/* Shared ground the plants stand on; the SVG soil mounds sit just above it */}
                <View
                    pointerEvents="none"
                    style={[styles.ground, { backgroundColor: borderColor, bottom: large ? 36 : 32 }]}
                />
                {(() => {
                    const groundBottom = large ? 36 : 32;
                    const gap = 4;
                    let cumulative = 0;
                    return decorations.map(id => {
                        const bottom = groundBottom + cumulative;
                        cumulative += (DECORATION_HEIGHT[id] || 16) + gap;
                        return (
                            <View key={id} pointerEvents="none" style={[styles.decorationWrap, { bottom }]}>
                                <GroundDecoration id={id} color={borderColor} width={stripWidth - 20} />
                            </View>
                        );
                    });
                })()}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scrollContent: {
        paddingHorizontal: 8,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'flex-end',
    },
    slot: {
        alignItems: 'center',
    },
    name: {
        fontWeight: '700',
        marginTop: 4,
        maxWidth: '92%',
    },
    due: {
        fontSize: 10,
        fontWeight: '700',
        marginTop: 1,
    },
    ground: {
        position: 'absolute',
        left: 10,
        right: 10,
        height: 2,
        borderRadius: 1,
    },
    decorationWrap: {
        position: 'absolute',
        left: 10,
    },
    decorationSvg: {
        overflow: 'visible',
    },
});
