import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, create } from 'react-test-renderer';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

let seen: boolean[] = [];
function Probe() {
    seen.push(useReducedMotion());
    return null;
}

describe('useReducedMotion', () => {
    beforeEach(() => { seen = []; });

    it('follows the system setting and its changes', async () => {
        let listener: (value: boolean) => void = () => { };
        jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
        jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((_event: string, handler: (value: boolean) => void) => {
            listener = handler;
            return { remove: () => { } };
        }) as any);

        await act(async () => { create(<Probe />); });
        expect(seen[seen.length - 1]).toBe(true);

        act(() => listener(false));
        expect(seen[seen.length - 1]).toBe(false);
    });
});
