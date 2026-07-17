import { useThemeColor } from '@/hooks/use-theme-color';
import * as Icons from 'lucide-react-native';
import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

const ICON_NAMES = [
    'Book', 'FileText', 'Bookmark', 'GraduationCap', 'Library',
    'Languages', 'Code', 'Atom', 'FlaskConical', 'Dna',
    'Calculator', 'Globe', 'History', 'Music', 'Image',
    'Gamepad2', 'Brain', 'Lightbulb', 'Star', 'Heart'
] as const;

interface IconPickerProps {
    selectedIcon: string;
    onSelect: (name: string) => void;
}

export const IconPicker: React.FC<IconPickerProps> = ({ selectedIcon, onSelect }) => {
    const primaryColor = useThemeColor({}, 'primary');
    const secondaryBg = useThemeColor({}, 'secondary');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const primaryForeground = useThemeColor({}, 'primaryForeground');

    return (
        <View style={styles.container}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
                {ICON_NAMES.map((name) => {
                    const IconComponent = (Icons as any)[name];
                    const isSelected = selectedIcon === name;

                    return (
                        <TouchableOpacity
                            key={name}
                            onPress={() => onSelect(name)}
                            style={[
                                styles.iconButton,
                                { backgroundColor: isSelected ? primaryColor : secondaryBg }
                            ]}
                            accessibilityLabel={`${name} icon`}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: isSelected }}
                        >
                            <IconComponent
                                size={20}
                                color={isSelected ? primaryForeground : mutedForeground}
                            />
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginVertical: 12,
    },
    scroll: {
        gap: 12,
        paddingRight: 24,
    },
    iconButton: {
        width: 44,
        height: 44,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
