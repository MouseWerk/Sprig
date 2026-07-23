import { TranslationKey } from '@/constants/translations';
import * as FileSystem from 'expo-file-system/legacy';
import { ACHIEVEMENTS, AchievementDef, evaluateAchievements } from './Achievements';
import { parseFlashcardsCsv, repairMispairedArrowCards } from './CsvParser';
import { getDb } from './Database';
import { levelForXp, rankForLevel, xpForGrade } from './Levels';

export type DeckType = 'csv' | 'pdf';

// Timestamp-based but collision-safe, so batch imports in a tight loop
// never produce duplicate ids (plain Date.now() can repeat within 1ms).
function generateId(): string {
    return `${Date.now()}${Math.floor(Math.random() * 1e6).toString().padStart(6, '0')}`;
}
export type StudyDirection = 'normal' | 'reversed' | 'mixed';

export interface SRSCardData {
    interval: number;    // days
    repetition: number;  // count of successful reviews
    easeFactor: number;  // 1.3 to 2.5+
    nextReview: string;  // ISO date
}

export interface Deck {
    id: string;
    name: string;
    uri: string;
    icon: string;
    type: 'csv' | 'pdf';
    learnedIndices?: number[]; // Legacy, kept for compatibility
    unsureIndices?: number[];  // Legacy, kept for compatibility
    totalCards?: number;
    folderId: string | null;
    srsData?: Record<number, SRSCardData>; // index -> SRS metadata
    studyDirection?: StudyDirection; // which side of the card is shown first
    createdAt?: number; // epoch ms; older items fall back to parsing their id
    examDate?: string; // "YYYY-MM-DD" — exam countdown target for this deck
}

export interface AudioFile {
    id: string;
    name: string;
    uri: string;
    duration?: number;
    folderId?: string | null;
    position?: number; // last playback position in seconds, for resume
}

// Each area keeps its own folder namespace — a folder created for PDFs
// never shows up between flashcard decks and vice versa.
export type FolderKind = 'deck' | 'pdf' | 'audio';

export interface Folder {
    id: string;
    name: string;
    parentId: string | null; // ID of the parent folder for subfolders
    createdAt?: number; // epoch ms; older items fall back to parsing their id
    kind?: FolderKind;
}

export interface UserStats {
    totalCardsReviewed: number;
    totalStudyTime: number; // in seconds
    lastStudyDate: string; // ISO date
    currentStreak: number; // days
    longestStreak: number; // days
    achievements: string[];
    dailyReviews?: Record<string, number>; // "YYYY-MM-DD" -> cards reviewed that day
    totalXp?: number; // lifetime experience points
    streakFreezes?: number; // banked freezes that auto-repair a missed day
    focusSessions?: number; // completed focus (plant) sessions
    quizzesCompleted?: number; // finished quiz rounds
}

// Max freezes a user can bank at once
export const MAX_STREAK_FREEZES = 3;

export interface StatsUpdateResult {
    newAchievements: AchievementDef[];
    leveledUp: boolean;
    newLevel: number;
    newRank: string;
    xpGained: number;
    freezeUsed: boolean;   // a banked freeze repaired a missed day
    freezeEarned: boolean; // a new freeze was banked this update
    streakFreezes: number; // freezes remaining after this update
    dewEarned: number;     // grove dew dripped by this review
    boostActive: boolean;  // a sunshine boost doubled the XP
}

// ---------------------------------------------------------------------------
// Grove economy — the idle-game layer (see docs/grove-spec.md). Dew accrues
// while away (accrual math lives in utils/Grove.ts), drips from reviews here,
// and is spent on streak freezes and sunshine boosts.
// ---------------------------------------------------------------------------

export const DEW_BURST_DAILY_CAP = 100;   // max dew from reviews per day
export const DEW_COST_FREEZE = 1500;
export const DEW_COST_SUNSHINE = 400;
export const SUNSHINE_DURATION_MS = 30 * 60 * 1000; // 2x XP window

// Cosmetic shop (phase 4 — collection layer). Planters are per-deck; a deck
// with no entry renders bare soil ('classic', free). Decorations are
// grove-wide and stack — any number of owned decorations can be shown at
// once (see equippedDecorations below), so the shelf builds up over time
// instead of each purchase replacing the last.
export const POT_PRICES: Record<string, number> = {
    terracotta: 250,
    woven: 350,
    bowl: 400,
    barrel: 600,
    hex: 700,
    urn: 900,
    scalloped: 1000,
};

export interface DecorationDef {
    id: string;
    nameKey: TranslationKey;
    price: number;
}

export const DECORATION_CATALOG: DecorationDef[] = [
    { id: 'stones', nameKey: 'decorationStones', price: 500 },
    { id: 'pathway', nameKey: 'decorationPathway', price: 800 },
    { id: 'hedge', nameKey: 'decorationHedge', price: 1200 },
    { id: 'lanterns', nameKey: 'decorationLanterns', price: 1500 },
    { id: 'trellis', nameKey: 'decorationTrellis', price: 2200 },
    { id: 'fence', nameKey: 'decorationFence', price: 3000 },
];

export interface GroveEconomy {
    dew: number;
    lastCollectedAt: number; // epoch ms; idle accrual is computed from here
    burstDate: string;       // "YYYY-MM-DD" the burst counter belongs to
    burstDewToday: number;
    boostUntil: number;      // epoch ms; XP is doubled while now < boostUntil
    seeds: number;                            // harvested from blossoming decks
    harvests: Record<string, number>;         // deckId -> last harvest epoch ms
    speciesOverrides: Record<string, number>; // deckId -> rare species planted with a seed
    lastStages: Record<string, string>;       // deckId -> stage at last check, for grow celebrations
    planters: Record<string, string>;         // deckId -> owned pot style id
    ownedDecorations: string[];               // purchased grove-wide decoration ids
    equippedDecorations: string[];            // owned decorations currently shown, any number at once
}

export async function getGroveEconomy(): Promise<GroveEconomy> {
    try {
        const db = await getDb();
        const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', 'grove');
        if (row) {
            const parsed = JSON.parse(row.value);
            return {
                dew: parsed.dew || 0,
                lastCollectedAt: parsed.lastCollectedAt || Date.now(),
                burstDate: parsed.burstDate || '',
                burstDewToday: parsed.burstDewToday || 0,
                boostUntil: parsed.boostUntil || 0,
                seeds: parsed.seeds || 0,
                harvests: parsed.harvests || {},
                speciesOverrides: parsed.speciesOverrides || {},
                lastStages: parsed.lastStages || {},
                planters: parsed.planters || {},
                ownedDecorations: parsed.ownedDecorations || [],
                // Migrates the old single-slot field (a decoration id or null)
                // into the new array so existing users keep their shelf.
                equippedDecorations: Array.isArray(parsed.equippedDecorations)
                    ? parsed.equippedDecorations
                    : (parsed.equippedDecoration ? [parsed.equippedDecoration] : []),
            };
        }
    } catch (e) {
        console.error('Error getting grove economy', e);
    }
    // First run: persist immediately so the accrual clock survives restarts
    const fresh: GroveEconomy = {
        dew: 0,
        lastCollectedAt: Date.now(),
        burstDate: new Date().toISOString().split('T')[0],
        burstDewToday: 0,
        boostUntil: 0,
        seeds: 0,
        harvests: {},
        speciesOverrides: {},
        lastStages: {},
        planters: {},
        ownedDecorations: [],
        equippedDecorations: [],
    };
    await saveGroveEconomy(fresh).catch(() => { });
    return fresh;
}

export async function saveGroveEconomy(econ: GroveEconomy): Promise<void> {
    const db = await getDb();
    await db.runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', 'grove', JSON.stringify(econ));
}

export type PurchaseFailure = 'dew' | 'max' | 'active';

export async function buyStreakFreezeWithDew(): Promise<{ ok: boolean; reason?: PurchaseFailure; dew: number; streakFreezes: number }> {
    const [econ, stats] = await Promise.all([getGroveEconomy(), getUserStats()]);
    const owned = stats.streakFreezes || 0;
    if (owned >= MAX_STREAK_FREEZES) return { ok: false, reason: 'max', dew: econ.dew, streakFreezes: owned };
    if (econ.dew < DEW_COST_FREEZE) return { ok: false, reason: 'dew', dew: econ.dew, streakFreezes: owned };
    econ.dew -= DEW_COST_FREEZE;
    stats.streakFreezes = owned + 1;
    await Promise.all([saveGroveEconomy(econ), saveUserStats(stats)]);
    return { ok: true, dew: econ.dew, streakFreezes: stats.streakFreezes };
}

export async function buySunshineBoost(): Promise<{ ok: boolean; reason?: PurchaseFailure; dew: number; boostUntil: number }> {
    const econ = await getGroveEconomy();
    const now = Date.now();
    if (now < econ.boostUntil) return { ok: false, reason: 'active', dew: econ.dew, boostUntil: econ.boostUntil };
    if (econ.dew < DEW_COST_SUNSHINE) return { ok: false, reason: 'dew', dew: econ.dew, boostUntil: econ.boostUntil };
    econ.dew -= DEW_COST_SUNSHINE;
    econ.boostUntil = now + SUNSHINE_DURATION_MS;
    await saveGroveEconomy(econ);
    return { ok: true, dew: econ.dew, boostUntil: econ.boostUntil };
}

// Buying a planter both purchases and assigns it in one step — pots are a
// per-deck choice, not a shared inventory, so there's nothing to "equip"
// later. Re-buying a style you already own on another deck is still full
// price; each deck's pot is its own purchase.
export async function buyPlanter(deckId: string, potId: string): Promise<{ ok: boolean; reason?: PurchaseFailure; dew: number; planters: Record<string, string> }> {
    const econ = await getGroveEconomy();
    const price = POT_PRICES[potId] || 0;
    if (econ.dew < price) return { ok: false, reason: 'dew', dew: econ.dew, planters: econ.planters };
    econ.dew -= price;
    econ.planters = { ...econ.planters, [deckId]: potId };
    await saveGroveEconomy(econ);
    return { ok: true, dew: econ.dew, planters: econ.planters };
}

export async function buyDecoration(decorationId: string): Promise<{ ok: boolean; reason?: PurchaseFailure; dew: number; ownedDecorations: string[] }> {
    const econ = await getGroveEconomy();
    if (econ.ownedDecorations.includes(decorationId)) return { ok: false, reason: 'max', dew: econ.dew, ownedDecorations: econ.ownedDecorations };
    const price = DECORATION_CATALOG.find(d => d.id === decorationId)?.price || 0;
    if (econ.dew < price) return { ok: false, reason: 'dew', dew: econ.dew, ownedDecorations: econ.ownedDecorations };
    econ.dew -= price;
    econ.ownedDecorations = [...econ.ownedDecorations, decorationId];
    econ.equippedDecorations = [...econ.equippedDecorations, decorationId];
    await saveGroveEconomy(econ);
    return { ok: true, dew: econ.dew, ownedDecorations: econ.ownedDecorations };
}

// Toggles one owned decoration's visibility on the shelf — free, since the
// dew was already spent to unlock it. Any number can be shown at once.
export async function equipDecoration(decorationId: string): Promise<GroveEconomy> {
    const econ = await getGroveEconomy();
    if (econ.ownedDecorations.includes(decorationId)) {
        econ.equippedDecorations = econ.equippedDecorations.includes(decorationId)
            ? econ.equippedDecorations.filter(id => id !== decorationId)
            : [...econ.equippedDecorations, decorationId];
    }
    await saveGroveEconomy(econ);
    return econ;
}

// Whole days between two "YYYY-MM-DD" strings (b - a)
function daysBetweenDateKeys(a: string, b: string): number {
    const da = Date.parse(a + 'T00:00:00Z');
    const db = Date.parse(b + 'T00:00:00Z');
    if (isNaN(da) || isNaN(db)) return NaN;
    return Math.round((db - da) / 86400000);
}

// Serialize write transactions: expo-sqlite shares one connection, so two
// overlapping BEGIN/COMMIT blocks from concurrent async calls would collide.
let writeChain: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
    const run = writeChain.then(fn, fn);
    writeChain = run.catch(() => { });
    return run;
}

interface DeckRow {
    id: string;
    name: string;
    uri: string;
    icon: string;
    type: string;
    total_cards: number;
    folder_id: string | null;
    study_direction: string | null;
    learned_indices: string;
    unsure_indices: string;
    created_at: number | null;
    exam_date: string | null;
}

interface SrsRow {
    deck_id: string;
    card_index: number;
    interval: number;
    repetition: number;
    ease_factor: number;
    next_review: string;
}

function parseIndices(json: string): number[] {
    try {
        const arr = JSON.parse(json);
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function rowToDeck(row: DeckRow, srs: Record<number, SRSCardData>): Deck {
    return {
        id: row.id,
        name: row.name,
        uri: row.uri,
        icon: row.icon,
        type: row.type === 'pdf' ? 'pdf' : 'csv',
        learnedIndices: parseIndices(row.learned_indices),
        unsureIndices: parseIndices(row.unsure_indices),
        totalCards: row.total_cards,
        folderId: row.folder_id,
        srsData: srs,
        studyDirection: (row.study_direction as StudyDirection) ?? undefined,
        createdAt: row.created_at ?? undefined,
        examDate: row.exam_date ?? undefined,
    };
}

async function getSrsForDeck(deckId: string): Promise<Record<number, SRSCardData>> {
    const db = await getDb();
    const rows = await db.getAllAsync<SrsRow>('SELECT * FROM srs WHERE deck_id = ?', deckId);
    const map: Record<number, SRSCardData> = {};
    for (const r of rows) {
        map[r.card_index] = {
            interval: r.interval,
            repetition: r.repetition,
            easeFactor: r.ease_factor,
            nextReview: r.next_review,
        };
    }
    return map;
}

export async function getDecks(): Promise<Deck[]> {
    try {
        const db = await getDb();
        const [deckRows, srsRows] = await Promise.all([
            db.getAllAsync<DeckRow>(
                'SELECT * FROM decks ORDER BY COALESCE(created_at, CAST(id AS INTEGER)) DESC'
            ),
            db.getAllAsync<SrsRow>('SELECT * FROM srs'),
        ]);
        const srsByDeck: Record<string, Record<number, SRSCardData>> = {};
        for (const r of srsRows) {
            (srsByDeck[r.deck_id] ??= {})[r.card_index] = {
                interval: r.interval,
                repetition: r.repetition,
                easeFactor: r.ease_factor,
                nextReview: r.next_review,
            };
        }
        return deckRows.map(row => rowToDeck(row, srsByDeck[row.id] ?? {}));
    } catch (e) {
        console.error('Error getting decks', e);
        return [];
    }
}

async function insertDeckRow(deck: Deck): Promise<void> {
    const db = await getDb();
    await db.runAsync(
        `INSERT OR REPLACE INTO decks (id, name, uri, icon, type, total_cards, folder_id, study_direction, learned_indices, unsure_indices, created_at, exam_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        deck.id, deck.name, deck.uri, deck.icon, deck.type,
        deck.totalCards ?? 0, deck.folderId, deck.studyDirection ?? null,
        JSON.stringify(deck.learnedIndices ?? []), JSON.stringify(deck.unsureIndices ?? []),
        deck.createdAt ?? null, deck.examDate ?? null
    );
}

export async function saveDeck(name: string, sourceUri: string, icon: string, type: DeckType, totalCards?: number, folderId: string | null = null): Promise<Deck> {
    const id = generateId();
    const fileExtension = type === 'csv' ? 'csv' : 'pdf';
    const localUri = `${FileSystem.documentDirectory}decks/${id}.${fileExtension}`;

    const dirInfo = await FileSystem.getInfoAsync(`${FileSystem.documentDirectory}decks/`);
    if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}decks/`, { intermediates: true });
    }

    await FileSystem.copyAsync({ from: sourceUri, to: localUri });

    const newDeck: Deck = {
        id,
        name,
        icon,
        uri: localUri,
        type,
        learnedIndices: [],
        unsureIndices: [],
        totalCards: totalCards || 0,
        folderId,
        createdAt: Date.now(),
    };

    await insertDeckRow(newDeck);
    return newDeck;
}

export async function createEmptyDeck(name: string, icon: string, folderId: string | null = null): Promise<Deck> {
    const id = generateId();
    const localUri = `${FileSystem.documentDirectory}decks/${id}.csv`;

    const dirInfo = await FileSystem.getInfoAsync(`${FileSystem.documentDirectory}decks/`);
    if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}decks/`, { intermediates: true });
    }

    // Create a dummy empty file or just the header
    await FileSystem.writeAsStringAsync(localUri, "Question,Answer");

    const newDeck: Deck = {
        id,
        name,
        icon,
        uri: localUri,
        type: 'csv',
        learnedIndices: [],
        unsureIndices: [],
        totalCards: 0,
        folderId,
        createdAt: Date.now(),
    };

    await insertDeckRow(newDeck);
    return newDeck;
}

const escapeCsv = (text: string) => `"${text.replace(/"/g, '""')}"`;

function cardsToCsv(cards: { question: string; answer: string }[]): string {
    return cards.map(c => `${escapeCsv(c.question)},${escapeCsv(c.answer)}`).join('\n');
}

// Create a deck pre-filled with already-parsed cards (e.g. an Anki import) —
// writes the CSV, primes the card cache and sets the count in one go.
export async function createDeckWithCards(
    name: string,
    icon: string,
    folderId: string | null,
    cards: { question: string; answer: string }[]
): Promise<Deck> {
    const deck = await createEmptyDeck(name, icon, folderId);
    await FileSystem.writeAsStringAsync(deck.uri, cardsToCsv(cards));
    await replaceCardCache(deck.id, cards);
    const db = await getDb();
    await db.runAsync('UPDATE decks SET total_cards = ? WHERE id = ?', cards.length, deck.id);
    return { ...deck, totalCards: cards.length };
}

// Replace a deck's cached cards with a fresh set, inside one transaction
async function replaceCardCache(deckId: string, cards: { question: string; answer: string }[]): Promise<void> {
    const db = await getDb();
    await serialized(() =>
        db.withTransactionAsync(async () => {
            await db.runAsync('DELETE FROM cards_cache WHERE deck_id = ?', deckId);
            for (let i = 0; i < cards.length; i++) {
                await db.runAsync(
                    'INSERT INTO cards_cache (deck_id, card_index, question, answer) VALUES (?, ?, ?, ?)',
                    deckId, i, cards[i].question, cards[i].answer
                );
            }
        })
    );
}

export async function importCsvToDeck(deckId: string, sourceUri: string): Promise<void> {
    const db = await getDb();
    const deck = await db.getFirstAsync<DeckRow>('SELECT * FROM decks WHERE id = ?', deckId);
    if (!deck) throw new Error('Deck not found');

    const newCards = await parseFlashcardsCsv(sourceUri);
    if (!newCards || newCards.length === 0) return;

    // On a cache miss, fall back to parsing the deck file itself so
    // existing cards are never lost when the cache has been cleared.
    let existingCards = await getCachedData<any[]>(deckId);
    if (!existingCards) {
        existingCards = await parseFlashcardsCsv(deck.uri);
    }
    const combinedCards = [...existingCards, ...newCards];

    await FileSystem.writeAsStringAsync(deck.uri, cardsToCsv(combinedCards));
    await replaceCardCache(deckId, combinedCards);
    await db.runAsync('UPDATE decks SET total_cards = ? WHERE id = ?', combinedCards.length, deckId);
}

export async function updateDeckProgress(id: string, learnedIndices: number[], unsureIndices: number[]): Promise<void> {
    const db = await getDb();
    await db.runAsync(
        'UPDATE decks SET learned_indices = ?, unsure_indices = ? WHERE id = ?',
        JSON.stringify(learnedIndices), JSON.stringify(unsureIndices), id
    );
}

export async function deleteDeck(id: string): Promise<void> {
    const db = await getDb();
    const deck = await db.getFirstAsync<DeckRow>('SELECT * FROM decks WHERE id = ?', id);

    if (deck) {
        try {
            await FileSystem.deleteAsync(deck.uri, { idempotent: true });
        } catch (e) {
            console.warn('Could not delete deck file', e);
        }
    }

    await serialized(() =>
        db.withTransactionAsync(async () => {
            await db.runAsync('DELETE FROM decks WHERE id = ?', id);
            await db.runAsync('DELETE FROM srs WHERE deck_id = ?', id);
            await db.runAsync('DELETE FROM cards_cache WHERE deck_id = ?', id);
            await db.runAsync('DELETE FROM pdf_progress WHERE deck_id = ?', id);
            await db.runAsync('DELETE FROM confusions WHERE deck_id = ?', id);
        })
    );
}

// PDF reading progress: remember the last page viewed per document so the
// viewer can resume where the user left off.
export async function getPdfPage(id: string): Promise<number> {
    try {
        const db = await getDb();
        const row = await db.getFirstAsync<{ page: number }>('SELECT page FROM pdf_progress WHERE deck_id = ?', id);
        return row && row.page > 0 ? row.page : 1;
    } catch {
        return 1;
    }
}

export async function setPdfPage(id: string, page: number, total?: number): Promise<void> {
    try {
        const db = await getDb();
        // COALESCE keeps a previously stored page count when a save happens
        // before the document finished loading.
        await db.runAsync(
            `INSERT INTO pdf_progress (deck_id, page, total, last_read_at) VALUES (?, ?, ?, ?)
             ON CONFLICT(deck_id) DO UPDATE SET
                page = excluded.page,
                total = COALESCE(excluded.total, pdf_progress.total),
                last_read_at = excluded.last_read_at`,
            id, Math.round(page), total && total > 0 ? Math.round(total) : null, Date.now()
        );
    } catch (e) {
        console.error('Error saving PDF page', e);
    }
}

export interface PdfProgress {
    page: number;
    total: number | null;
    lastReadAt: number | null;
}

// Per-document reading progress for the library list ("62%", continue reading)
export async function getAllPdfProgress(): Promise<Record<string, PdfProgress>> {
    try {
        const db = await getDb();
        const rows = await db.getAllAsync<{ deck_id: string; page: number; total: number | null; last_read_at: number | null }>(
            'SELECT * FROM pdf_progress'
        );
        const map: Record<string, PdfProgress> = {};
        for (const r of rows) {
            map[r.deck_id] = { page: r.page, total: r.total ?? null, lastReadAt: r.last_read_at ?? null };
        }
        return map;
    } catch {
        return {};
    }
}

// Full progress map, used by backup
export async function getPdfProgressMap(): Promise<Record<string, number>> {
    try {
        const db = await getDb();
        const rows = await db.getAllAsync<{ deck_id: string; page: number }>('SELECT * FROM pdf_progress');
        const map: Record<string, number> = {};
        for (const r of rows) map[r.deck_id] = r.page;
        return map;
    } catch {
        return {};
    }
}

// Fill gaps from a restored backup; pages already tracked locally win
export async function mergePdfProgress(incoming: Record<string, number>): Promise<void> {
    const db = await getDb();
    for (const [deckId, page] of Object.entries(incoming || {})) {
        if (typeof page !== 'number' || page <= 0) continue;
        await db.runAsync('INSERT OR IGNORE INTO pdf_progress (deck_id, page) VALUES (?, ?)', deckId, Math.round(page));
    }
}

// Parsed-card cache. Rows live in SQLite so single-card edits no longer
// serialize a whole deck's JSON blob.
export async function getCachedData<T>(id: string): Promise<T | null> {
    try {
        const db = await getDb();
        const rows = await db.getAllAsync<{ question: string; answer: string }>(
            'SELECT question, answer FROM cards_cache WHERE deck_id = ? ORDER BY card_index ASC', id
        );
        if (rows.length === 0) return null;
        const cards = rows.map(r => ({ question: r.question, answer: r.answer }));

        // Self-heal decks imported before arrow-separator support: their
        // cached cards hold two "q -> a" lines each. Re-split them and
        // persist the fix so every study mode sees the intended cards.
        const repaired = repairMispairedArrowCards(cards);
        if (repaired) {
            await persistRepairedDeck(id, repaired);
            return repaired as unknown as T;
        }
        return cards as unknown as T;
    } catch {
        return null;
    }
}

// Write a repaired card set back to cache + CSV and drop progress tracking,
// which indexed the old broken cards and no longer lines up.
async function persistRepairedDeck(deckId: string, cards: { question: string; answer: string }[]): Promise<void> {
    const db = await getDb();
    await replaceCardCache(deckId, cards);
    const deck = await db.getFirstAsync<DeckRow>('SELECT * FROM decks WHERE id = ?', deckId);
    if (!deck) return;
    try {
        await FileSystem.writeAsStringAsync(deck.uri, cardsToCsv(cards));
    } catch (e) {
        console.warn('Could not rewrite repaired deck CSV', e);
    }
    await db.runAsync(
        "UPDATE decks SET total_cards = ?, learned_indices = '[]', unsure_indices = '[]' WHERE id = ?",
        cards.length, deckId
    );
    await db.runAsync('DELETE FROM srs WHERE deck_id = ?', deckId);
    await db.runAsync('DELETE FROM confusions WHERE deck_id = ?', deckId);
}

export async function setCachedData<T>(id: string, data: T): Promise<void> {
    try {
        if (!Array.isArray(data)) return;
        await replaceCardCache(id, data as { question: string; answer: string }[]);
    } catch (e) {
        console.error('Error caching data', e);
    }
}

// Drop every deck's parsed-card cache (Settings > Clear Cache)
export async function clearCardCache(): Promise<void> {
    const db = await getDb();
    await db.runAsync('DELETE FROM cards_cache');
}

// User Stats Functions

export async function getUserStats(): Promise<UserStats> {
    try {
        const db = await getDb();
        const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', 'stats');
        if (row) {
            return JSON.parse(row.value);
        }
    } catch (e) {
        console.error('Error getting stats', e);
    }
    return {
        totalCardsReviewed: 0,
        totalStudyTime: 0,
        lastStudyDate: '',
        currentStreak: 0,
        longestStreak: 0,
        achievements: [],
        totalXp: 0,
        streakFreezes: 0,
        focusSessions: 0,
        quizzesCompleted: 0,
    };
}

export async function saveUserStats(stats: UserStats): Promise<void> {
    const db = await getDb();
    await db.runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', 'stats', JSON.stringify(stats));
}

// Applies a review to lifetime stats. Returns the newly-unlocked achievements
// and any level-up so the UI can celebrate them. Pass the SM-2 grade so XP
// can scale with how well the card went; pass bonusXp for non-card activity
// (e.g. a completed focus session).
export async function updateUserStats(
    cardsReviewed: number,
    studyTime: number,
    grade?: number,
    bonusXp: number = 0,
    activity?: { focusSession?: boolean; quizCompleted?: boolean }
): Promise<StatsUpdateResult> {
    const stats = await getUserStats();
    const today = new Date().toISOString().split('T')[0];
    const lastStudy = stats.lastStudyDate.split('T')[0];

    const prevXp = stats.totalXp || 0;
    const prevLevel = levelForXp(prevXp);
    const baseXp = (grade !== undefined ? xpForGrade(grade) * Math.max(1, cardsReviewed) : 0) + Math.max(0, Math.round(bonusXp));

    // Grove economy: an active sunshine boost doubles XP, and card reviews
    // drip dew into the balance (capped per day so grinding can't farm it)
    const groveEcon = await getGroveEconomy();
    const boostActive = Date.now() < groveEcon.boostUntil;
    const xpGained = boostActive ? baseXp * 2 : baseXp;
    let dewEarned = 0;
    if (cardsReviewed > 0) {
        if (groveEcon.burstDate !== today) {
            groveEcon.burstDate = today;
            groveEcon.burstDewToday = 0;
        }
        dewEarned = Math.max(0, Math.min(cardsReviewed, DEW_BURST_DAILY_CAP - groveEcon.burstDewToday));
        if (dewEarned > 0) {
            groveEcon.burstDewToday += dewEarned;
            groveEcon.dew += dewEarned;
            await saveGroveEconomy(groveEcon).catch(() => { });
        }
    }

    stats.totalCardsReviewed += cardsReviewed;
    stats.totalStudyTime += studyTime;
    if (activity?.focusSession) stats.focusSessions = (stats.focusSessions || 0) + 1;
    if (activity?.quizCompleted) stats.quizzesCompleted = (stats.quizzesCompleted || 0) + 1;

    // Per-day counts for the activity heatmap, pruned to roughly a year.
    // Only card reviews contribute to the daily count/goal.
    if (!stats.dailyReviews) stats.dailyReviews = {};
    if (cardsReviewed > 0) {
        stats.dailyReviews[today] = (stats.dailyReviews[today] || 0) + cardsReviewed;
    }
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 370);
    const cutoffKey = cutoff.toISOString().split('T')[0];
    for (const key of Object.keys(stats.dailyReviews)) {
        if (key < cutoffKey) delete stats.dailyReviews[key];
    }

    // Calculate streak, using a banked freeze to repair a single missed day
    let freezeUsed = false;
    let freezeEarned = false;
    if (stats.streakFreezes === undefined) stats.streakFreezes = 0;

    if (lastStudy !== today) {
        if (lastStudy === '') {
            stats.currentStreak = 1;
        } else {
            const gap = daysBetweenDateKeys(lastStudy, today);
            if (gap === 1) {
                // Studied yesterday — streak continues
                stats.currentStreak += 1;
            } else if (gap === 2 && stats.streakFreezes > 0) {
                // Missed exactly one day — spend a freeze to keep the streak
                stats.streakFreezes -= 1;
                stats.currentStreak += 1;
                freezeUsed = true;
            } else {
                // Missed too many days (or no freeze) — streak resets
                stats.currentStreak = 1;
            }
        }

        if (stats.currentStreak > stats.longestStreak) {
            stats.longestStreak = stats.currentStreak;
        }

        // Bank a freeze each time a fresh 7-day milestone is reached
        if (stats.currentStreak > 0 && stats.currentStreak % 7 === 0 && stats.streakFreezes < MAX_STREAK_FREEZES) {
            stats.streakFreezes += 1;
            freezeEarned = true;
        }
    }

    stats.lastStudyDate = new Date().toISOString();

    // Award XP and detect a level-up
    stats.totalXp = prevXp + xpGained;
    const newLevel = levelForXp(stats.totalXp);
    const leveledUp = newLevel > prevLevel;

    // Recompute achievements from the full catalog and flag new unlocks
    const previouslyUnlocked = new Set(stats.achievements);
    const unlockedIds = evaluateAchievements(stats);
    stats.achievements = Array.from(new Set([...stats.achievements, ...unlockedIds]));
    const newlyUnlocked = ACHIEVEMENTS.filter(
        a => unlockedIds.includes(a.id) && !previouslyUnlocked.has(a.id)
    );

    await saveUserStats(stats);
    return {
        newAchievements: newlyUnlocked,
        leveledUp,
        newLevel,
        newRank: rankForLevel(newLevel),
        xpGained,
        freezeUsed,
        freezeEarned,
        streakFreezes: stats.streakFreezes,
        dewEarned,
        boostActive,
    };
}

// Records a completed Pomodoro-style focus session: counts as study time,
// keeps the streak alive, and awards XP scaled to the minutes focused.
export async function recordFocusSession(minutes: number): Promise<StatsUpdateResult> {
    const safeMinutes = Math.max(1, Math.round(minutes));
    return updateUserStats(0, safeMinutes * 60, undefined, safeMinutes * 4, { focusSession: true });
}

// Records a finished quiz round (any score) with a small XP bonus.
export async function recordQuizCompleted(): Promise<StatsUpdateResult> {
    return updateUserStats(0, 0, undefined, 10, { quizCompleted: true });
}

// Folder Management
export async function getFolders(kind?: FolderKind): Promise<Folder[]> {
    try {
        const db = await getDb();
        const rows = kind
            ? await db.getAllAsync<{ id: string; name: string; parent_id: string | null; created_at: number | null; kind: string | null }>(
                'SELECT * FROM folders WHERE kind = ? ORDER BY COALESCE(created_at, CAST(id AS INTEGER)) ASC', kind
            )
            : await db.getAllAsync<{ id: string; name: string; parent_id: string | null; created_at: number | null; kind: string | null }>(
                'SELECT * FROM folders ORDER BY COALESCE(created_at, CAST(id AS INTEGER)) ASC'
            );
        return rows.map(r => ({
            id: r.id,
            name: r.name,
            parentId: r.parent_id,
            createdAt: r.created_at ?? undefined,
            kind: (r.kind as FolderKind) ?? 'deck',
        }));
    } catch (e) {
        console.error('Error getting folders', e);
        return [];
    }
}

export async function saveFolder(name: string, parentId: string | null = null, kind: FolderKind = 'deck'): Promise<Folder> {
    const newFolder: Folder = {
        id: generateId(),
        name,
        parentId,
        createdAt: Date.now(),
        kind,
    };

    const db = await getDb();
    await db.runAsync(
        'INSERT INTO folders (id, name, parent_id, created_at, kind) VALUES (?, ?, ?, ?, ?)',
        newFolder.id, newFolder.name, newFolder.parentId, newFolder.createdAt ?? null, kind
    );
    return newFolder;
}

export async function deleteFolder(id: string): Promise<void> {
    const db = await getDb();
    await serialized(() =>
        db.withTransactionAsync(async () => {
            await db.runAsync('DELETE FROM folders WHERE id = ?', id);
            // Move child folders and contents of this folder to root
            await db.runAsync('UPDATE folders SET parent_id = NULL WHERE parent_id = ?', id);
            await db.runAsync('UPDATE decks SET folder_id = NULL WHERE folder_id = ?', id);
            await db.runAsync('UPDATE audio_files SET folder_id = NULL WHERE folder_id = ?', id);
        })
    );
}

export async function moveDeckToFolder(deckId: string, folderId: string | null): Promise<void> {
    const db = await getDb();
    await db.runAsync('UPDATE decks SET folder_id = ? WHERE id = ?', folderId, deckId);
}

export async function updateFolder(folderId: string, name?: string, parentId?: string | null): Promise<void> {
    const db = await getDb();
    if (name !== undefined) await db.runAsync('UPDATE folders SET name = ? WHERE id = ?', name, folderId);
    // parentId: undefined = leave unchanged, null = move to root
    if (parentId !== undefined) await db.runAsync('UPDATE folders SET parent_id = ? WHERE id = ?', parentId, folderId);
}

export async function updateDeck(deckId: string, name?: string, icon?: string, folderId?: string | null): Promise<void> {
    const db = await getDb();
    if (name !== undefined) await db.runAsync('UPDATE decks SET name = ? WHERE id = ?', name, deckId);
    if (icon !== undefined) await db.runAsync('UPDATE decks SET icon = ? WHERE id = ?', icon, deckId);
    // folderId: undefined = leave unchanged, null = move to root
    if (folderId !== undefined) await db.runAsync('UPDATE decks SET folder_id = ? WHERE id = ?', folderId, deckId);
}

export async function addCardToDeck(deckId: string, question: string, answer: string): Promise<void> {
    const db = await getDb();
    const deck = await db.getFirstAsync<DeckRow>('SELECT * FROM decks WHERE id = ?', deckId);
    if (!deck) return;

    // 1. Append to the CSV file on disk
    const newRow = `\n${escapeCsv(question)},${escapeCsv(answer)}`;
    try {
        await FileSystem.writeAsStringAsync(deck.uri, (await FileSystem.readAsStringAsync(deck.uri)) + newRow);
    } catch (e) {
        console.error('Error writing to CSV', e);
    }

    // 2. Append to the cache, if the deck is cached
    const countRow = await db.getFirstAsync<{ n: number }>(
        'SELECT COUNT(*) AS n FROM cards_cache WHERE deck_id = ?', deckId
    );
    if (countRow && countRow.n > 0) {
        await db.runAsync(
            'INSERT INTO cards_cache (deck_id, card_index, question, answer) VALUES (?, ?, ?, ?)',
            deckId, countRow.n, question, answer
        );
    }

    // 3. Bump the card count
    await db.runAsync('UPDATE decks SET total_cards = total_cards + 1 WHERE id = ?', deckId);
}

export async function updateCardInDeck(deckId: string, cardIndex: number, updatedCard: { question: string, answer: string }): Promise<void> {
    const db = await getDb();
    const deck = await db.getFirstAsync<DeckRow>('SELECT * FROM decks WHERE id = ?', deckId);
    if (!deck) return;

    // 1. Update the single cached row (bail if the deck isn't cached —
    //    without the cache we can't safely rebuild the CSV)
    const result = await db.runAsync(
        'UPDATE cards_cache SET question = ?, answer = ? WHERE deck_id = ? AND card_index = ?',
        updatedCard.question, updatedCard.answer, deckId, cardIndex
    );
    if (result.changes === 0) return;

    // 2. Rewrite the CSV file from the cache
    const cards = await getCachedData<{ question: string; answer: string }[]>(deckId);
    if (!cards) return;
    try {
        await FileSystem.writeAsStringAsync(deck.uri, cardsToCsv(cards));
    } catch (e) {
        console.error('Error rewriting CSV', e);
    }
}

export async function deleteCardFromDeck(deckId: string, cardIndex: number): Promise<void> {
    const db = await getDb();
    const deck = await db.getFirstAsync<DeckRow>('SELECT * FROM decks WHERE id = ?', deckId);
    if (!deck) return;

    // 1. Remove from cache and reindex
    const cards = await getCachedData<{ question: string; answer: string }[]>(deckId);
    if (!cards) return;
    cards.splice(cardIndex, 1);
    await replaceCardCache(deckId, cards);

    // 2. Rewrite CSV
    try {
        await FileSystem.writeAsStringAsync(deck.uri, cardsToCsv(cards));
    } catch (e) {
        console.error('Error rewriting CSV for delete', e);
    }

    // 3. Shift mastery indices (they move down after a deletion)
    const shiftIndices = (indices: number[]) =>
        indices.filter(i => i !== cardIndex).map(i => (i > cardIndex ? i - 1 : i));
    await db.runAsync(
        'UPDATE decks SET learned_indices = ?, unsure_indices = ?, total_cards = ? WHERE id = ?',
        JSON.stringify(shiftIndices(parseIndices(deck.learned_indices))),
        JSON.stringify(shiftIndices(parseIndices(deck.unsure_indices))),
        Math.max(0, deck.total_cards - 1),
        deckId
    );

    // 4. Shift SRS rows. Rebuilt in JS to avoid transient primary-key
    //    collisions a bulk "card_index = card_index - 1" update could hit.
    const srs = await getSrsForDeck(deckId);
    const shifted: Record<number, SRSCardData> = {};
    for (const [idxStr, data] of Object.entries(srs)) {
        const idx = parseInt(idxStr, 10);
        if (idx === cardIndex) continue;
        shifted[idx > cardIndex ? idx - 1 : idx] = data;
    }
    await serialized(() =>
        db.withTransactionAsync(async () => {
            await db.runAsync('DELETE FROM srs WHERE deck_id = ?', deckId);
            for (const [idxStr, s] of Object.entries(shifted)) {
                await db.runAsync(
                    'INSERT INTO srs (deck_id, card_index, interval, repetition, ease_factor, next_review) VALUES (?, ?, ?, ?, ?, ?)',
                    deckId, parseInt(idxStr, 10), s.interval, s.repetition, s.easeFactor, s.nextReview
                );
            }
        })
    );

    // 5. Shift confusion pairs the same way (drop pairs touching the deleted card)
    const confRows = await db.getAllAsync<{ card_a: number; card_b: number; count: number }>(
        'SELECT card_a, card_b, count FROM confusions WHERE deck_id = ?', deckId
    );
    if (confRows.length > 0) {
        const shiftIdx = (i: number) => (i > cardIndex ? i - 1 : i);
        await serialized(() =>
            db.withTransactionAsync(async () => {
                await db.runAsync('DELETE FROM confusions WHERE deck_id = ?', deckId);
                for (const r of confRows) {
                    if (r.card_a === cardIndex || r.card_b === cardIndex) continue;
                    const [a, b] = [shiftIdx(r.card_a), shiftIdx(r.card_b)];
                    await db.runAsync(
                        `INSERT INTO confusions (deck_id, card_a, card_b, count) VALUES (?, ?, ?, ?)
                         ON CONFLICT(deck_id, card_a, card_b) DO UPDATE SET count = count + excluded.count`,
                        deckId, Math.min(a, b), Math.max(a, b), r.count
                    );
                }
            })
        );
    }
}

// SM-2 Algorithm for Spaced Repetition
export function calculateSM2(grade: number, prevInterval: number, prevRepetition: number, prevEaseFactor: number): SRSCardData {
    let interval: number;
    let repetition: number;
    let easeFactor: number;

    if (grade >= 3) { // Correct response
        if (prevRepetition === 0) {
            interval = 1;
        } else if (prevRepetition === 1) {
            interval = 6;
        } else {
            interval = Math.round(prevInterval * prevEaseFactor);
        }
        repetition = prevRepetition + 1;
    } else { // Incorrect response
        repetition = 0;
        interval = 1;
    }

    easeFactor = prevEaseFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
    if (easeFactor < 1.3) easeFactor = 1.3;

    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + interval);

    return {
        interval,
        repetition,
        easeFactor,
        nextReview: nextReview.toISOString()
    };
}

async function upsertSrsRow(deckId: string, cardIndex: number, data: SRSCardData): Promise<void> {
    const db = await getDb();
    await db.runAsync(
        `INSERT OR REPLACE INTO srs (deck_id, card_index, interval, repetition, ease_factor, next_review)
         VALUES (?, ?, ?, ?, ?, ?)`,
        deckId, cardIndex, data.interval, data.repetition, data.easeFactor, data.nextReview
    );
}

// Persist one swipe (SRS grade + mastery lists) with two small row writes —
// no more rewriting the whole deck registry per swipe.
// Returns the deck's updated SRS map so callers can mirror it locally.
export async function applySwipeResult(
    deckId: string,
    cardIndex: number,
    grade: number,
    learnedIndices: number[],
    unsureIndices: number[]
): Promise<Record<number, SRSCardData>> {
    const db = await getDb();
    const exists = await db.getFirstAsync<{ id: string }>('SELECT id FROM decks WHERE id = ?', deckId);
    if (!exists) return {};

    const prevRow = await db.getFirstAsync<SrsRow>(
        'SELECT * FROM srs WHERE deck_id = ? AND card_index = ?', deckId, cardIndex
    );
    const prevData: SRSCardData = prevRow
        ? { interval: prevRow.interval, repetition: prevRow.repetition, easeFactor: prevRow.ease_factor, nextReview: prevRow.next_review }
        : { interval: 0, repetition: 0, easeFactor: 2.5, nextReview: new Date().toISOString() };

    await upsertSrsRow(deckId, cardIndex, calculateSM2(grade, prevData.interval, prevData.repetition, prevData.easeFactor));
    await db.runAsync(
        'UPDATE decks SET learned_indices = ?, unsure_indices = ? WHERE id = ?',
        JSON.stringify(learnedIndices), JSON.stringify(unsureIndices), deckId
    );

    return getSrsForDeck(deckId);
}

// Restore (or clear) SRS data for a single card - used by session undo
export async function restoreCardSRS(deckId: string, cardIndex: number, data?: SRSCardData): Promise<void> {
    const db = await getDb();
    if (data) {
        await upsertSrsRow(deckId, cardIndex, data);
    } else {
        await db.runAsync('DELETE FROM srs WHERE deck_id = ? AND card_index = ?', deckId, cardIndex);
    }
}

// Exam countdown: set or clear (null) the target date, "YYYY-MM-DD"
export async function updateDeckExamDate(deckId: string, examDate: string | null): Promise<void> {
    const db = await getDb();
    await db.runAsync('UPDATE decks SET exam_date = ? WHERE id = ?', examDate, deckId);
}

export interface ExamPlan {
    daysLeft: number;      // whole days until the exam (0 = today)
    remainingCards: number;
    cardsPerDay: number;   // pace needed to cover the remaining cards in time
    onTrack: boolean;      // every card already learned — nothing left to cover
}

// Pure helper: how many cards/day are needed to have every card learned by
// exam day. "Learned" uses the mastery list the swipe modes already maintain.
export function getExamPlan(deck: Deck): ExamPlan | null {
    if (!deck.examDate) return null;
    const today = new Date().toISOString().split('T')[0];
    const daysLeft = daysBetweenDateKeys(today, deck.examDate);
    if (isNaN(daysLeft)) return null;

    const total = deck.totalCards || 0;
    const learned = deck.learnedIndices?.length || 0;
    const remainingCards = Math.max(0, total - learned);
    const cardsPerDay = daysLeft > 0 ? Math.ceil(remainingCards / daysLeft) : remainingCards;

    return {
        daysLeft,
        remainingCards,
        cardsPerDay,
        onTrack: remainingCards === 0,
    };
}

// Confusion pairs: which two cards keep getting mixed up in quiz mode.
// Stored with card_a < card_b so (3,7) and (7,3) are the same pair.
export interface ConfusionPair {
    cardA: number;
    cardB: number;
    count: number;
}

export async function recordConfusion(deckId: string, cardX: number, cardY: number): Promise<void> {
    if (cardX === cardY || cardX < 0 || cardY < 0) return;
    const [a, b] = cardX < cardY ? [cardX, cardY] : [cardY, cardX];
    const db = await getDb();
    await db.runAsync(
        `INSERT INTO confusions (deck_id, card_a, card_b, count) VALUES (?, ?, ?, 1)
         ON CONFLICT(deck_id, card_a, card_b) DO UPDATE SET count = count + 1`,
        deckId, a, b
    );
}

// Cross-deck "hardest cards": lowest SM-2 ease factors first. Only cards
// that have actually been reviewed and struggled with (ease below the 2.5
// starting value) qualify.
export interface HardCard {
    deckId: string;
    deckName: string;
    deckUri: string;
    cardIndex: number;
    question: string;
    easeFactor: number;
}

export async function getHardestCards(limit: number = 8): Promise<HardCard[]> {
    try {
        const db = await getDb();
        const rows = await db.getAllAsync<{
            deck_id: string; card_index: number; ease_factor: number;
            question: string; name: string; uri: string;
        }>(
            `SELECT s.deck_id, s.card_index, s.ease_factor, c.question, d.name, d.uri
             FROM srs s
             JOIN cards_cache c ON c.deck_id = s.deck_id AND c.card_index = s.card_index
             JOIN decks d ON d.id = s.deck_id
             WHERE s.ease_factor < 2.5
             ORDER BY s.ease_factor ASC
             LIMIT ?`,
            limit
        );
        return rows.map(r => ({
            deckId: r.deck_id,
            deckName: r.name,
            deckUri: r.uri,
            cardIndex: r.card_index,
            question: r.question,
            easeFactor: r.ease_factor,
        }));
    } catch {
        return [];
    }
}

// Full wipe: every table + the copied deck/audio files. Preferences and
// theme (AsyncStorage) are cleared by the caller.
export async function wipeAllData(): Promise<void> {
    const db = await getDb();
    await serialized(() =>
        db.withTransactionAsync(async () => {
            for (const table of ['decks', 'folders', 'srs', 'cards_cache', 'audio_files', 'pdf_progress', 'confusions', 'kv']) {
                await db.runAsync(`DELETE FROM ${table}`);
            }
        })
    );
    for (const dir of ['decks/', 'audio/', 'cardimg/']) {
        await FileSystem.deleteAsync(`${FileSystem.documentDirectory}${dir}`, { idempotent: true }).catch(() => { });
    }
}

// Pairs confused at least twice, most-confused first
export async function getConfusionPairs(deckId: string, limit: number = 5): Promise<ConfusionPair[]> {
    try {
        const db = await getDb();
        const rows = await db.getAllAsync<{ card_a: number; card_b: number; count: number }>(
            'SELECT card_a, card_b, count FROM confusions WHERE deck_id = ? AND count >= 2 ORDER BY count DESC LIMIT ?',
            deckId, limit
        );
        return rows.map(r => ({ cardA: r.card_a, cardB: r.card_b, count: r.count }));
    } catch {
        return [];
    }
}

export async function updateDeckStudyDirection(deckId: string, direction: StudyDirection): Promise<void> {
    const db = await getDb();
    await db.runAsync('UPDATE decks SET study_direction = ? WHERE id = ?', direction, deckId);
}

// Wipe all mastery + SRS progress for a deck, keeping its cards
export async function resetDeckProgress(deckId: string): Promise<void> {
    const db = await getDb();
    await serialized(() =>
        db.withTransactionAsync(async () => {
            await db.runAsync("UPDATE decks SET learned_indices = '[]', unsure_indices = '[]' WHERE id = ?", deckId);
            await db.runAsync('DELETE FROM srs WHERE deck_id = ?', deckId);
        })
    );
}

export async function updateCardSRS(deckId: string, cardIndex: number, grade: number): Promise<void> {
    const db = await getDb();
    const prevRow = await db.getFirstAsync<SrsRow>(
        'SELECT * FROM srs WHERE deck_id = ? AND card_index = ?', deckId, cardIndex
    );
    const prevData: SRSCardData = prevRow
        ? { interval: prevRow.interval, repetition: prevRow.repetition, easeFactor: prevRow.ease_factor, nextReview: prevRow.next_review }
        : { interval: 0, repetition: 0, easeFactor: 2.5, nextReview: new Date().toISOString() };

    await upsertSrsRow(deckId, cardIndex, calculateSM2(grade, prevData.interval, prevData.repetition, prevData.easeFactor));
}

// Audio Management
export async function getAudioFiles(): Promise<AudioFile[]> {
    try {
        const db = await getDb();
        const rows = await db.getAllAsync<{ id: string; name: string; uri: string; duration: number | null; folder_id: string | null; position: number | null }>(
            'SELECT * FROM audio_files ORDER BY CAST(id AS INTEGER) DESC'
        );
        return rows.map(r => ({ id: r.id, name: r.name, uri: r.uri, duration: r.duration ?? undefined, folderId: r.folder_id, position: r.position ?? undefined }));
    } catch {
        return [];
    }
}

export async function saveAudioFile(sourceUri: string, name: string, folderId: string | null = null): Promise<AudioFile> {
    const id = Date.now().toString();
    const localUri = `${FileSystem.documentDirectory}audio/${id}_${name}`;

    const dirInfo = await FileSystem.getInfoAsync(`${FileSystem.documentDirectory}audio/`);
    if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}audio/`, { intermediates: true });
    }

    await FileSystem.copyAsync({ from: sourceUri, to: localUri });

    const newAudio: AudioFile = { id, name, uri: localUri, folderId };
    const db = await getDb();
    await db.runAsync('INSERT OR REPLACE INTO audio_files (id, name, uri, duration, folder_id) VALUES (?, ?, ?, ?, ?)', id, name, localUri, null, folderId);
    return newAudio;
}

export async function setAudioPosition(id: string, seconds: number): Promise<void> {
    try {
        const db = await getDb();
        await db.runAsync('UPDATE audio_files SET position = ? WHERE id = ?', seconds, id);
    } catch (e) {
        console.error('Error saving audio position', e);
    }
}

export async function updateAudioFile(id: string, name?: string, folderId?: string | null): Promise<void> {
    const db = await getDb();
    if (name !== undefined) await db.runAsync('UPDATE audio_files SET name = ? WHERE id = ?', name, id);
    // folderId: undefined = leave unchanged, null = move to root
    if (folderId !== undefined) await db.runAsync('UPDATE audio_files SET folder_id = ? WHERE id = ?', folderId, id);
}

export async function deleteAudioFile(id: string): Promise<void> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ uri: string }>('SELECT uri FROM audio_files WHERE id = ?', id);
    if (row) {
        try {
            await FileSystem.deleteAsync(row.uri, { idempotent: true });
        } catch (e) {
            console.warn('Could not delete audio file', e);
        }
    }
    await db.runAsync('DELETE FROM audio_files WHERE id = ?', id);
}

// Backup/restore helpers: insert fully-formed records that came from a backup
// file (ids and metadata preserved; files already written by the caller).
export async function importDeckRecord(deck: Deck): Promise<void> {
    await insertDeckRow(deck);
    if (deck.srsData) {
        for (const [idxStr, s] of Object.entries(deck.srsData)) {
            await upsertSrsRow(deck.id, parseInt(idxStr, 10), s);
        }
    }
}

export async function importFolderRecord(folder: Folder): Promise<void> {
    const db = await getDb();
    await db.runAsync(
        'INSERT OR REPLACE INTO folders (id, name, parent_id, created_at, kind) VALUES (?, ?, ?, ?, ?)',
        folder.id, folder.name, folder.parentId, folder.createdAt ?? null, folder.kind ?? 'deck'
    );
}

export async function importAudioRecord(audio: AudioFile): Promise<void> {
    const db = await getDb();
    await db.runAsync(
        'INSERT OR REPLACE INTO audio_files (id, name, uri, duration) VALUES (?, ?, ?, ?)',
        audio.id, audio.name, audio.uri, audio.duration ?? null
    );
}
