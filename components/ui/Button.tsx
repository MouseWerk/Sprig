import { useThemeColor } from '@/hooks/use-theme-color';
import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, TouchableOpacity, View, ViewStyle } from 'react-native';

interface ButtonProps {
    onPress: () => void;
    title: string;
    variant?: 'primary' | 'outline' | 'ghost' | 'secondary';
    style?: StyleProp<ViewStyle>;
    textStyle?: StyleProp<TextStyle>;
    disabled?: boolean;
    icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
    onPress,
    title,
    variant = 'primary',
    style,
    textStyle,
    disabled = false,
    icon
}) => {
    const primaryBg = useThemeColor({}, 'primary');
    const primaryFg = useThemeColor({}, 'primaryForeground');
    const secondaryBg = useThemeColor({}, 'secondary');
    const secondaryFg = useThemeColor({}, 'secondaryForeground');
    const border = useThemeColor({}, 'border');

    let buttonStyle: ViewStyle = {};
    let labelStyle: TextStyle = {};

    switch (variant) {
        case 'primary':
            buttonStyle = { backgroundColor: primaryBg };
            labelStyle = { color: primaryFg };
            break;
        case 'secondary':
            buttonStyle = { backgroundColor: secondaryBg };
            labelStyle = { color: secondaryFg };
            break;
        case 'outline':
            buttonStyle = { backgroundColor: 'transparent', borderWidth: 1, borderColor: border };
            labelStyle = { color: primaryBg };
            break;
        case 'ghost':
            buttonStyle = { backgroundColor: 'transparent' };
            labelStyle = { color: primaryBg };
            break;
    }

    if (disabled) {
        buttonStyle = { ...buttonStyle, opacity: 0.5 };
    }

    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled}
            activeOpacity={0.7}
            style={[styles.button, buttonStyle, style]}
        >
            <View style={styles.content}>
                {icon && <View style={styles.icon}>{icon}</View>}
                <Text style={[styles.text, labelStyle, textStyle]}>
                    {title}
                </Text>
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    button: {
        height: 48,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    icon: {
        marginRight: 8,
    },
    text: {
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
});
