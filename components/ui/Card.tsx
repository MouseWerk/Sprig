import { useThemeColor } from '@/hooks/use-theme-color';
import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';

interface CardProps {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

export const Card: React.FC<CardProps> = ({ children, style }) => {
    const backgroundColor = useThemeColor({}, 'card');
    const borderColor = useThemeColor({}, 'border');

    return (
        <View style={[styles.card, { backgroundColor, borderColor }, style]}>
            {children}
        </View>
    );
};

export const CardHeader: React.FC<CardProps> = ({ children, style }) => {
    const borderBottomColor = useThemeColor({}, 'border');
    return (
        <View style={[styles.header, { borderBottomColor }, style]}>
            {children}
        </View>
    );
};

export const CardTitle: React.FC<{ children: string; style?: StyleProp<TextStyle> }> = ({ children, style }) => {
    const color = useThemeColor({}, 'cardForeground');
    return (
        <Text style={[styles.title, { color }, style]}>{children}</Text>
    );
};

export const CardContent: React.FC<CardProps> = ({ children, style }) => (
    <View style={[styles.content, style]}>{children}</View>
);

const styles = StyleSheet.create({
    card: {
        borderRadius: 20,
        borderWidth: 1.5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 3,
    },
    header: {
        padding: 20,
        borderBottomWidth: 1,
    },
    title: {
        fontSize: 20,
        fontWeight: '800',
        letterSpacing: -0.4,
    },
    content: {
        padding: 20,
    },
});
