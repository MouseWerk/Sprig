import { getLevelInfo, levelForXp, rankForLevel, xpForGrade, xpToReachLevel } from '@/utils/Levels';

describe('xpToReachLevel', () => {
    it('starts level 1 at zero', () => {
        expect(xpToReachLevel(1)).toBe(0);
    });

    it('charges 100 more for each successive level', () => {
        const costs = [2, 3, 4, 5].map(l => xpToReachLevel(l) - xpToReachLevel(l - 1));
        expect(costs).toEqual([100, 200, 300, 400]);
    });

    it('never returns a level below 1', () => {
        expect(xpToReachLevel(0)).toBe(0);
        expect(xpToReachLevel(-5)).toBe(0);
    });
});

describe('levelForXp', () => {
    it('is level 1 until the first threshold is actually reached', () => {
        expect(levelForXp(0)).toBe(1);
        expect(levelForXp(99)).toBe(1);
        expect(levelForXp(100)).toBe(2);
    });

    it('treats negative XP as zero rather than throwing', () => {
        expect(levelForXp(-1)).toBe(1);
    });

    it('agrees with xpToReachLevel at every boundary', () => {
        for (let level = 1; level <= 30; level++) {
            const floor = xpToReachLevel(level);
            expect(levelForXp(floor)).toBe(level);
            if (level > 1) expect(levelForXp(floor - 1)).toBe(level - 1);
        }
    });
});

describe('getLevelInfo', () => {
    it('reports progress inside the current level', () => {
        // Level 2 spans 100..300, so 200 XP is halfway through it.
        const info = getLevelInfo(200);
        expect(info.level).toBe(2);
        expect(info.xpIntoLevel).toBe(100);
        expect(info.xpForLevel).toBe(200);
        expect(info.progress).toBeCloseTo(0.5);
        expect(info.xpToNext).toBe(100);
    });

    it('keeps progress within 0..1 and survives junk input', () => {
        for (const xp of [0, 1, 99, 100, 12345, -50, NaN]) {
            const info = getLevelInfo(xp);
            expect(info.progress).toBeGreaterThanOrEqual(0);
            expect(info.progress).toBeLessThanOrEqual(1);
        }
    });
});

describe('rankForLevel', () => {
    it('picks the highest rank the level qualifies for', () => {
        expect(rankForLevel(1)).toBe('Novice');
        expect(rankForLevel(4)).toBe('Novice');
        expect(rankForLevel(5)).toBe('Apprentice');
        expect(rankForLevel(10)).toBe('Scholar');
        expect(rankForLevel(999)).toBe('Sage');
    });

    it('falls back to the lowest rank below the first threshold', () => {
        expect(rankForLevel(0)).toBe('Novice');
    });
});

describe('xpForGrade', () => {
    it('pays more for a better recall but never nothing', () => {
        expect(xpForGrade(5)).toBe(12);
        expect(xpForGrade(4)).toBe(12);
        expect(xpForGrade(3)).toBe(8);
        expect(xpForGrade(0)).toBe(5);
    });
});
