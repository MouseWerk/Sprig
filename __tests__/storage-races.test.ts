// Read-modify-write paths over the single-row kv records (stats, grove,
// reflections) with an in-memory stand-in for the database. Every call
// yields to the event loop, so overlapping calls really interleave the way
// they do on a device: two reads first, then two writes.
const mockKv = new Map<string, string>();
const mockFailReads = new Set<string>();
const mockDb = {
    async getFirstAsync(sql: string, ...params: unknown[]) {
        await new Promise(r => setTimeout(r, 0));
        if (/FROM kv WHERE key = \?/.test(sql)) {
            const key = String(params[0]);
            if (mockFailReads.has(key)) throw new Error('database is locked');
            const value = mockKv.get(key);
            return value === undefined ? null : { value };
        }
        throw new Error(`unexpected query: ${sql}`);
    },
    async runAsync(sql: string, ...params: unknown[]) {
        await new Promise(r => setTimeout(r, 0));
        if (/INSERT OR REPLACE INTO kv/.test(sql)) {
            mockKv.set(String(params[0]), String(params[1]));
            return { changes: 1 };
        }
        throw new Error(`unexpected statement: ${sql}`);
    },
    async getAllAsync() {
        await new Promise(r => setTimeout(r, 0));
        return [];
    },
};
jest.mock('@/utils/Database', () => ({ getDb: async () => mockDb }));

import { collectDew, harvestPlant, pendingDew, type GrovePlant } from '@/utils/Grove';
import {
    buyPlanter, getRecentReflections, getUserStats, loadGroveEconomy, revertUserStats,
    saveReflection, updateUserStats,
} from '@/utils/Storage';

const stats = () => JSON.parse(mockKv.get('stats') ?? '{}');
const grove = () => JSON.parse(mockKv.get('grove') ?? '{}');
const plant = (over: Partial<GrovePlant> = {}): GrovePlant => ({
    deckId: 'd1', deckName: 'Deck', uri: 'file:///d1.csv', species: 0,
    totalCards: 20, reviewed: 20, matureCards: 20, dueCards: 0, dueIndices: [],
    maturity: 1, stage: 'blossoming', resting: false, examPlan: null,
    growth: 1, potStyle: 'classic', ...over,
});

beforeEach(() => {
    mockKv.clear();
    mockFailReads.clear();
});

describe('lifetime stats', () => {
    it('keeps a review and its undo consistent when they overlap', async () => {
        await updateUserStats(5, 50, 5);
        const before = stats().totalCardsReviewed;
        await Promise.all([updateUserStats(1, 10, 5), revertUserStats(1, 10, 0)]);
        expect(stats().totalCardsReviewed).toBe(before);
    });

    it('never overwrites stored stats with zeros when the read fails', async () => {
        await updateUserStats(3, 30, 5);
        const stored = mockKv.get('stats');
        mockFailReads.add('stats');
        await expect(updateUserStats(1, 10, 5)).rejects.toThrow();
        await expect(revertUserStats(1, 10, 5)).rejects.toThrow();
        expect(mockKv.get('stats')).toBe(stored);
        // Display reads still degrade gracefully
        await expect(getUserStats()).resolves.toMatchObject({ totalCardsReviewed: 0 });
    });

    it('still counts the review when only the grove cannot be read', async () => {
        mockFailReads.add('grove');
        const result = await updateUserStats(1, 10, 5);
        expect(result.dewEarned).toBe(0);
        expect(stats().totalCardsReviewed).toBe(1);
        expect(mockKv.has('grove')).toBe(false);
    });
});

describe('grove economy', () => {
    it('grants one seed for a double-tapped harvest', async () => {
        await loadGroveEconomy(); // first run writes the fresh economy
        const [a, b] = await Promise.all([harvestPlant(plant()), harvestPlant(plant())]);
        expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
        expect(grove().seeds).toBe(1);
    });

    it('charges a double-tapped planter only once', async () => {
        const econ = await loadGroveEconomy();
        mockKv.set('grove', JSON.stringify({ ...econ, dew: 1000 }));
        await Promise.all([buyPlanter('d1', 'terracotta'), buyPlanter('d1', 'terracotta')]);
        expect(grove().dew).toBe(1000 - 250);
        expect(grove().planters).toEqual({ d1: 'terracotta' });
    });

    it('starts accruing again after the clock was set back', async () => {
        const econ = await loadGroveEconomy();
        const future = Date.now() + 5 * 3600 * 1000;
        mockKv.set('grove', JSON.stringify({ ...econ, lastCollectedAt: future }));
        await collectDew([plant({ stage: 'sapling' })]);
        const reset = grove().lastCollectedAt;
        expect(reset).toBeLessThanOrEqual(Date.now());
        // Two hours later the sapling (4 dew/h) has produced dew again
        const later = reset + 2 * 3600 * 1000;
        expect(pendingDew([plant({ stage: 'sapling' })], grove(), 0, later)).toBe(8);
    });
});

describe('reflections', () => {
    it('keeps both notes when two saves overlap', async () => {
        const entry = { deckId: 'd1', deckName: 'Deck', cardsReviewed: 3, accuracy: 100 };
        await Promise.all([saveReflection({ ...entry, note: 'first' }), saveReflection({ ...entry, note: 'second' })]);
        const notes = (await getRecentReflections(10)).map(r => r.note).sort();
        expect(notes).toEqual(['first', 'second']);
    });
});
