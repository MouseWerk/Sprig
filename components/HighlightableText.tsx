import { useThemeColor } from '@/hooks/use-theme-color';
import * as Haptics from '@/utils/AppHaptics';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// Tap-to-highlight text: every word becomes tappable and toggles ==markers==
// around itself (rendered as a highlight by MarkdownRenderer elsewhere).
// Shared by the swipe study screen and the feed's pen mode.
interface HighlightableTextProps {
    text: string;
    fontSize?: number;
    align?: 'center' | 'left';
    onChange: (newText: string) => void;
}

export function HighlightableText({ text, fontSize = 22, align = 'center', onChange }: HighlightableTextProps) {
    const textColor = useThemeColor({}, 'text');

    const toggleWord = (wordIndex: number) => {
        const parts = text.split(/(\s+)/);
        let count = 0;
        const next = parts.map(w => {
            if (w.trim().length === 0) return w;
            const currentId = count++;
            if (currentId !== wordIndex) return w;
            return w.startsWith('==') && w.endsWith('==') ? w.slice(2, -2) : `==${w}==`;
        });
        onChange(next.join(''));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const words = text.split(/(\s+)/);
    let wordId = 0;

    return (
        <View style={[styles.container, align === 'center' ? styles.center : styles.left]}>
            {words.map((w, i) => {
                if (w.trim().length === 0) {
                    return <Text key={i} style={[styles.wordText, { fontSize }]}>{w}</Text>;
                }
                const currentId = wordId++;
                const isHighlighted = w.startsWith('==') && w.endsWith('==');
                return (
                    <TouchableOpacity
                        key={i}
                        activeOpacity={0.7}
                        onPress={() => toggleWord(currentId)}
                        style={[styles.wordChip, isHighlighted && styles.wordChipHighlighted]}
                    >
                        <Text style={[
                            styles.wordText,
                            { color: isHighlighted ? '#000' : textColor, fontSize },
                            isHighlighted && styles.wordTextHighlighted,
                        ]}>
                            {isHighlighted ? w.slice(2, -2) : w}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
    },
    center: {
        justifyContent: 'center',
    },
    left: {
        justifyContent: 'flex-start',
    },
    wordChip: {
        borderRadius: 6,
        paddingHorizontal: 4,
        paddingVertical: 2,
        marginHorizontal: 1,
        marginVertical: 2,
        backgroundColor: 'transparent',
    },
    wordChipHighlighted: {
        backgroundColor: '#facc15',
    },
    wordText: {
        fontSize: 22,
        fontWeight: '500',
        textAlign: 'center',
    },
    wordTextHighlighted: {
        fontWeight: '800',
    },
});
