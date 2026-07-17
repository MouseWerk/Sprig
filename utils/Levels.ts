// XP + level progression. Pure math, no React — safe to use anywhere.

// Default number of cards that fills the daily goal ring.
export const DAILY_GOAL = 20;

// XP earned for a single card review, scaled by how well it went.
export function xpForGrade(grade: number): number {
    if (grade >= 4) return 12;  // Good
    if (grade === 3) return 8;  // Hard
    return 5;                    // Again — still rewards showing up
}

// Total XP required to *reach* a given level (level 1 = 0).
// Each level costs 100 * level more than the last: 100, 200, 300, ...
export function xpToReachLevel(level: number): number {
    const l = Math.max(1, level);
    return 50 * l * (l - 1);
}

export function levelForXp(totalXp: number): number {
    const xp = Math.max(0, totalXp);
    let level = 1;
    while (xpToReachLevel(level + 1) <= xp) level++;
    return level;
}

export interface LevelInfo {
    level: number;
    rank: string;
    xpIntoLevel: number;   // XP earned inside the current level
    xpForLevel: number;    // XP span of the current level
    xpToNext: number;      // XP remaining to the next level
    progress: number;      // 0..1 within the current level
    totalXp: number;
}

const RANKS: { min: number; name: string }[] = [
    { min: 1, name: 'Novice' },
    { min: 5, name: 'Apprentice' },
    { min: 10, name: 'Scholar' },
    { min: 20, name: 'Expert' },
    { min: 35, name: 'Master' },
    { min: 50, name: 'Grandmaster' },
    { min: 75, name: 'Sage' },
];

export function rankForLevel(level: number): string {
    let name = RANKS[0].name;
    for (const r of RANKS) {
        if (level >= r.min) name = r.name;
    }
    return name;
}

export function getLevelInfo(totalXp: number): LevelInfo {
    const xp = Math.max(0, totalXp || 0);
    const level = levelForXp(xp);
    const floor = xpToReachLevel(level);
    const ceil = xpToReachLevel(level + 1);
    const xpForLevel = ceil - floor;
    const xpIntoLevel = xp - floor;
    return {
        level,
        rank: rankForLevel(level),
        xpIntoLevel,
        xpForLevel,
        xpToNext: Math.max(0, ceil - xp),
        progress: xpForLevel > 0 ? Math.min(1, xpIntoLevel / xpForLevel) : 0,
        totalXp: xp,
    };
}
