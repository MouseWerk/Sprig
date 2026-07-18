import * as Haptics from 'expo-haptics';
import { getPrefsSync } from './Preferences';

// Drop-in replacement for `import * as Haptics from 'expo-haptics'` that
// respects the "Haptic feedback" preference. Re-exports the enums unchanged
// so call sites don't need touching beyond the import path.

export const ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle;
export const NotificationFeedbackType = Haptics.NotificationFeedbackType;

export function impactAsync(style?: Haptics.ImpactFeedbackStyle): Promise<void> {
    if (!getPrefsSync().hapticsEnabled) return Promise.resolve();
    return Haptics.impactAsync(style).catch(() => { });
}

export function notificationAsync(type?: Haptics.NotificationFeedbackType): Promise<void> {
    if (!getPrefsSync().hapticsEnabled) return Promise.resolve();
    return Haptics.notificationAsync(type).catch(() => { });
}

export function selectionAsync(): Promise<void> {
    if (!getPrefsSync().hapticsEnabled) return Promise.resolve();
    return Haptics.selectionAsync().catch(() => { });
}
