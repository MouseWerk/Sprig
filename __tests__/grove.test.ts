import {
    canHarvest, dewRatePerHour, harvestCooldownDays, HARVEST_COOLDOWN_MS,
    MATURE_INTERVAL_DAYS, pendingDew, speciesForDeck, stageForMaturity, streakMultiplier,
    type GrovePlant,
} from '@/utils/Grove';
import type { GroveEconomy } from '@/utils/Storage';

const plant = (over: Partial<GrovePlant> = {}): GrovePlant => ({
    deckId: 'd1', deckName: 'Deck', uri: 'file:///d1.csv', species: 0,
    totalCards: 20, reviewed: 20, matureCards: 20, dueCards: 0, dueIndices: [],
    maturity: 1, stage: 'blossoming', resting: false, examPlan: null,
    growth: 1, potStyle: 'classic', ...over,
});

const econ = (over: Partial<GroveEconomy> = {}): GroveEconomy => ({
    dew: 0, lastCollectedAt: Date.now(), burstDate: '', burstDewToday: 0,
    boostUntil: 0, seeds: 0, harvests: {}, speciesOverrides: {}, lastStages: {},
    planters: {}, ownedDecorations: [], equippedDecorations: [], ...over,
} as GroveEconomy);

describe('stageForMaturity', () => {
    it('is a seed until the first card has been reviewed', () => {
        expect(stageForMaturity(0, 0)).toBe('seed');
        expect(stageForMaturity(1, 0)).toBe('seed');
    });

    it('climbs the stages at the documented thresholds', () => {
        expect(stageForMaturity(0, 1)).toBe('sprout');
        expect(stageForMaturity(0.24, 1)).toBe('sprout');
        expect(stageForMaturity(0.25, 1)).toBe('sapling');
        expect(stageForMaturity(0.6, 1)).toBe('youngTree');
        expect(stageForMaturity(0.9, 1)).toBe('flourishing');
        expect(stageForMaturity(1, 1)).toBe('blossoming');
    });

    it('never skips backwards as maturity rises', () => {
        const order = ['seed', 'sprout', 'sapling', 'youngTree', 'flourishing', 'blossoming'];
        let last = -1;
        for (let m = 0; m <= 1.0001; m += 0.01) {
            const idx = order.indexOf(stageForMaturity(m, 5));
            expect(idx).toBeGreaterThanOrEqual(last);
            last = idx;
        }
    });
});

describe('speciesForDeck', () => {
    it('is stable for the same deck id', () => {
        expect(speciesForDeck('1788633795492123456')).toBe(speciesForDeck('1788633795492123456'));
    });

    it('spreads neighbouring ids across species instead of clustering', () => {
        // Ids are built as strings (timestamp + six random digits) and are far
        // past Number.MAX_SAFE_INTEGER, so they have to be varied as text —
        // adding 1 to them as numbers is a no-op.
        const species = new Set(
            Array.from({ length: 8 }, (_, i) => speciesForDeck('1788633795492' + (100000 + i)))
        );
        expect(species.size).toBeGreaterThan(1);
    });
});

describe('streakMultiplier', () => {
    it('rewards a longer streak in steps', () => {
        expect(streakMultiplier(0)).toBe(1);
        expect(streakMultiplier(6)).toBe(1);
        expect(streakMultiplier(7)).toBe(1.25);
        expect(streakMultiplier(29)).toBe(1.25);
        expect(streakMultiplier(30)).toBe(1.5);
    });
});

describe('dewRatePerHour', () => {
    it('pays nothing for a resting plant', () => {
        expect(dewRatePerHour([plant({ resting: true })], 0)).toBe(0);
    });

    it('sums the plants and applies the streak multiplier', () => {
        const two = [plant(), plant({ deckId: 'd2' })];
        expect(dewRatePerHour(two, 0)).toBe(24);      // 12 + 12, blossoming
        expect(dewRatePerHour(two, 30)).toBe(36);     // × 1.5
    });
});

describe('pendingDew', () => {
    it('is zero right after collecting', () => {
        const now = Date.now();
        expect(pendingDew([plant()], econ({ lastCollectedAt: now }), 0, now)).toBe(0);
    });

    it('caps accrual so leaving the app for days is no better than half a day', () => {
        const now = Date.now();
        const twelveHours = pendingDew([plant()], econ({ lastCollectedAt: now - 12 * 3600_000 }), 0, now);
        const fiveDays = pendingDew([plant()], econ({ lastCollectedAt: now - 5 * 86_400_000 }), 0, now);
        expect(fiveDays).toBe(twelveHours);
    });

    it('never goes negative if the clock moved backwards', () => {
        const now = Date.now();
        expect(pendingDew([plant()], econ({ lastCollectedAt: now + 86_400_000 }), 0, now)).toBe(0);
    });
});

describe('canHarvest', () => {
    const now = Date.now();

    it('only allows a fully blossoming plant', () => {
        expect(canHarvest(plant({ stage: 'flourishing' }), econ(), now)).toBe(false);
        expect(canHarvest(plant(), econ(), now)).toBe(true);
    });

    it('holds the plant back until the cooldown has passed', () => {
        const justHarvested = econ({ harvests: { d1: now - 1000 } });
        expect(canHarvest(plant(), justHarvested, now)).toBe(false);
        expect(harvestCooldownDays(plant(), justHarvested, now)).toBe(30);

        const longAgo = econ({ harvests: { d1: now - HARVEST_COOLDOWN_MS - 1000 } });
        expect(canHarvest(plant(), longAgo, now)).toBe(true);
        expect(harvestCooldownDays(plant(), longAgo, now)).toBe(0);
    });
});

describe('MATURE_INTERVAL_DAYS', () => {
    it('follows the Anki convention of three weeks', () => {
        expect(MATURE_INTERVAL_DAYS).toBe(21);
    });
});
