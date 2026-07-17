import { levelForXp } from './Levels';
import type { UserStats } from './Storage';

export type AchievementMetric = 'cards' | 'streak' | 'time' | 'focus' | 'quiz' | 'level';

export interface AchievementDef {
    id: string;
    title: string;
    description: string;
    icon: string;   // lucide-react-native icon name
    color: string;
    metric: AchievementMetric;
    threshold: number;
}

// The full catalog. Unlock state is always recomputed from UserStats, so
// adding or retuning an achievement here takes effect immediately.
export const ACHIEVEMENTS: AchievementDef[] = [
    // Cards reviewed
    { id: 'first_steps', title: 'First Steps', description: 'Review your first card', icon: 'Footprints', color: '#6366f1', metric: 'cards', threshold: 1 },
    { id: 'warming_up', title: 'Warming Up', description: 'Review 10 cards', icon: 'Sparkles', color: '#8b5cf6', metric: 'cards', threshold: 10 },
    { id: 'century', title: 'Century', description: 'Review 100 cards', icon: 'Award', color: '#3b82f6', metric: 'cards', threshold: 100 },
    { id: 'scholar', title: 'Scholar', description: 'Review 500 cards', icon: 'GraduationCap', color: '#06b6d4', metric: 'cards', threshold: 500 },
    { id: 'millennial_mind', title: 'Millennial Mind', description: 'Review 1,000 cards', icon: 'Brain', color: '#10b981', metric: 'cards', threshold: 1000 },
    { id: 'grandmaster', title: 'Grandmaster', description: 'Review 5,000 cards', icon: 'Crown', color: '#f59e0b', metric: 'cards', threshold: 5000 },

    // Daily streak (uses your best-ever streak, so it never re-locks)
    { id: 'consistent', title: 'Consistent', description: 'Reach a 3-day streak', icon: 'Flame', color: '#f97316', metric: 'streak', threshold: 3 },
    { id: 'week_warrior', title: 'Week Warrior', description: 'Reach a 7-day streak', icon: 'CalendarCheck', color: '#ef4444', metric: 'streak', threshold: 7 },
    { id: 'fortnight', title: 'Fortnight', description: 'Reach a 14-day streak', icon: 'CalendarDays', color: '#ec4899', metric: 'streak', threshold: 14 },
    { id: 'monthly_master', title: 'Monthly Master', description: 'Reach a 30-day streak', icon: 'Trophy', color: '#eab308', metric: 'streak', threshold: 30 },
    { id: 'unstoppable', title: 'Unstoppable', description: 'Reach a 100-day streak', icon: 'Zap', color: '#a855f7', metric: 'streak', threshold: 100 },

    // Time studied
    { id: 'focused', title: 'Focused', description: 'Study for 1 hour total', icon: 'Clock', color: '#14b8a6', metric: 'time', threshold: 3600 },
    { id: 'dedicated', title: 'Dedicated', description: 'Study for 10 hours total', icon: 'Hourglass', color: '#0ea5e9', metric: 'time', threshold: 36000 },
    { id: 'marathoner', title: 'Marathoner', description: 'Study for 50 hours total', icon: 'Timer', color: '#6366f1', metric: 'time', threshold: 180000 },

    // Focus sessions (the plant timer)
    { id: 'first_sprout', title: 'First Sprout', description: 'Complete a focus session', icon: 'Sprout', color: '#22c55e', metric: 'focus', threshold: 1 },
    { id: 'green_thumb', title: 'Green Thumb', description: 'Complete 10 focus sessions', icon: 'Leaf', color: '#16a34a', metric: 'focus', threshold: 10 },
    { id: 'forest_keeper', title: 'Forest Keeper', description: 'Complete 50 focus sessions', icon: 'TreePine', color: '#15803d', metric: 'focus', threshold: 50 },

    // Quizzes finished
    { id: 'quiz_rookie', title: 'Quiz Rookie', description: 'Finish your first quiz', icon: 'CircleQuestionMark', color: '#f43f5e', metric: 'quiz', threshold: 1 },
    { id: 'quiz_whiz', title: 'Quiz Whiz', description: 'Finish 10 quizzes', icon: 'Lightbulb', color: '#fb7185', metric: 'quiz', threshold: 10 },
    { id: 'quiz_master', title: 'Quiz Master', description: 'Finish 50 quizzes', icon: 'BadgeCheck', color: '#e11d48', metric: 'quiz', threshold: 50 },

    // Level milestones
    { id: 'level_5', title: 'Apprentice', description: 'Reach level 5', icon: 'Star', color: '#f59e0b', metric: 'level', threshold: 5 },
    { id: 'level_10', title: 'Rising Scholar', description: 'Reach level 10', icon: 'Sparkles', color: '#d97706', metric: 'level', threshold: 10 },
    { id: 'level_25', title: 'Luminary', description: 'Reach level 25', icon: 'Sun', color: '#b45309', metric: 'level', threshold: 25 },
];

export function metricValue(stats: UserStats, metric: AchievementMetric): number {
    switch (metric) {
        case 'cards': return stats.totalCardsReviewed || 0;
        case 'streak': return Math.max(stats.longestStreak || 0, stats.currentStreak || 0);
        case 'time': return stats.totalStudyTime || 0;
        case 'focus': return stats.focusSessions || 0;
        case 'quiz': return stats.quizzesCompleted || 0;
        case 'level': return levelForXp(stats.totalXp || 0);
    }
}

export function isUnlocked(stats: UserStats, a: AchievementDef): boolean {
    return metricValue(stats, a.metric) >= a.threshold;
}

// Progress toward an achievement, 0..1
export function achievementProgress(stats: UserStats, a: AchievementDef): number {
    if (a.threshold <= 0) return 1;
    return Math.min(1, metricValue(stats, a.metric) / a.threshold);
}

// IDs of every achievement currently satisfied by these stats
export function evaluateAchievements(stats: UserStats): string[] {
    return ACHIEVEMENTS.filter(a => isUnlocked(stats, a)).map(a => a.id);
}

export function unlockedCount(stats: UserStats): number {
    return ACHIEVEMENTS.reduce((n, a) => n + (isUnlocked(stats, a) ? 1 : 0), 0);
}

function formatValue(metric: AchievementMetric, value: number): string {
    if (metric === 'time') {
        const hours = value / 3600;
        if (hours >= 1) return `${hours % 1 === 0 ? hours : hours.toFixed(1)}h`;
        return `${Math.floor(value / 60)}m`;
    }
    return value.toLocaleString();
}

// e.g. "40 / 100" or "1.2h / 10h" for progress captions
export function progressLabel(stats: UserStats, a: AchievementDef): string {
    const current = Math.min(metricValue(stats, a.metric), a.threshold);
    return `${formatValue(a.metric, current)} / ${formatValue(a.metric, a.threshold)}`;
}
