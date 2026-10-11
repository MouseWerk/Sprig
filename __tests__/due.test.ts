import { calculateSM2, countDueCards, dueCardIndices, isCardDue, isReviewDue, liveStreak, localDateKey } from '@/utils/Storage';
import type { SRSCardData } from '@/utils/Storage';

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);
const srs = (nextReview: Date, interval = 1): SRSCardData => ({ interval, repetition: 1, easeFactor: 2.5, nextReview: nextReview.toISOString() });

describe('isReviewDue', () => {
    it('makes a card due from the start of its day, not at the clock time of the last review', () => {
        // Reviewed at 21:00 with a one-day interval: due the whole next day
        const next = at(2026, 3, 11, 21, 0);
        expect(isReviewDue(next.toISOString(), at(2026, 3, 11, 0, 1))).toBe(true);
        expect(isReviewDue(next.toISOString(), at(2026, 3, 11, 8, 0))).toBe(true);
        expect(isReviewDue(next.toISOString(), at(2026, 3, 10, 23, 59))).toBe(false);
    });

    it('treats an unreadable date as due rather than hiding the card', () => {
        expect(isReviewDue('not a date', at(2026, 1, 1))).toBe(true);
    });

    it('counts a card graded late in the evening as due the next morning', () => {
        const reviewedAt = at(2026, 6, 15, 22, 30);
        const result = calculateSM2(5, 0, 0, 2.5);
        // calculateSM2 schedules from "now"; rebuild the same date from the review time
        const next = new Date(reviewedAt);
        next.setDate(next.getDate() + result.interval);
        expect(isReviewDue(next.toISOString(), at(2026, 6, 16, 7, 0))).toBe(true);
    });
});

describe('due counts', () => {
    const now = at(2026, 5, 10, 9, 0);

    it('counts never-reviewed cards and cards due today, but not future ones', () => {
        const deck = {
            totalCards: 4,
            srsData: {
                0: srs(at(2026, 5, 10, 20, 0)), // later today: due
                1: srs(at(2026, 5, 11, 6, 0)),  // tomorrow
                // 2 and 3 never reviewed
            },
        };
        expect(dueCardIndices(deck, now)).toEqual([0, 2, 3]);
        expect(countDueCards(deck, now)).toBe(3);
    });

    it('ignores SRS rows past the end of the deck', () => {
        // The old "due rows + (total - rows)" arithmetic went negative here
        const deck = { totalCards: 1, srsData: { 0: srs(at(2026, 6, 1)), 5: srs(at(2026, 5, 1)), 6: srs(at(2026, 5, 1)) } };
        expect(countDueCards(deck, now)).toBe(0);
    });

    it('treats a missing srs row as due', () => {
        expect(isCardDue(undefined, now)).toBe(true);
    });
});

describe('liveStreak', () => {
    const today = at(2026, 8, 20, 10, 0);
    const daysAgo = (n: number) => {
        const d = new Date(today);
        d.setDate(d.getDate() - n);
        return localDateKey(d);
    };

    it('keeps the streak when the last study day was today or yesterday', () => {
        expect(liveStreak({ lastStudyDate: daysAgo(0), currentStreak: 5, streakFreezes: 0 }, today)).toBe(5);
        expect(liveStreak({ lastStudyDate: daysAgo(1), currentStreak: 5, streakFreezes: 0 }, today)).toBe(5);
    });

    it('keeps it across one missed day only with a banked freeze', () => {
        expect(liveStreak({ lastStudyDate: daysAgo(2), currentStreak: 5, streakFreezes: 1 }, today)).toBe(5);
        expect(liveStreak({ lastStudyDate: daysAgo(2), currentStreak: 5, streakFreezes: 0 }, today)).toBe(0);
    });

    it('shows a broken streak as zero, whatever is still stored', () => {
        expect(liveStreak({ lastStudyDate: daysAgo(3), currentStreak: 40, streakFreezes: 3 }, today)).toBe(0);
        expect(liveStreak({ lastStudyDate: '', currentStreak: 2, streakFreezes: 0 }, today)).toBe(0);
    });

    it('accepts dates stored by older builds as full ISO strings', () => {
        expect(liveStreak({ lastStudyDate: `${daysAgo(1)}T23:10:00.000Z`, currentStreak: 3, streakFreezes: 0 }, today)).toBe(3);
    });
});

// Runs in a zone with daylight saving time. Node picks up a TZ change at
// runtime; it is restored afterwards so other files keep their zone.
describe('across a daylight saving change (Europe/Berlin)', () => {
    const originalTz = process.env.TZ;
    beforeAll(() => { process.env.TZ = 'Europe/Berlin'; });
    afterAll(() => { process.env.TZ = originalTz; });

    it('falls due on the calendar day after the spring-forward night', () => {
        // 28 March 2026, 23:30 CET; the clocks jump at 02:00 on the 29th
        const reviewed = new Date(2026, 2, 28, 23, 30);
        const next = new Date(reviewed);
        next.setDate(next.getDate() + 1);
        expect(localDateKey(next)).toBe('2026-03-29');
        expect(isReviewDue(next.toISOString(), new Date(2026, 2, 29, 0, 5))).toBe(true);
        expect(isReviewDue(next.toISOString(), new Date(2026, 2, 28, 23, 59))).toBe(false);
    });

    it('falls due on the calendar day after the fall-back night', () => {
        const reviewed = new Date(2026, 9, 24, 23, 30);
        const next = new Date(reviewed);
        next.setDate(next.getDate() + 1);
        expect(localDateKey(next)).toBe('2026-10-25');
        expect(isReviewDue(next.toISOString(), new Date(2026, 9, 25, 0, 30))).toBe(true);
    });
});
