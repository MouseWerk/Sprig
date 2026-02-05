import { useThemeColor } from '@/hooks/use-theme-color';
import * as Haptics from 'expo-haptics';
import { Check, HelpCircle, RotateCcw, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    Extrapolation,
    interpolate,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring
} from 'react-native-reanimated';
import MarkdownRenderer from './MarkdownRenderer';
import { Card, CardContent } from './ui/Card';

interface FlashcardSwipeProps {
    question: string;
    answer: string;
    onSwipeLeft: () => void;
    onSwipeRight: () => void;
    onSwipeTop: () => void;
    highlightMode?: boolean;
    onHighlightChange?: (isFront: boolean, newText: string) => void;
}

export const FlashcardSwipe: React.FC<FlashcardSwipeProps> = ({
    question,
    answer,
    onSwipeLeft,
    onSwipeRight,
    onSwipeTop,
    highlightMode = false,
    onHighlightChange
}) => {
    const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
    const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;
    const SWIPE_THRESHOLD_Y = SCREEN_HEIGHT * 0.15;

    const cardWidth = SCREEN_WIDTH * 0.85;
    const cardHeight = Math.min(SCREEN_HEIGHT * 0.6, 500);

    const [isFlipped, setIsFlipped] = useState(false);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const rotateY = useSharedValue(0);

    const cardBg = useThemeColor({}, 'card');
    const mutedFg = useThemeColor({}, 'mutedForeground');
    const secondaryBg = useThemeColor({}, 'secondary');
    const textColor = useThemeColor({}, 'text');

    const toggleFlip = () => {
        const nextState = !isFlipped;
        setIsFlipped(nextState);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        rotateY.value = withSpring(nextState ? 180 : 0, {
            damping: 20,
            stiffness: 90,
            mass: 1
        });
    };

    const toggleWordHighlight = (text: string, word: string, wordIndex: number, isFront: boolean) => {
        const words = text.split(/(\s+)/);
        let actualWordCount = 0;

        const newWords = words.map((w) => {
            if (w.trim().length === 0) return w;
            const currentId = actualWordCount++;
            if (currentId === wordIndex) {
                if (w.startsWith('==') && w.endsWith('==')) {
                    return w.slice(2, -2);
                } else {
                    return `==${w}==`;
                }
            }
            return w;
        });

        const newText = newWords.join('');
        onHighlightChange?.(isFront, newText);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const WordSplitter = ({ text, isFront, fontSize = 24 }: { text: string, isFront: boolean, fontSize?: number }) => {
        const words = text.split(/(\s+)/);
        let actualWordCount = 0;

        return (
            <View style={styles.clickableTextContainer}>
                {words.map((w, i) => {
                    if (w.trim().length === 0) return <Text key={i} style={[styles.wordText, { fontSize }]}>{w}</Text>;
                    const currentId = actualWordCount++;
                    const isHighlighted = w.startsWith('==') && w.endsWith('==');
                    return (
                        <TouchableOpacity
                            key={i}
                            activeOpacity={0.7}
                            onPress={() => toggleWordHighlight(text, w, currentId, isFront)}
                            style={[
                                styles.wordChip,
                                isHighlighted && styles.wordChipHighlighted
                            ]}
                        >
                            <Text style={[
                                styles.wordText,
                                { color: isHighlighted ? '#000' : textColor, fontSize },
                                isHighlighted && styles.wordTextHighlighted
                            ]}>
                                {isHighlighted ? w.slice(2, -2) : w}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        );
    };

    const panGesture = Gesture.Pan()
        .enabled(!highlightMode)
        .onUpdate((event) => {
            translateX.value = event.translationX;
            translateY.value = event.translationY;
        })
        .onEnd((event) => {
            if (event.translationY < -SWIPE_THRESHOLD_Y && Math.abs(event.translationX) < SWIPE_THRESHOLD) {
                translateY.value = withSpring(-SCREEN_HEIGHT, { velocity: event.velocityY }, () => {
                    runOnJS(Haptics.notificationAsync)(Haptics.NotificationFeedbackType.Warning as any);
                    runOnJS(onSwipeTop)();
                });
            } else if (Math.abs(event.translationX) > SWIPE_THRESHOLD) {
                const direction = event.translationX > 0 ? 'right' : 'left';
                translateX.value = withSpring(direction === 'right' ? SCREEN_WIDTH + 100 : -SCREEN_WIDTH - 100, { velocity: event.velocityX }, () => {
                    if (direction === 'right') {
                        runOnJS(Haptics.notificationAsync)(Haptics.NotificationFeedbackType.Success);
                        runOnJS(onSwipeRight)();
                    } else {
                        runOnJS(Haptics.notificationAsync)(Haptics.NotificationFeedbackType.Error);
                        runOnJS(onSwipeLeft)();
                    }
                });
            } else {
                translateX.value = withSpring(0);
                translateY.value = withSpring(0);
            }
        });

    const tapGesture = Gesture.Tap()
        .enabled(!highlightMode)
        .onEnd(() => {
            runOnJS(toggleFlip)();
        });

    const animatedCardStyle = useAnimatedStyle(() => {
        const rotate = interpolate(translateX.value, [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2], [-10, 0, 10], Extrapolation.CLAMP);
        return {
            transform: [
                { perspective: 1000 },
                { translateX: translateX.value },
                { translateY: translateY.value },
                { rotate: `${rotate}deg` }
            ],
        };
    });

    const frontAnimatedStyle = useAnimatedStyle(() => {
        const opacity = interpolate(rotateY.value, [89, 90, 91], [1, 0, 0]);
        return {
            transform: [{ perspective: 1000 }, { rotateY: `${rotateY.value}deg` }],
            opacity,
            backfaceVisibility: 'hidden',
        };
    });

    const backAnimatedStyle = useAnimatedStyle(() => {
        const opacity = interpolate(rotateY.value, [89, 90, 91], [0, 0, 1]);
        return {
            transform: [{ perspective: 1000 }, { rotateY: `${rotateY.value - 180}deg` }],
            opacity,
            backfaceVisibility: 'hidden',
        };
    });

    const overlayRightStyle = useAnimatedStyle(() => {
        const opacity = interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP);
        return { opacity, transform: [{ scale: opacity }] };
    });

    const overlayLeftStyle = useAnimatedStyle(() => {
        const opacity = interpolate(translateX.value, [0, -SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP);
        return { opacity, transform: [{ scale: opacity }] };
    });

    const overlayTopStyle = useAnimatedStyle(() => {
        const opacity = interpolate(translateY.value, [0, -SWIPE_THRESHOLD_Y], [0, 1], Extrapolation.CLAMP);
        return { opacity, transform: [{ scale: opacity }] };
    });

    const composedGesture = Gesture.Simultaneous(panGesture, tapGesture);

    const cardInner = (
        <Animated.View style={[{ flex: 1 }, animatedCardStyle]}>
            <Animated.View style={[styles.overlay, styles.overlayRight, overlayRightStyle]} pointerEvents="none">
                <Check size={48} color="#22c55e" strokeWidth={3} />
            </Animated.View>
            <Animated.View style={[styles.overlay, styles.overlayLeft, overlayLeftStyle]} pointerEvents="none">
                <X size={48} color="#ef4444" strokeWidth={3} />
            </Animated.View>
            <Animated.View style={[styles.overlay, styles.overlayTop, overlayTopStyle]} pointerEvents="none">
                <HelpCircle size={48} color="#eab308" strokeWidth={3} />
            </Animated.View>

            {/* Front Side */}
            <Animated.View
                style={[styles.flipCard, frontAnimatedStyle]}
                pointerEvents={!isFlipped ? 'auto' : 'none'}
            >
                <Card style={[styles.card, { backgroundColor: cardBg }]}>
                    <CardContent style={styles.content}>
                        <Text style={[styles.label, { color: mutedFg }]} pointerEvents="none">Question</Text>
                        <ScrollView centerContent showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
                            {highlightMode ? (
                                <WordSplitter text={question} isFront={true} fontSize={24} />
                            ) : (
                                <MarkdownRenderer content={question} fontSize={24} />
                            )}
                        </ScrollView>
                        <View style={styles.footerHint} pointerEvents="none">
                            <Text style={[styles.hint, { color: mutedFg }]}>
                                {highlightMode ? 'Tap words to highlight' : 'Tap to reveal answer'}
                            </Text>
                        </View>
                        {highlightMode && (
                            <TouchableOpacity
                                style={[styles.flipBtn, { backgroundColor: secondaryBg }]}
                                onPress={toggleFlip}
                            >
                                <RotateCcw size={16} color={textColor} />
                                <Text style={[styles.flipBtnText, { color: textColor }]}>Flip Card</Text>
                            </TouchableOpacity>
                        )}
                    </CardContent>
                </Card>
            </Animated.View>

            {/* Back Side */}
            <Animated.View
                style={[styles.flipCard, styles.backCard, backAnimatedStyle]}
                pointerEvents={isFlipped ? 'auto' : 'none'}
            >
                <Card style={[styles.card, { backgroundColor: secondaryBg }]}>
                    <CardContent style={styles.content}>
                        <Text style={[styles.label, { color: mutedFg }]} pointerEvents="none">Answer</Text>
                        <ScrollView centerContent showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
                            {highlightMode ? (
                                <WordSplitter text={answer} isFront={false} fontSize={22} />
                            ) : (
                                <MarkdownRenderer content={answer} fontSize={22} />
                            )}
                        </ScrollView>
                        <View style={styles.footerHint} pointerEvents="none">
                            <Text style={[styles.hint, { color: mutedFg }]}>
                                {highlightMode ? 'Tap words to highlight' : 'Swipe to mark as known/unknown'}
                            </Text>
                        </View>
                        {highlightMode && (
                            <TouchableOpacity
                                style={[styles.flipBtn, { backgroundColor: cardBg }]}
                                onPress={toggleFlip}
                            >
                                <RotateCcw size={16} color={textColor} />
                                <Text style={[styles.flipBtnText, { color: textColor }]}>Flip Card</Text>
                            </TouchableOpacity>
                        )}
                    </CardContent>
                </Card>
            </Animated.View>
        </Animated.View>
    );

    return (
        <View style={[styles.cardContainer, { width: cardWidth, height: cardHeight }]}>
            {highlightMode ? (
                cardInner
            ) : (
                <GestureDetector gesture={composedGesture}>
                    {cardInner}
                </GestureDetector>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    cardContainer: {
        position: 'relative',
    },
    flipCard: {
        width: '100%',
        height: '100%',
    },
    backCard: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    card: {
        flex: 1,
        borderRadius: 24,
        overflow: 'hidden',
    },
    content: {
        flex: 1,
        padding: 24,
        paddingTop: 60,
        paddingBottom: 60,
    },
    label: {
        position: 'absolute',
        top: 24,
        alignSelf: 'center',
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 2,
    },
    footerHint: {
        position: 'absolute',
        bottom: 24,
        alignSelf: 'center',
    },
    hint: {
        fontSize: 13,
        fontWeight: '500',
        opacity: 0.7,
    },
    overlay: {
        position: 'absolute',
        top: '50%',
        marginTop: -40,
        zIndex: 10,
        width: 80,
        height: 80,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.95)',
        shadowColor: '#000',
        elevation: 8,
    },
    overlayRight: { right: 32, borderColor: '#22c55e', borderWidth: 3 },
    overlayLeft: { left: 32, borderColor: '#ef4444', borderWidth: 3 },
    overlayTop: { top: 32, alignSelf: 'center', marginTop: 0, borderColor: '#eab308', borderWidth: 3 },
    clickableTextContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
    },
    wordChip: {
        borderRadius: 6,
        paddingHorizontal: 4,
        paddingVertical: 2,
        marginHorizontal: 1,
        marginVertical: 2,
        backgroundColor: 'transparent',
    },
    wordChipHighlighted: {
        backgroundColor: '#facc15',
    },
    wordText: {
        fontSize: 22,
        fontWeight: '500',
        textAlign: 'center',
    },
    wordTextHighlighted: {
        fontWeight: '800',
    },
    flipBtn: {
        position: 'absolute',
        top: 20,
        right: 20,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        gap: 6,
        zIndex: 20,
    },
    flipBtnText: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
    }
});

export default FlashcardSwipe;
