// The Grove (phase 1, read-only) — every deck is a plant whose growth mirrors
// live SRS state. Everything here is derived at call time from srsData;
// nothing is stored. See docs/grove-spec.md for the full design.

import { BASE_SPECIES_COUNT, PLANT_SPECIES_COUNT, PotStyle } from '@/components/GrowingPlant';
import { TranslationKey } from '@/constants/translations';
import { Deck, ExamPlan, getDecks, getExamPlan, getGroveEconomy, getUserStats, GroveEconomy, saveGroveEconomy } from './Storage';

// A card counts as mature once its SM-2 interval reaches 21 days (Anki convention).
export const MATURE_INTERVAL_DAYS = 21;

// A plant only rests when a real backlog piles up: at least half of the
// reviewed cards due AND at least this many cards, so tiny decks don't flicker.
const REST_BACKLOG_RATIO = 0.5;
const REST_MIN_DUE = 10;

export type GroveStage = 'seed' | 'sprout' | 'sapling' | 'youngTree' | 'flourishing' | 'blossoming';

// Display text lives in constants/translations.ts; this only maps a stage to
// the key so callers do `t(STAGE_LABEL_KEYS[stage])`.
export const STAGE_LABEL_KEYS: Record<GroveStage, TranslationKey> = {
    seed: 'groveStageSeed',
    sprout: 'groveStageSprout',
    sapling: 'groveStageSapling',
    youngTree: 'groveStageYoungTree',
    flourishing: 'groveStageFlourishing',
    blossoming: 'groveStageBlossoming',
};

// How tall/blooming each stage renders. GrowingPlant swells its bud from
// progress 0.7 and opens petals from 0.86, so flourishing shows a closed bud
// and only a fully mature deck gets the open flower.
const STAGE_GROWTH: Record<GroveStage, number> = {
    seed: 0,
    sprout: 0.24,
    sapling: 0.46,
    youngTree: 0.68,
    flourishing: 0.8,
    blossoming: 1,
};

// Idle production: dew per hour by growth stage. Resting plants produce 0.
export const STAGE_DEW_RATE: Record<GroveStage, number> = {
    seed: 0,
    sprout: 2,
    sapling: 4,
    youngTree: 7,
    flourishing: 10,
    blossoming: 12,
};

// Accrual caps at 12h away so the optimal habit is opening daily
export const MAX_IDLE_HOURS = 12;

export interface GrovePlant {
    deckId: string;
    deckName: string;
    uri: string;
    species: number;      // stable plant variety, derived from the deck id
    totalCards: number;
    reviewed: number;     // cards with any SRS history
    matureCards: number;  // interval >= MATURE_INTERVAL_DAYS
    dueCards: number;
    dueIndices: number[]; // exactly which cards are due — "watering" studies these, not the whole deck
    maturity: number;     // matureCards / totalCards, 0..1
    stage: GroveStage;
    resting: boolean;     // backlog overlay — pauses production, never regresses growth
    examPlan: ExamPlan | null;
    growth: number;       // 0..1, fed straight into GrowingPlant
    potStyle: PotStyle;   // cosmetic planter, defaults to bare soil
}

// Same deck always grows the same variety, and neighbouring ids spread
// across species so a fresh import batch doesn't come up all tulips.
// Only everyday varieties are hash-assigned; rare ones need a seed.
export function speciesForDeck(deckId: string): number {
    let hash = 0;
    for (let i = 0; i < deckId.length; i++) {
        hash = (hash * 31 + deckId.charCodeAt(i)) >>> 0;
    }
    return hash % BASE_SPECIES_COUNT;
}

// Rare varieties, unlockable per deck by spending a harvested seed
export const RARE_SPECIES: number[] = Array.from(
    { length: PLANT_SPECIES_COUNT - BASE_SPECIES_COUNT },
    (_, i) => BASE_SPECIES_COUNT + i
);

export function stageForMaturity(maturity: number, reviewed: number): GroveStage {
    if (reviewed === 0) return 'seed';
    if (maturity >= 1) return 'blossoming';
    if (maturity >= 0.9) return 'flourishing';
    if (maturity >= 0.6) return 'youngTree';
    if (maturity >= 0.25) return 'sapling';
    return 'sprout';
}

export function buildGrovePlants(decks: Deck[], speciesOverrides?: Record<string, number>, planters?: Record<string, string>, now: Date = new Date()): GrovePlant[] {
    const plants: GrovePlant[] = decks
        .filter(d => d.type === 'csv' && (d.totalCards || 0) > 0)
        .map(d => {
            const total = d.totalCards || 0;
            let reviewed = 0;
            let matureCards = 0;
            const dueIndices: number[] = [];
            const srs = d.srsData || {};
            for (const key of Object.keys(srs)) {
                const data = srs[Number(key)];
                if (!data) continue;
                reviewed++;
                if (data.interval >= MATURE_INTERVAL_DAYS) matureCards++;
                if (new Date(data.nextReview) <= now) dueIndices.push(Number(key));
            }
            const dueCards = dueIndices.length;
            const maturity = total > 0 ? matureCards / total : 0;
            const stage = stageForMaturity(maturity, reviewed);
            const resting = dueCards >= REST_MIN_DUE && dueCards / Math.max(1, reviewed) >= REST_BACKLOG_RATIO;
            return {
                deckId: d.id,
                deckName: d.name,
                uri: d.uri,
                species: speciesOverrides?.[d.id] ?? speciesForDeck(d.id),
                totalCards: total,
                reviewed,
                matureCards,
                dueCards,
                dueIndices,
                maturity,
                stage,
                resting,
                examPlan: getExamPlan(d),
                growth: STAGE_GROWTH[stage],
                potStyle: (planters?.[d.id] as PotStyle) || 'classic',
            };
        });

    // Nearest exam first, then the most due work, then alphabetical
    return plants.sort((a, b) => {
        const ax = a.examPlan && a.examPlan.daysLeft >= 0 ? a.examPlan.daysLeft : Infinity;
        const bx = b.examPlan && b.examPlan.daysLeft >= 0 ? b.examPlan.daysLeft : Infinity;
        if (ax !== bx) return ax - bx;
        if (a.dueCards !== b.dueCards) return b.dueCards - a.dueCards;
        return a.deckName.localeCompare(b.deckName);
    });
}

// ---------------------------------------------------------------------------
// Idle dew accrual. Classic idle-game bookkeeping: nothing runs in the
// background — elapsed time is settled whenever the grove is opened.
// ---------------------------------------------------------------------------

export function streakMultiplier(streak: number): number {
    if (streak >= 30) return 1.5;
    if (streak >= 7) return 1.25;
    return 1;
}

export function dewRatePerHour(plants: GrovePlant[], streak: number): number {
    const base = plants.reduce((sum, p) => sum + (p.resting ? 0 : STAGE_DEW_RATE[p.stage]), 0);
    return base * streakMultiplier(streak);
}

export function pendingDew(plants: GrovePlant[], econ: GroveEconomy, streak: number, nowMs: number = Date.now()): number {
    const hours = Math.min(Math.max(0, nowMs - econ.lastCollectedAt) / 3600000, MAX_IDLE_HOURS);
    return Math.floor(hours * dewRatePerHour(plants, streak));
}

export interface CollectResult {
    collected: number;
    balance: number;
    ratePerHour: number;
    multiplier: number;
}

export async function collectDew(plants: GrovePlant[]): Promise<CollectResult> {
    const [econ, stats] = await Promise.all([getGroveEconomy(), getUserStats()]);
    const streak = stats.currentStreak || 0;
    const collected = pendingDew(plants, econ, streak);
    if (collected > 0) {
        // Fractions under one dew stay on the clock only when nothing was
        // collected; on a real collect the clock simply resets.
        econ.lastCollectedAt = Date.now();
        econ.dew += collected;
        await saveGroveEconomy(econ);
    }
    return {
        collected,
        balance: econ.dew,
        ratePerHour: dewRatePerHour(plants, streak),
        multiplier: streakMultiplier(streak),
    };
}

// ---------------------------------------------------------------------------
// Prestige: a fully blossomed deck can be harvested for a seed (once per
// 30 days per deck, so tiny decks can't be farmed). Seeds plant rare
// varieties on any deck.
// ---------------------------------------------------------------------------

export const HARVEST_COOLDOWN_MS = 30 * 24 * 3600 * 1000;

export function canHarvest(plant: GrovePlant, econ: GroveEconomy, nowMs: number = Date.now()): boolean {
    if (plant.stage !== 'blossoming') return false;
    return nowMs - (econ.harvests[plant.deckId] || 0) >= HARVEST_COOLDOWN_MS;
}

export function harvestCooldownDays(plant: GrovePlant, econ: GroveEconomy, nowMs: number = Date.now()): number {
    const readyAt = (econ.harvests[plant.deckId] || 0) + HARVEST_COOLDOWN_MS;
    return Math.max(0, Math.ceil((readyAt - nowMs) / 86400000));
}

export async function harvestPlant(plant: GrovePlant): Promise<{ ok: boolean; seeds: number }> {
    const econ = await getGroveEconomy();
    if (!canHarvest(plant, econ)) return { ok: false, seeds: econ.seeds };
    econ.harvests[plant.deckId] = Date.now();
    econ.seeds += 1;
    await saveGroveEconomy(econ);
    return { ok: true, seeds: econ.seeds };
}

export async function plantSeed(deckId: string, species: number): Promise<{ ok: boolean; seeds: number }> {
    const econ = await getGroveEconomy();
    if (econ.seeds <= 0 || !RARE_SPECIES.includes(species)) return { ok: false, seeds: econ.seeds };
    econ.seeds -= 1;
    econ.speciesOverrides[deckId] = species;
    await saveGroveEconomy(econ);
    return { ok: true, seeds: econ.seeds };
}

// ---------------------------------------------------------------------------
// Stage-up celebrations. Compares current stages against the snapshot taken
// at the previous check, updates the snapshot, and returns the decks that
// grew. The very first check just seeds the snapshot quietly.
// ---------------------------------------------------------------------------

const STAGE_ORDER: GroveStage[] = ['seed', 'sprout', 'sapling', 'youngTree', 'flourishing', 'blossoming'];

export interface StageUp {
    deckId: string;
    deckName: string;
    stage: GroveStage;
    species: number;
    growth: number;
}

export async function detectStageUps(): Promise<StageUp[]> {
    const [decks, econ] = await Promise.all([getDecks(), getGroveEconomy()]);
    const plants = buildGrovePlants(decks, econ.speciesOverrides, econ.planters);

    const firstRun = Object.keys(econ.lastStages).length === 0;
    const ups: StageUp[] = [];
    const nextSnapshot: Record<string, string> = {};
    let changed = firstRun && plants.length > 0;

    for (const p of plants) {
        nextSnapshot[p.deckId] = p.stage;
        const prev = econ.lastStages[p.deckId];
        if (prev === undefined) {
            changed = changed || !firstRun;
            continue; // new plant — nothing to celebrate yet
        }
        if (prev !== p.stage) {
            changed = true;
            const prevIdx = STAGE_ORDER.indexOf(prev as GroveStage);
            const currIdx = STAGE_ORDER.indexOf(p.stage);
            if (currIdx > prevIdx) {
                ups.push({ deckId: p.deckId, deckName: p.deckName, stage: p.stage, species: p.species, growth: p.growth });
            }
        }
    }
    if (Object.keys(econ.lastStages).length !== plants.length) changed = true;

    if (changed) {
        econ.lastStages = nextSnapshot;
        await saveGroveEconomy(econ);
    }
    return firstRun ? [] : ups;
}
