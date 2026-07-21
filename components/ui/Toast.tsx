import { useThemeColor } from '@/hooks/use-theme-color';
import { AlertCircle, CheckCircle2, Info, X, XCircle } from 'lucide-react-native';
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastOptions {
    message: string;
    type?: ToastType;
    duration?: number;
    action?: { label: string; onPress: () => void };
}

interface ToastContextType {
    showToast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toast, setToast] = useState<ToastOptions | null>(null);
    const insets = useSafeAreaInsets();
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(-100)).current;
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const bgColor = useThemeColor({}, 'card');
    const textColor = useThemeColor({}, 'text');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const secondaryBg = useThemeColor({}, 'secondary');
    const accentColor = useThemeColor({}, 'primary');

    const hideToast = useCallback(() => {
        if (hideTimer.current) {
            clearTimeout(hideTimer.current);
            hideTimer.current = null;
        }
        Animated.parallel([
            Animated.timing(opacity, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true,
            }),
            Animated.timing(translateY, {
                toValue: -100,
                duration: 250,
                useNativeDriver: true,
            }),
        ]).start(() => {
            setToast(null);
        });
    }, [opacity, translateY]);

    const showToast = useCallback(({ message, type = 'success', duration = 3000, action }: ToastOptions) => {
        // A newer toast replaces the old one along with its hide timer,
        // so an earlier timer can't dismiss this toast prematurely.
        if (hideTimer.current) {
            clearTimeout(hideTimer.current);
        }
        setToast({ message, type, duration, action });

        // Show
        Animated.parallel([
            Animated.timing(opacity, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }),
            Animated.spring(translateY, {
                toValue: insets.top + 10,
                tension: 40,
                friction: 7,
                useNativeDriver: true,
            }),
        ]).start();

        // Hide
        hideTimer.current = setTimeout(() => {
            hideToast();
        }, duration);
    }, [insets.top, opacity, translateY, hideToast]);

    const getIcon = () => {
        const color = getStatusColor();
        switch (toast?.type) {
            case 'success': return <CheckCircle2 size={18} color={color} strokeWidth={2.5} />;
            case 'error': return <XCircle size={18} color={color} strokeWidth={2.5} />;
            case 'warning': return <AlertCircle size={18} color={color} strokeWidth={2.5} />;
            default: return <Info size={18} color={color} strokeWidth={2.5} />;
        }
    };

    const getStatusColor = () => {
        switch (toast?.type) {
            case 'success': return '#22c55e';
            case 'error': return '#ef4444';
            case 'warning': return '#eab308';
            default: return accentColor;
        }
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {toast && (
                <Animated.View
                    style={[
                        styles.toastContainer,
                        {
                            opacity,
                            transform: [{ translateY }],
                            backgroundColor: bgColor,
                            borderColor: secondaryBg,
                        }
                    ]}
                >
                    <View style={styles.content}>
                        <View style={[styles.iconWrapper, { backgroundColor: getStatusColor() + '18' }]}>
                            {getIcon()}
                        </View>
                        <Text style={[styles.message, { color: textColor }]}>{toast.message}</Text>
                        {toast.action && (
                            <TouchableOpacity
                                onPress={() => {
                                    toast.action?.onPress();
                                    hideToast();
                                }}
                                style={styles.actionBtn}
                                accessibilityLabel={toast.action.label}
                                accessibilityRole="button"
                            >
                                <Text style={[styles.actionText, { color: getStatusColor() }]}>{toast.action.label}</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={hideToast} style={styles.closeBtn} accessibilityLabel="Dismiss notification" accessibilityRole="button">
                            <X size={16} color={mutedForeground} />
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            )}
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

const styles = StyleSheet.create({
    toastContainer: {
        position: 'absolute',
        top: 0,
        left: 20,
        right: 20,
        borderRadius: 22,
        zIndex: 9999,
        borderWidth: 1,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.1,
                shadowRadius: 12,
            },
            android: {
                elevation: 6,
            },
        }),
        overflow: 'hidden',
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
    },
    iconWrapper: {
        width: 34,
        height: 34,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    message: {
        flex: 1,
        fontSize: 14,
        fontWeight: '700',
    },
    closeBtn: {
        padding: 4,
        marginLeft: 8,
    },
    actionBtn: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        marginLeft: 4,
    },
    actionText: {
        fontSize: 13,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
});
