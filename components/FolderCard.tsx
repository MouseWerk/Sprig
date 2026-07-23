import { useLanguage } from '@/contexts/LanguageContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { ChevronRight, Folder as FolderIcon, MoreVertical } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// The single folder design shared by Home, Library and Audio, so folders look
// identical everywhere: secondary background, tinted icon tile with a filled
// folder glyph, name + FOLDER label, muted three-dot menu affordance.
// `grid` fits the 2-column deck/audio grids, `row` fits Library's list rows.
// The three-dot button is a visible entry point into rename/delete — it
// exists alongside long-press so the option isn't hidden behind a gesture
// users may not discover on their own.
interface FolderCardProps {
    name: string;
    onOpen: () => void;
    onMenu?: () => void; // omit to hide the menu affordance (e.g. select mode)
    layout?: 'grid' | 'row';
}

export function FolderCard({ name, onOpen, onMenu, layout = 'grid' }: FolderCardProps) {
    const { t } = useLanguage();
    const textColor = useThemeColor({}, 'text');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const secondaryBg = useThemeColor({}, 'secondary');
    const accentColor = useThemeColor({}, 'primary');

    const iconTile = (
        <View style={[styles.iconTile, { backgroundColor: accentColor + '15' }]}>
            <FolderIcon size={28} color={accentColor} fill={accentColor + '30'} />
        </View>
    );

    if (layout === 'row') {
        return (
            <View style={[styles.rowCard, { backgroundColor: secondaryBg }]}>
                <TouchableOpacity
                    style={styles.rowContent}
                    onPress={onOpen}
                    activeOpacity={0.8}
                    accessibilityLabel={`Open folder ${name}`}
                    accessibilityRole="button"
                >
                    {iconTile}
                    <View style={styles.rowInfo}>
                        <Text style={[styles.name, { color: textColor }]} numberOfLines={1}>{name}</Text>
                        <Text style={[styles.label, { color: mutedForeground }]}>{t('folder')}</Text>
                    </View>
                    <ChevronRight size={18} color={mutedForeground} />
                </TouchableOpacity>
                {onMenu && (
                    <TouchableOpacity
                        style={styles.rowDelete}
                        onPress={onMenu}
                        activeOpacity={0.5}
                        accessibilityLabel={`Options for folder ${name}`}
                        accessibilityRole="button"
                    >
                        <MoreVertical size={18} color={mutedForeground} />
                    </TouchableOpacity>
                )}
            </View>
        );
    }

    return (
        <TouchableOpacity
            style={[styles.gridCard, { backgroundColor: secondaryBg }]}
            onPress={onOpen}
            activeOpacity={0.8}
            accessibilityLabel={`Open folder ${name}`}
            accessibilityRole="button"
        >
            <View style={styles.gridHeader}>
                {iconTile}
                {onMenu && (
                    <TouchableOpacity
                        style={styles.gridDelete}
                        onPress={onMenu}
                        activeOpacity={0.5}
                        accessibilityLabel={`Options for folder ${name}`}
                        accessibilityRole="button"
                    >
                        <MoreVertical size={18} color={mutedForeground} />
                    </TouchableOpacity>
                )}
            </View>
            <View style={styles.gridBottom}>
                <Text style={[styles.name, { color: textColor }]} numberOfLines={2}>{name}</Text>
                <Text style={[styles.label, { color: mutedForeground }]}>{t('folder')}</Text>
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    iconTile: {
        width: 52,
        height: 52,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    name: {
        fontSize: 17,
        fontWeight: '800',
        lineHeight: 22,
        letterSpacing: -0.3,
        marginBottom: 4,
    },
    label: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    // Matches the deck/audio grid cards (flex in a 2-column FlatList)
    gridCard: {
        flex: 1,
        margin: 10,
        borderRadius: 28,
        padding: 24,
        minHeight: 190,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 4,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.03)',
    },
    gridHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    gridDelete: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    gridBottom: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    // Matches the Library document rows
    rowCard: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.03)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 3,
    },
    rowContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },
    rowInfo: {
        flex: 1,
        marginLeft: 16,
        marginRight: 8,
    },
    rowDelete: {
        padding: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
