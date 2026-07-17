import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, StyleProp, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';

// Shared bottom-sheet with the SoundMixer's animation: the backdrop fades in
// while the sheet springs up, instead of the native "slide" Modal where the
// dark overlay pops in instantly with no transition.
//
// The modal stays mounted slightly longer than `visible` so the close
// animation (backdrop fade + sheet slide-down) can finish before the modal
// actually disappears.

const CLOSED_TRANSLATE_Y = 600;

interface BottomSheetProps {
    visible: boolean;
    onClose: () => void;
    // Style of the sheet container itself (background, radius, maxHeight…).
    // Applied directly so percentage maxHeight keeps resolving against the
    // full-screen overlay.
    sheetStyle?: StyleProp<ViewStyle>;
    children: React.ReactNode;
}

export function BottomSheet({ visible, onClose, sheetStyle, children }: BottomSheetProps) {
    const [mounted, setMounted] = useState(visible);
    const overlayOpacity = useRef(new Animated.Value(0)).current;
    const sheetTranslateY = useRef(new Animated.Value(CLOSED_TRANSLATE_Y)).current;

    useEffect(() => {
        if (visible) {
            setMounted(true);
            Animated.parallel([
                Animated.timing(overlayOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
                Animated.spring(sheetTranslateY, { toValue: 0, damping: 22, stiffness: 220, mass: 0.9, useNativeDriver: true }),
            ]).start();
        } else if (mounted) {
            Animated.parallel([
                Animated.timing(overlayOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
                Animated.timing(sheetTranslateY, { toValue: CLOSED_TRANSLATE_Y, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
            ]).start(({ finished }) => {
                // A rapid reopen interrupts the close — don't unmount out from
                // under the animation that's now playing us back in.
                if (finished) setMounted(false);
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    if (!mounted) return null;

    return (
        <Modal visible={mounted} animationType="none" transparent onRequestClose={onClose}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
                    <TouchableOpacity style={styles.dismiss} activeOpacity={1} onPress={onClose} />
                    <Animated.View style={[sheetStyle, { transform: [{ translateY: sheetTranslateY }] }]}>
                        {children}
                    </Animated.View>
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    dismiss: {
        flex: 1,
    },
});
