import { useNavigation } from 'expo-router';
import { useEffect, useRef } from 'react';

// Runs the callback whenever this screen's tab-bar button is pressed —
// both when re-tapping the already-active tab and when switching to it.
// Used by the library tabs to pop folder navigation back to the root.
export function useTabPressReset(onTabPress: () => void) {
    const navigation = useNavigation();
    const callbackRef = useRef(onTabPress);
    callbackRef.current = onTabPress;

    useEffect(() => {
        return navigation.addListener('tabPress' as never, () => {
            callbackRef.current();
        });
    }, [navigation]);
}
