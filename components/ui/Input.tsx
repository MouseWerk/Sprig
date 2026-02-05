import { useThemeColor } from '@/hooks/use-theme-color';
import React from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, TextStyle, View, ViewStyle } from 'react-native';

interface InputProps extends TextInputProps {
    label?: string;
    containerStyle?: ViewStyle;
    inputStyle?: TextStyle;
}

export const Input: React.FC<InputProps> = ({
    label,
    containerStyle,
    inputStyle,
    ...props
}) => {
    const textColor = useThemeColor({}, 'text');
    const backgroundColor = useThemeColor({}, 'background');
    const borderColor = useThemeColor({}, 'input');
    const labelColor = useThemeColor({}, 'text');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const secondaryBg = useThemeColor({}, 'secondary');

    return (
        <View style={[styles.container, containerStyle]}>
            {label && <Text style={[styles.label, { color: labelColor }]}>{label}</Text>}
            <TextInput
                style={[
                    styles.input,
                    {
                        color: textColor,
                        backgroundColor: secondaryBg + '30',
                        borderColor: borderColor,
                        height: props.multiline ? undefined : 52,
                        minHeight: props.multiline ? 100 : 52,
                        paddingTop: props.multiline ? 12 : 0,
                    },
                    inputStyle
                ]}
                placeholderTextColor={mutedForeground}
                selectionColor={useThemeColor({}, 'primary')}
                {...props}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
    },
    label: {
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 8,
        marginLeft: 4,
    },
    input: {
        height: 52,
        borderWidth: 1.5,
        borderRadius: 12,
        paddingHorizontal: 16,
        fontSize: 16,
        fontWeight: '500',
    },
});
