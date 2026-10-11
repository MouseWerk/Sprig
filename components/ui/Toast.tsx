import { useLanguage } from '@/contexts/LanguageContext';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
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
    const { t } = useLanguage();
    const [toast, setToast] = useState<ToastOptions | null>(null);
    const insets = useSafeAreaInsets();
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(-100)).current;
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Read through a ref: the show/hide callbacks are memoized
    const reducedMotion = useReducedMotion();
    const reducedMotionRef = useRef(reducedMotion);
    reducedMotionRef.current = reducedMotion;

    const bgColor = useThemeColor({}, 'card');
    const textColor = useThemeColor({}, 'text');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const secondaryBg = useThemeColor({}, 'secondary');
    const accentColor = useThemeColor({}, 'primary');
    const successColor = useThemeColor({}, 'success');
    const dangerColor = useThemeColor({}, 'danger');
    const warningColor = useThemeColor({}, 'warning');

    // The toast on screen while it offers an action (Undo), and a plain
    // message that arrived meanwhile. A quick follow-up message used to
    // replace the toast and take its Undo away for good; it now waits until
    // the action toast is gone. A newer action toast still replaces the old.
    const actionToastRef = useRef<ToastOptions | null>(null);
    const queuedRef = useRef<ToastOptions | null>(null);
    const showRef = useRef<(options: ToastOptions) => void>(() => { });

    const hideToast = useCallback(() => {
        if (hideTimer.current) {
            clearTimeout(hideTimer.current);
            hideTimer.current = null;
        }
        actionToastRef.current = null;
        const duration = reducedMotionRef.current ? 0 : 250;
        Animated.parallel([
            Animated.timing(opacity, {
                toValue: 0,
                duration,
                useNativeDriver: true,
            }),
            Animated.timing(translateY, {
                toValue: -100,
                duration,
                useNativeDriver: true,
            }),
        ]).start(({ finished }) => {
            // A newer showToast() interrupts this animation (same shared
            // opacity/translateY values) to play its own show animation —
            // that invokes this callback with finished:false. Nulling the
            // toast in that case would erase the new toast that showToast()
            // just set, right after it set it.
            if (!finished) return;
            setToast(null);
            const queued = queuedRef.current;
            queuedRef.current = null;
            if (queued) showRef.current(queued);
        });
    }, [opacity, translateY]);

    const showToast = useCallback((options: ToastOptions) => {
        const { message, type = 'success', duration = 3000, action } = options;
        if (actionToastRef.current && !action) {
            queuedRef.current = options;
            return;
        }
        // A newer toast replaces the old one along with its hide timer,
        // so an earlier timer can't dismiss this toast prematurely.
        if (hideTimer.current) {
            clearTimeout(hideTimer.current);
        }
        const shown = { message, type, duration, action };
        actionToastRef.current = action ? shown : null;
        setToast(shown);

        // Show (in place, without sliding, when motion is reduced)
        if (reducedMotionRef.current) {
            opacity.setValue(1);
            translateY.setValue(insets.top + 10);
        } else {
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
        }

        // Hide
        hideTimer.current = setTimeout(() => {
            hideToast();
        }, duration);
    }, [insets.top, opacity, translateY, hideToast]);
    showRef.current = showToast;

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
            case 'success': return successColor;
            case 'error': return dangerColor;
            case 'warning': return warningColor;
            default: return accentColor;
        }
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {toast && (
                <Animated.View
                    // Announced by screen readers without moving their focus
                    accessibilityLiveRegion="polite"
                    accessibilityRole="alert"
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
                        <View style={[styles.iconWrapper, { backgroundColor: getStatusColor() + '1F' }]}>
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
                                hitSlop={10}
                                accessibilityLabel={toast.action.label}
                                accessibilityRole="button"
                            >
                                <Text style={[styles.actionText, { color: textColor }]}>{toast.action.label}</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={hideToast} style={styles.closeBtn} hitSlop={12} accessibilityLabel={t('a11yDismissNotification')} accessibilityRole="button">
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
