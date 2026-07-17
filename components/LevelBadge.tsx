import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface LevelBadgeProps {
    level: number;
    progress: number; // 0..1 within the current level
    size?: number;
    color: string;
    trackColor: string;
    textColor: string;
}

// A circular XP ring with the level number in the middle.
export function LevelBadge({ level, progress, size = 64, color, trackColor, textColor }: LevelBadgeProps) {
    const strokeWidth = size * 0.09;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const clamped = Math.max(0, Math.min(1, progress));
    const dashOffset = circumference * (1 - clamped);
    const center = size / 2;

    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
                <Circle
                    cx={center}
                    cy={center}
                    r={radius}
                    stroke={trackColor}
                    strokeWidth={strokeWidth}
                    fill="none"
                />
                <Circle
                    cx={center}
                    cy={center}
                    r={radius}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${center} ${center})`}
                />
            </Svg>
            <Text style={[styles.level, { color: textColor, fontSize: size * 0.34 }]}>{level}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    level: {
        fontWeight: '900',
        letterSpacing: -0.5,
    },
});
