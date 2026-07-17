import { useThemeColor } from '@/hooks/use-theme-color';
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export interface ConfirmOptions {
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | undefined>(undefined);

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [options, setOptions] = useState<ConfirmOptions | null>(null);
    const resolverRef = useRef<((value: boolean) => void) | null>(null);

    const cardColor = useThemeColor({}, 'card');
    const textColor = useThemeColor({}, 'text');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const secondaryBg = useThemeColor({}, 'secondary');
    const accentColor = useThemeColor({}, 'primary');
    const primaryForeground = useThemeColor({}, 'primaryForeground');

    const confirm = useCallback<ConfirmFn>((opts) => {
        return new Promise<boolean>((resolve) => {
            // A dialog opened on top of a pending one cancels the old request
            resolverRef.current?.(false);
            resolverRef.current = resolve;
            setOptions(opts);
        });
    }, []);

    const close = (result: boolean) => {
        resolverRef.current?.(result);
        resolverRef.current = null;
        setOptions(null);
    };

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <Modal
                visible={!!options}
                transparent
                animationType="fade"
                onRequestClose={() => close(false)}
                statusBarTranslucent
            >
                <View style={styles.overlay}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => close(false)} />
                    <View style={[styles.dialog, { backgroundColor: cardColor }]}>
                        <Text style={[styles.title, { color: textColor }]}>{options?.title}</Text>
                        {!!options?.message && (
                            <Text style={[styles.message, { color: mutedForeground }]}>{options.message}</Text>
                        )}
                        <View style={styles.buttonRow}>
                            <TouchableOpacity
                                style={[styles.button, { backgroundColor: secondaryBg }]}
                                onPress={() => close(false)}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.buttonText, { color: textColor }]}>
                                    {options?.cancelText ?? 'Cancel'}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.button, { backgroundColor: options?.destructive ? '#ef4444' : accentColor }]}
                                onPress={() => close(true)}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.buttonText, { color: options?.destructive ? '#ffffff' : primaryForeground }]}>
                                    {options?.confirmText ?? 'Confirm'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </ConfirmContext.Provider>
    );
};

export const useConfirm = () => {
    const context = useContext(ConfirmContext);
    if (!context) {
        throw new Error('useConfirm must be used within a ConfirmProvider');
    }
    return context;
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
    },
    dialog: {
        width: '100%',
        maxWidth: 340,
        borderRadius: 24,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 12,
    },
    title: {
        fontSize: 19,
        fontWeight: '800',
        letterSpacing: -0.3,
        marginBottom: 8,
    },
    message: {
        fontSize: 14,
        fontWeight: '500',
        lineHeight: 21,
        marginBottom: 20,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 10,
    },
    button: {
        flex: 1,
        height: 48,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonText: {
        fontSize: 15,
        fontWeight: '700',
    },
});
