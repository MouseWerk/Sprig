import { useThemeColor } from '@/hooks/use-theme-color';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface ReviewHeatmapProps {
    data?: Record<string, number>;
    weeks?: number;
}

const CELL = 14;
const GAP = 3;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toKey(date: Date): string {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, '0');
    const d = `${date.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function intensityColor(count: number, emptyColor: string): string {
    if (count <= 0) return emptyColor;
    if (count < 3) return '#22c55e40';
    if (count < 10) return '#22c55e80';
    if (count < 25) return '#22c55eC0';
    return '#22c55e';
}

// GitHub-style activity calendar: columns are weeks (Monday first),
// the rightmost column ends today.
export const ReviewHeatmap: React.FC<ReviewHeatmapProps> = ({ data = {}, weeks = 17 }) => {
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const emptyColor = useThemeColor({}, 'secondary');

    const { columns, monthLabels } = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const mondayIndex = (today.getDay() + 6) % 7; // Mon=0 ... Sun=6
        const totalDays = (weeks - 1) * 7 + mondayIndex + 1;

        const cols: { key: string; count: number | null }[][] = [];
        const labels: string[] = [];
        let cursor = new Date(today);
        cursor.setDate(cursor.getDate() - (totalDays - 1));

        for (let w = 0; w < weeks; w++) {
            const col: { key: string; count: number | null }[] = [];
            let label = '';
            for (let d = 0; d < 7; d++) {
                if (cursor > today) {
                    col.push({ key: `future-${w}-${d}`, count: null });
                } else {
                    const key = toKey(cursor);
                    if (cursor.getDate() === 1) label = MONTH_NAMES[cursor.getMonth()];
                    col.push({ key, count: data[key] || 0 });
                    cursor = new Date(cursor);
                    cursor.setDate(cursor.getDate() + 1);
                }
            }
            cols.push(col);
            labels.push(label);
        }
        return { columns: cols, monthLabels: labels };
    }, [data, weeks]);

    return (
        <View>
            <View style={styles.monthRow}>
                {monthLabels.map((label, i) => (
                    <Text
                        key={i}
                        style={[styles.monthLabel, { color: mutedForeground, width: CELL + GAP }]}
                        numberOfLines={1}
                    >
                        {label}
                    </Text>
                ))}
            </View>
            <View style={styles.grid}>
                {columns.map((col, w) => (
                    <View key={w} style={styles.column}>
                        {col.map(cell => (
                            <View
                                key={cell.key}
                                style={[
                                    styles.cell,
                                    {
                                        backgroundColor: cell.count === null
                                            ? 'transparent'
                                            : intensityColor(cell.count, emptyColor)
                                    }
                                ]}
                            />
                        ))}
                    </View>
                ))}
            </View>
            <View style={styles.legendRow}>
                <Text style={[styles.legendText, { color: mutedForeground }]}>Less</Text>
                {[0, 1, 3, 10, 25].map(v => (
                    <View key={v} style={[styles.cell, { backgroundColor: intensityColor(v, emptyColor) }]} />
                ))}
                <Text style={[styles.legendText, { color: mutedForeground }]}>More</Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    monthRow: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    monthLabel: {
        fontSize: 8,
        fontWeight: '700',
        overflow: 'visible',
    },
    grid: {
        flexDirection: 'row',
        gap: GAP,
    },
    column: {
        gap: GAP,
    },
    cell: {
        width: CELL,
        height: CELL,
        borderRadius: 3,
    },
    legendRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: GAP,
        marginTop: 10,
        justifyContent: 'flex-end',
    },
    legendText: {
        fontSize: 10,
        fontWeight: '600',
        marginHorizontal: 4,
    },
});

export default ReviewHeatmap;
