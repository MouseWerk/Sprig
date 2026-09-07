import { calculateSM2 } from '@/utils/Storage';

// SM-2 as the app applies it: grade >= 3 counts as a pass, below that resets.
describe('calculateSM2', () => {
    it('walks a new card through the 1 / 6 / interval*ease ladder', () => {
        const first = calculateSM2(5, 0, 0, 2.5);
        expect(first.interval).toBe(1);
        expect(first.repetition).toBe(1);

        const second = calculateSM2(5, first.interval, first.repetition, first.easeFactor);
        expect(second.interval).toBe(6);
        expect(second.repetition).toBe(2);

        const third = calculateSM2(5, second.interval, second.repetition, second.easeFactor);
        expect(third.interval).toBe(Math.round(6 * second.easeFactor));
        expect(third.repetition).toBe(3);
    });

    it('resets repetition and interval on a failed recall', () => {
        const failed = calculateSM2(0, 45, 6, 2.4);
        expect(failed.interval).toBe(1);
        expect(failed.repetition).toBe(0);
    });

    it('moves the ease factor the way SM-2 prescribes', () => {
        expect(calculateSM2(5, 1, 1, 2.5).easeFactor).toBeCloseTo(2.6);   // +0.10
        expect(calculateSM2(4, 1, 1, 2.5).easeFactor).toBeCloseTo(2.5);   //  0.00
        expect(calculateSM2(3, 1, 1, 2.5).easeFactor).toBeCloseTo(2.36);  // -0.14
        expect(calculateSM2(0, 1, 1, 2.5).easeFactor).toBeCloseTo(1.7);   // -0.80
    });

    it('never lets the ease factor fall below 1.3', () => {
        let ease = 2.5;
        for (let i = 0; i < 20; i++) ease = calculateSM2(0, 1, 0, ease).easeFactor;
        expect(ease).toBe(1.3);
    });

    it('schedules nextReview interval days out, not in the past', () => {
        const result = calculateSM2(5, 6, 2, 2.5);
        const days = Math.round(
            (Date.parse(result.nextReview) - Date.now()) / 86_400_000
        );
        expect(days).toBe(result.interval);
    });
});
