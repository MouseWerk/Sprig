import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';

// Single shared connection. Every Storage.ts call funnels through getDb(),
// which opens the database once, creates the schema, and performs a one-time
// migration of any legacy AsyncStorage data.

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const MIGRATED_FLAG = 'migrated_from_asyncstorage_v1';

// Legacy AsyncStorage keys (pre-SQLite)
const LEGACY_DECKS_KEY = 'csvtudyapp_decks';
const LEGACY_FOLDERS_KEY = 'csvtudyapp_folders';
const LEGACY_AUDIO_KEY = 'csvtudyapp_audio_files';
const LEGACY_PDF_PROGRESS_KEY = 'csvtudyapp_pdf_progress';
const LEGACY_STATS_KEY = 'flashmaster_stats';
const LEGACY_CACHE_PREFIX = 'csvtudyapp_cache_';

export function getDb(): Promise<SQLite.SQLiteDatabase> {
    if (!dbPromise) {
        dbPromise = initDb().catch(e => {
            // Allow a retry on next call instead of caching the failure forever
            dbPromise = null;
            throw e;
        });
    }
    return dbPromise;
}

async function initDb(): Promise<SQLite.SQLiteDatabase> {
    const db = await SQLite.openDatabaseAsync('sprig.db');

    await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS decks (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            uri TEXT NOT NULL,
            icon TEXT NOT NULL DEFAULT 'Book',
            type TEXT NOT NULL DEFAULT 'csv',
            total_cards INTEGER NOT NULL DEFAULT 0,
            folder_id TEXT,
            study_direction TEXT,
            learned_indices TEXT NOT NULL DEFAULT '[]',
            unsure_indices TEXT NOT NULL DEFAULT '[]',
            created_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            parent_id TEXT,
            created_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS srs (
            deck_id TEXT NOT NULL,
            card_index INTEGER NOT NULL,
            interval REAL NOT NULL,
            repetition INTEGER NOT NULL,
            ease_factor REAL NOT NULL,
            next_review TEXT NOT NULL,
            PRIMARY KEY (deck_id, card_index)
        );

        CREATE TABLE IF NOT EXISTS cards_cache (
            deck_id TEXT NOT NULL,
            card_index INTEGER NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            PRIMARY KEY (deck_id, card_index)
        );

        CREATE TABLE IF NOT EXISTS audio_files (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            uri TEXT NOT NULL,
            duration REAL
        );

        CREATE TABLE IF NOT EXISTS pdf_progress (
            deck_id TEXT PRIMARY KEY NOT NULL,
            page INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS kv (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS confusions (
            deck_id TEXT NOT NULL,
            card_a INTEGER NOT NULL,
            card_b INTEGER NOT NULL,
            count INTEGER NOT NULL DEFAULT 1,
            PRIMARY KEY (deck_id, card_a, card_b)
        );

        CREATE INDEX IF NOT EXISTS idx_srs_deck ON srs(deck_id);
        CREATE INDEX IF NOT EXISTS idx_cards_deck ON cards_cache(deck_id);
    `);

    await addColumnIfMissing(db, 'decks', 'exam_date', 'TEXT');
    await addColumnIfMissing(db, 'audio_files', 'folder_id', 'TEXT');
    await addColumnIfMissing(db, 'audio_files', 'position', 'REAL');

    // Folders are scoped per area (deck / pdf / audio) instead of shared.
    // On upgrade, claim all pre-existing folders for the Home tab and move
    // PDFs and audio back to their roots so nothing lands in a folder that
    // is no longer visible on its tab.
    const kindAdded = await addColumnIfMissing(db, 'folders', 'kind', 'TEXT');
    if (kindAdded) {
        await db.execAsync(`
            UPDATE folders SET kind = 'deck' WHERE kind IS NULL;
            UPDATE decks SET folder_id = NULL WHERE type = 'pdf' AND folder_id IS NOT NULL;
            UPDATE audio_files SET folder_id = NULL WHERE folder_id IS NOT NULL;
        `);
    }

    await migrateFromAsyncStorage(db);
    return db;
}

// Additive schema upgrades for databases created before a column existed.
// Returns true when the column was just added, so one-time backfills can run.
async function addColumnIfMissing(db: SQLite.SQLiteDatabase, table: string, column: string, type: string): Promise<boolean> {
    const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
    if (!cols.some(c => c.name === column)) {
        await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
        return true;
    }
    return false;
}

function safeParse<T>(raw: string | null, fallback: T): T {
    if (!raw) return fallback;
    try {
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

// Copies all legacy AsyncStorage data into SQLite exactly once. The legacy
// keys are left in place afterwards as a safety net; only the parsed-card
// cache entries are removed since they can be large and are rebuilt on demand.
async function migrateFromAsyncStorage(db: SQLite.SQLiteDatabase): Promise<void> {
    const done = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM kv WHERE key = ?', MIGRATED_FLAG
    );
    if (done) return;

    try {
        const [decksRaw, foldersRaw, audioRaw, pdfRaw, statsRaw] = await Promise.all([
            AsyncStorage.getItem(LEGACY_DECKS_KEY),
            AsyncStorage.getItem(LEGACY_FOLDERS_KEY),
            AsyncStorage.getItem(LEGACY_AUDIO_KEY),
            AsyncStorage.getItem(LEGACY_PDF_PROGRESS_KEY),
            AsyncStorage.getItem(LEGACY_STATS_KEY),
        ]);

        const decks = safeParse<any[]>(decksRaw, []);
        const folders = safeParse<any[]>(foldersRaw, []);
        const audio = safeParse<any[]>(audioRaw, []);
        const pdfProgress = safeParse<Record<string, number>>(pdfRaw, {});

        const allKeys = await AsyncStorage.getAllKeys();
        const cacheKeys = allKeys.filter(k => k.startsWith(LEGACY_CACHE_PREFIX));

        await db.withTransactionAsync(async () => {
            for (const d of decks) {
                await db.runAsync(
                    `INSERT OR REPLACE INTO decks (id, name, uri, icon, type, total_cards, folder_id, study_direction, learned_indices, unsure_indices, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    d.id, d.name ?? 'Deck', d.uri ?? '', d.icon ?? 'Book', d.type ?? 'csv',
                    d.totalCards ?? 0, d.folderId ?? null, d.studyDirection ?? null,
                    JSON.stringify(d.learnedIndices ?? []), JSON.stringify(d.unsureIndices ?? []),
                    d.createdAt ?? null
                );
                if (d.srsData && typeof d.srsData === 'object') {
                    for (const [idx, s] of Object.entries<any>(d.srsData)) {
                        await db.runAsync(
                            `INSERT OR REPLACE INTO srs (deck_id, card_index, interval, repetition, ease_factor, next_review)
                             VALUES (?, ?, ?, ?, ?, ?)`,
                            d.id, parseInt(idx, 10), s.interval ?? 0, s.repetition ?? 0,
                            s.easeFactor ?? 2.5, s.nextReview ?? new Date().toISOString()
                        );
                    }
                }
            }

            for (const f of folders) {
                await db.runAsync(
                    'INSERT OR REPLACE INTO folders (id, name, parent_id, created_at) VALUES (?, ?, ?, ?)',
                    f.id, f.name ?? 'Folder', f.parentId ?? null, f.createdAt ?? null
                );
            }

            for (const a of audio) {
                await db.runAsync(
                    'INSERT OR REPLACE INTO audio_files (id, name, uri, duration) VALUES (?, ?, ?, ?)',
                    a.id, a.name ?? 'Audio', a.uri ?? '', a.duration ?? null
                );
            }

            for (const [deckId, page] of Object.entries(pdfProgress)) {
                if (typeof page === 'number' && page > 0) {
                    await db.runAsync(
                        'INSERT OR REPLACE INTO pdf_progress (deck_id, page) VALUES (?, ?)',
                        deckId, Math.round(page)
                    );
                }
            }

            if (statsRaw) {
                await db.runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', 'stats', statsRaw);
            }

            for (const key of cacheKeys) {
                const cards = safeParse<any[]>(await AsyncStorage.getItem(key), []);
                const deckId = key.slice(LEGACY_CACHE_PREFIX.length);
                for (let i = 0; i < cards.length; i++) {
                    const c = cards[i];
                    if (!c) continue;
                    await db.runAsync(
                        'INSERT OR REPLACE INTO cards_cache (deck_id, card_index, question, answer) VALUES (?, ?, ?, ?)',
                        deckId, i, String(c.question ?? ''), String(c.answer ?? '')
                    );
                }
            }

            await db.runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', MIGRATED_FLAG, new Date().toISOString());
        });

        // The cache blobs are the only legacy data worth deleting (they can be
        // several MB); everything else stays behind as a rollback safety net.
        if (cacheKeys.length > 0) {
            await AsyncStorage.multiRemove(cacheKeys);
        }
    } catch (e) {
        console.error('SQLite migration from AsyncStorage failed', e);
        // The migrated flag is only written on success, so a failed migration
        // is retried on next launch. The app still works off the empty tables.
    }
}
