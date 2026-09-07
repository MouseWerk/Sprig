import {
    ACHIEVEMENTS, achievementProgress, evaluateAchievements, isUnlocked,
    metricValue, progressLabel, unlockedCount,
} from '@/utils/Achievements';
import type { UserStats } from '@/utils/Storage';

const stats = (over: Partial<UserStats> = {}): UserStats => ({
    totalCardsReviewed: 0, totalStudyTime: 0, lastStudyDate: '', currentStreak: 0,
    longestStreak: 0, achievements: [], dailyReviews: {}, totalXp: 0,
    streakFreezes: 0, focusSessions: 0, quizzesCompleted: 0, ...over,
});

describe('the catalog itself', () => {
    it('has unique ids', () => {
        const ids = ACHIEVEMENTS.map(a => a.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('has a positive threshold everywhere, so nothing unlocks for free', () => {
        for (const a of ACHIEVEMENTS) expect(a.threshold).toBeGreaterThan(0);
    });
});

describe('metricValue', () => {
    it('uses the best streak ever, so an achievement never re-locks', () => {
        expect(metricValue(stats({ currentStreak: 3, longestStreak: 21 }), 'streak')).toBe(21);
        expect(metricValue(stats({ currentStreak: 30, longestStreak: 21 }), 'streak')).toBe(30);
    });

    it('derives the level from XP rather than storing it', () => {
        expect(metricValue(stats({ totalXp: 0 }), 'level')).toBe(1);
        expect(metricValue(stats({ totalXp: 5240 }), 'level')).toBe(10);
    });
});

describe('isUnlocked / evaluateAchievements', () => {
    it('unlocks exactly at the threshold, not one short of it', () => {
        const century = ACHIEVEMENTS.find(a => a.id === 'century')!;
        expect(isUnlocked(stats({ totalCardsReviewed: 99 }), century)).toBe(false);
        expect(isUnlocked(stats({ totalCardsReviewed: 100 }), century)).toBe(true);
    });

    it('unlocks nothing for a brand-new user', () => {
        expect(evaluateAchievements(stats())).toEqual([]);
        expect(unlockedCount(stats())).toBe(0);
    });

    it('is monotonic — more progress never removes an unlock', () => {
        const small = new Set(evaluateAchievements(stats({ totalCardsReviewed: 100, totalXp: 300 })));
        const large = evaluateAchievements(stats({ totalCardsReviewed: 5000, totalXp: 90000 }));
        for (const id of small) expect(large).toContain(id);
    });
});

describe('progress display', () => {
    it('never reports more than complete', () => {
        const first = ACHIEVEMENTS.find(a => a.id === 'first_steps')!;
        expect(achievementProgress(stats({ totalCardsReviewed: 900 }), first)).toBe(1);
    });

    it('clamps the label to the threshold instead of overshooting', () => {
        const century = ACHIEVEMENTS.find(a => a.id === 'century')!;
        expect(progressLabel(stats({ totalCardsReviewed: 5000 }), century)).toBe('100 / 100');
    });

    it('formats study time in hours once it passes one', () => {
        const focused = ACHIEVEMENTS.find(a => a.id === 'focused')!;   // 3600s
        expect(progressLabel(stats({ totalStudyTime: 1800 }), focused)).toBe('30m / 1h');
        expect(progressLabel(stats({ totalStudyTime: 3600 }), focused)).toBe('1h / 1h');
    });
});
