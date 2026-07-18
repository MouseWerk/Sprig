import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import {
    AudioFile,
    Deck,
    Folder,
    UserStats,
    getAudioFiles,
    getDecks,
    getFolders,
    getPdfProgressMap,
    getUserStats,
    importAudioRecord,
    importDeckRecord,
    importFolderRecord,
    mergePdfProgress,
    saveUserStats,
} from './Storage';

const BACKUP_VERSION = 1;
const PREF_KEYS = ['csvtudyapp_library_sort', 'csvtudyapp_focus_mode', 'csvtudyapp_onboarded', 'csvtudyapp_prefs'];

interface FileEntry {
    ext: string;
    encoding: 'utf8' | 'base64';
    content: string;
}

interface BackupPayload {
    app: 'Sprig' | 'FlashMaster';
    version: number;
    exportedAt: string;
    data: {
        decks: Deck[];
        folders: Folder[];
        audioFiles: AudioFile[];
        pdfProgress: Record<string, number>;
        stats: UserStats | null;
        prefs: Record<string, string>;
    };
    files: {
        decks: Record<string, FileEntry>;
        audio: Record<string, FileEntry>;
    };
}

export interface ImportSummary {
    decksAdded: number;
    foldersAdded: number;
    audioAdded: number;
    statsMerged: boolean;
}

async function ensureDir(dir: string) {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
}

// Build a self-contained backup file and return its local URI (in cache).
// File contents are embedded so a restore works even after a reinstall,
// where the document directory path changes.
export async function createBackup(): Promise<string> {
    const [decks, folders, audioFiles, pdfProgress, stats] = await Promise.all([
        getDecks(),
        getFolders(),
        getAudioFiles(),
        getPdfProgressMap(),
        getUserStats(),
    ]);

    const files: BackupPayload['files'] = { decks: {}, audio: {} };

    for (const d of decks) {
        try {
            const ext = d.type === 'pdf' ? 'pdf' : 'csv';
            if (d.type === 'pdf') {
                files.decks[d.id] = { ext, encoding: 'base64', content: await FileSystem.readAsStringAsync(d.uri, { encoding: 'base64' }) };
            } else {
                files.decks[d.id] = { ext, encoding: 'utf8', content: await FileSystem.readAsStringAsync(d.uri) };
            }
        } catch (e) {
            console.warn('Backup: could not read deck file', d.id, e);
        }
    }

    for (const a of audioFiles) {
        try {
            files.audio[a.id] = { ext: '', encoding: 'base64', content: await FileSystem.readAsStringAsync(a.uri, { encoding: 'base64' }) };
        } catch (e) {
            console.warn('Backup: could not read audio file', a.id, e);
        }
    }

    const prefs: Record<string, string> = {};
    for (const k of PREF_KEYS) {
        const v = await AsyncStorage.getItem(k);
        if (v != null) prefs[k] = v;
    }

    const payload: BackupPayload = {
        app: 'Sprig',
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        data: { decks, folders, audioFiles, pdfProgress, stats, prefs },
        files,
    };

    const stamp = new Date().toISOString().slice(0, 10);
    const uri = `${FileSystem.cacheDirectory}sprig-backup-${stamp}.json`;
    await FileSystem.writeAsStringAsync(uri, JSON.stringify(payload));
    return uri;
}

// Merge stats so nothing is ever lost: counters take the max, achievements
// union, per-day reviews take the max, and the latest study date wins.
function mergeStats(current: UserStats | null, incoming: UserStats | null): UserStats | null {
    if (!incoming) return current;
    if (!current) return incoming;
    const dailyReviews: Record<string, number> = { ...(current.dailyReviews || {}) };
    for (const [day, n] of Object.entries(incoming.dailyReviews || {})) {
        dailyReviews[day] = Math.max(dailyReviews[day] || 0, n);
    }
    const lastStudyDate = (current.lastStudyDate || '') > (incoming.lastStudyDate || '')
        ? current.lastStudyDate : incoming.lastStudyDate;
    return {
        totalCardsReviewed: Math.max(current.totalCardsReviewed || 0, incoming.totalCardsReviewed || 0),
        totalStudyTime: Math.max(current.totalStudyTime || 0, incoming.totalStudyTime || 0),
        lastStudyDate,
        currentStreak: Math.max(current.currentStreak || 0, incoming.currentStreak || 0),
        longestStreak: Math.max(current.longestStreak || 0, incoming.longestStreak || 0),
        achievements: Array.from(new Set([...(current.achievements || []), ...(incoming.achievements || [])])),
        dailyReviews,
        totalXp: Math.max(current.totalXp || 0, incoming.totalXp || 0),
        streakFreezes: Math.max(current.streakFreezes || 0, incoming.streakFreezes || 0),
        focusSessions: Math.max(current.focusSessions || 0, incoming.focusSessions || 0),
        quizzesCompleted: Math.max(current.quizzesCompleted || 0, incoming.quizzesCompleted || 0),
    };
}

// Restore from a backup file. Decks/folders/audio are merged by id (existing
// items are kept, missing ones are added and their files rewritten to the
// current document directory). Stats are merged so progress is never lost.
export async function importBackup(uri: string): Promise<ImportSummary> {
    const raw = await FileSystem.readAsStringAsync(uri);
    let backup: BackupPayload;
    try {
        backup = JSON.parse(raw);
    } catch {
        throw new Error('This file is not valid JSON');
    }
    if (!backup || (backup.app !== 'Sprig' && backup.app !== 'FlashMaster') || !backup.data) {
        throw new Error('This is not a Sprig backup');
    }

    const summary: ImportSummary = { decksAdded: 0, foldersAdded: 0, audioAdded: 0, statsMerged: false };

    // Decks
    const deckIds = new Set((await getDecks()).map(d => d.id));
    const decksDir = `${FileSystem.documentDirectory}decks/`;
    await ensureDir(decksDir);
    for (const d of backup.data.decks || []) {
        if (deckIds.has(d.id)) continue;
        const entry = backup.files?.decks?.[d.id];
        if (!entry) continue; // no embedded file content -> can't restore
        const ext = entry.ext || (d.type === 'pdf' ? 'pdf' : 'csv');
        const newUri = `${decksDir}${d.id}.${ext}`;
        try {
            await FileSystem.writeAsStringAsync(newUri, entry.content, entry.encoding === 'base64' ? { encoding: 'base64' } : undefined);
            await importDeckRecord({ ...d, uri: newUri });
            deckIds.add(d.id);
            summary.decksAdded++;
        } catch (e) {
            console.warn('Restore: could not write deck file', d.id, e);
        }
    }

    // Folders
    const folderIds = new Set((await getFolders()).map(f => f.id));
    for (const f of backup.data.folders || []) {
        if (folderIds.has(f.id)) continue;
        await importFolderRecord(f);
        folderIds.add(f.id);
        summary.foldersAdded++;
    }

    // Audio
    const audioIds = new Set((await getAudioFiles()).map(a => a.id));
    const audioDir = `${FileSystem.documentDirectory}audio/`;
    await ensureDir(audioDir);
    for (const a of backup.data.audioFiles || []) {
        if (audioIds.has(a.id)) continue;
        const entry = backup.files?.audio?.[a.id];
        if (!entry) continue;
        const newUri = `${audioDir}${a.id}_${a.name}`;
        try {
            await FileSystem.writeAsStringAsync(newUri, entry.content, { encoding: 'base64' });
            await importAudioRecord({ ...a, uri: newUri });
            audioIds.add(a.id);
            summary.audioAdded++;
        } catch (e) {
            console.warn('Restore: could not write audio file', a.id, e);
        }
    }

    // PDF progress (imported fills gaps, existing wins)
    await mergePdfProgress(backup.data.pdfProgress || {});

    // Stats (merge, never lose progress)
    const merged = mergeStats(await getUserStats(), backup.data.stats);
    if (merged) {
        await saveUserStats(merged);
        summary.statsMerged = true;
    }

    // Preferences (only set ones the user hasn't already chosen)
    for (const [k, v] of Object.entries(backup.data.prefs || {})) {
        const existing = await AsyncStorage.getItem(k);
        if (existing == null) await AsyncStorage.setItem(k, v);
    }

    return summary;
}
