import { getExamPlan, localDateKey, safeAudioFileName } from '@/utils/Storage';
import type { Deck } from '@/utils/Storage';

describe('localDateKey', () => {
    it('formats the local calendar date, zero-padded', () => {
        expect(localDateKey(new Date(2026, 0, 5, 12, 0))).toBe('2026-01-05');
        expect(localDateKey(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
    });

    it('uses the local day, not the UTC one, just after midnight', () => {
        // The bug this replaced: toISOString() here returns the *previous*
        // day for anyone east of UTC, filing after-midnight study on yesterday.
        const justAfterMidnight = new Date(2026, 0, 1, 0, 30);
        expect(localDateKey(justAfterMidnight)).toBe('2026-01-01');
    });

    it('uses the local day, not the UTC one, late in the evening', () => {
        // And the mirror image: west of UTC, toISOString() rolls an evening
        // session onto tomorrow.
        const lateEvening = new Date(2026, 5, 15, 23, 30);
        expect(localDateKey(lateEvening)).toBe('2026-06-15');
    });

    it('round-trips every day of a year without gaps or repeats', () => {
        const seen = new Set<string>();
        const d = new Date(2026, 0, 1, 12, 0);
        for (let i = 0; i < 365; i++) {
            seen.add(localDateKey(d));
            d.setDate(d.getDate() + 1);
        }
        expect(seen.size).toBe(365);
    });
});

describe('safeAudioFileName', () => {
    it('strips anything that could steer a write out of the audio directory', () => {
        expect(safeAudioFileName('../../etc/passwd')).not.toContain('/');
        expect(safeAudioFileName('..\\windows\\system32')).not.toContain('\\');
        expect(safeAudioFileName('a/b:c*d?e"f<g>h|i')).toBe('a_b_c_d_e_f_g_h_i');
    });

    it('never returns a name that starts with a dot', () => {
        expect(safeAudioFileName('...hidden.mp3')).toBe('hidden.mp3');
        expect(safeAudioFileName('.')).toBe('audio');
    });

    it('leaves an ordinary file name alone', () => {
        expect(safeAudioFileName('Lecture 3 - Intro.mp3')).toBe('Lecture 3 - Intro.mp3');
    });

    it('falls back rather than returning an empty name', () => {
        expect(safeAudioFileName('')).toBe('audio');
    });

    it('caps the length so the path stays sane', () => {
        expect(safeAudioFileName('x'.repeat(500)).length).toBe(120);
    });
});

describe('getExamPlan', () => {
    const deck = (examDate: string | null, total: number, learned: number): Deck => ({
        id: 'd1', name: 'Deck', uri: 'file:///d1.csv', icon: 'Book', type: 'csv',
        totalCards: total, learnedIndices: Array.from({ length: learned }, (_, i) => i),
        unsureIndices: [], folderId: null, examDate: examDate ?? undefined,
    } as unknown as Deck);

    it('returns null without an exam date', () => {
        expect(getExamPlan(deck(null, 100, 10))).toBeNull();
    });

    it('counts the days left against the local date, not a UTC one', () => {
        const in10Days = localDateKey(new Date(Date.now() + 10 * 86_400_000));
        const plan = getExamPlan(deck(in10Days, 100, 0));
        expect(plan?.daysLeft).toBe(10);
    });

    it('is on track when nothing is left to learn', () => {
        const soon = localDateKey(new Date(Date.now() + 2 * 86_400_000));
        const plan = getExamPlan(deck(soon, 40, 40));
        expect(plan?.cardsPerDay).toBe(0);
        expect(plan?.onTrack).toBe(true);
    });
});
