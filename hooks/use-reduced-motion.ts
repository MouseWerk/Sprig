import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// Follows the system setting that asks apps to cut motion (Android "Remove
// animations", iOS "Reduce Motion"). Idle loops then stand still and
// sheets, toasts and card flips change state without moving.
export function useReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        let mounted = true;
        AccessibilityInfo.isReduceMotionEnabled()
            .then(value => { if (mounted) setReduced(value); })
            .catch(() => { });
        const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
        return () => {
            mounted = false;
            sub.remove();
        };
    }, []);
    return reduced;
}
