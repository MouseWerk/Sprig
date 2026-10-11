import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { ToastProvider, useToast } from '@/components/ui/Toast';

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

let show: ReturnType<typeof useToast>['showToast'] = () => { };
function Grab() {
    show = useToast().showToast;
    return null;
}

const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map(n => [n.props.children].flat().join(''));

describe('toasts and a pending Undo', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('let a quick follow-up message wait instead of taking the Undo away', () => {
        let tree!: ReactTestRenderer;
        act(() => {
            tree = create(<LanguageProvider><ToastProvider><Grab /></ToastProvider></LanguageProvider>);
        });
        const undo = jest.fn();
        act(() => show({ message: 'Deck deleted', type: 'info', duration: 5000, action: { label: 'Undo', onPress: undo } }));
        act(() => show({ message: 'Folder created', type: 'success' }));

        // The undo toast is still the one on screen, its action still there
        expect(texts(tree)).toEqual(expect.arrayContaining(['Deck deleted', 'Undo']));
        expect(texts(tree)).not.toContain('Folder created');

        // Once it has run its course, the waiting message follows
        act(() => { jest.advanceTimersByTime(5000 + 1000); });
        expect(texts(tree)).toContain('Folder created');
        expect(texts(tree)).not.toContain('Undo');
        expect(undo).not.toHaveBeenCalled();
    });

    it('still lets a newer Undo replace an older one', () => {
        let tree!: ReactTestRenderer;
        act(() => {
            tree = create(<LanguageProvider><ToastProvider><Grab /></ToastProvider></LanguageProvider>);
        });
        act(() => show({ message: 'Deck A deleted', duration: 5000, action: { label: 'Undo', onPress: () => { } } }));
        act(() => show({ message: 'Deck B deleted', duration: 5000, action: { label: 'Undo', onPress: () => { } } }));
        expect(texts(tree)).toContain('Deck B deleted');
    });
});
