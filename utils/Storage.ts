import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { parseFlashcardsCsv } from './CsvParser';

const DECKS_STORAGE_KEY = 'csvtudyapp_decks';
const CACHE_STORAGE_KEY = 'csvtudyapp_cache_';
const FOLDERS_STORAGE_KEY = 'csvtudyapp_folders';

export type DeckType = 'csv' | 'pdf';
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
}

export interface AudioFile {
    id: string;
    name: string;
    uri: string;
    duration?: number;
}

export interface Folder {
    id: string;
    name: string;
    parentId: string | null; // ID of the parent folder for subfolders
}

export interface UserStats {
    totalCardsReviewed: number;
    totalStudyTime: number; // in seconds
    lastStudyDate: string; // ISO date
    currentStreak: number; // days
    longestStreak: number; // days
    achievements: string[];
    dailyReviews?: Record<string, number>; // "YYYY-MM-DD" -> cards reviewed that day
}

export async function getDecks(): Promise<Deck[]> {
    try {
        const json = await AsyncStorage.getItem(DECKS_STORAGE_KEY);
        return json ? JSON.parse(json) : [];
    } catch (e) {
        console.error('Error getting decks', e);
        return [];
    }
}

export async function saveDeck(name: string, sourceUri: string, icon: string, type: DeckType, totalCards?: number, folderId: string | null = null): Promise<Deck> {
    const id = Date.now().toString();
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
    };

    const decks = await getDecks();
    const updatedDecks = [newDeck, ...decks];
    await AsyncStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify(updatedDecks));

    return newDeck;
}

export async function createEmptyDeck(name: string, icon: string, folderId: string | null = null): Promise<Deck> {
    const id = Date.now().toString();
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
    };

    const decks = await getDecks();
    const updatedDecks = [newDeck, ...decks];
    await AsyncStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify(updatedDecks));

    return newDeck;
}

export async function importCsvToDeck(deckId: string, sourceUri: string): Promise<void> {
    const decks = await getDecks();
    const deck = decks.find(d => d.id === deckId);
    if (!deck) throw new Error('Deck not found');

    const newCards = await parseFlashcardsCsv(sourceUri);
    if (!newCards || newCards.length === 0) return;

    // 1. Update CSV on disk (Rewrite entirely to be safe and clean)
    // On a cache miss, fall back to parsing the deck file itself so
    // existing cards are never lost when the cache has been cleared.
    let existingCards = await getCachedData<any[]>(deckId);
    if (!existingCards) {
        existingCards = await parseFlashcardsCsv(deck.uri);
    }
    const combinedCards = [...existingCards, ...newCards];

    const escape = (text: string) => `"${text.replace(/"/g, '""')}"`;
    const csvContent = combinedCards.map(c => `${escape(c.question)},${escape(c.answer)}`).join('\n');

    await FileSystem.writeAsStringAsync(deck.uri, csvContent);

    // 2. Update Cache
    await setCachedData(deckId, combinedCards);

    // 3. Update deck total in registry
    deck.totalCards = combinedCards.length;
    await AsyncStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify(decks));
}

export async function updateDeckProgress(id: string, learnedIndices: number[], unsureIndices: number[]): Promise<void> {
    const decks = await getDecks();
    const index = decks.findIndex(d => d.id === id);
    if (index !== -1) {
        decks[index].learnedIndices = learnedIndices;
        decks[index].unsureIndices = unsureIndices;
        await AsyncStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify(decks));
    }
}

export async function deleteDeck(id: string): Promise<void> {
    const decks = await getDecks();
    const deckToDelete = decks.find(d => d.id === id);

    if (deckToDelete) {
        try {
            await FileSystem.deleteAsync(deckToDelete.uri, { idempotent: true });
            await AsyncStorage.removeItem(CACHE_STORAGE_KEY + id);
        } catch (e) {
            console.warn('Could not delete file or cache', e);
        }
    }

    const updatedDecks = decks.filter(d => d.id !== id);
    await AsyncStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify(updatedDecks));
}

// Caching for parsed CSV data to speed up loading
export async function getCachedData<T>(id: string): Promise<T | null> {
    try {
        const json = await AsyncStorage.getItem(CACHE_STORAGE_KEY + id);
        return json ? JSON.parse(json) : null;
    } catch {
        return null;
    }
}

export async function setCachedData<T>(id: string, data: T): Promise<void> {
    try {
        await AsyncStorage.setItem(CACHE_STORAGE_KEY + id, JSON.stringify(data));
    } catch (e) {
        console.error('Error caching data', e);
    }
}

// User Stats Functions
const STATS_KEY = 'flashmaster_stats';

export async function getUserStats(): Promise<UserStats> {
    try {
        const json = await AsyncStorage.getItem(STATS_KEY);
        if (json) {
            return JSON.parse(json);
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
    };
}

export async function updateUserStats(cardsReviewed: number, studyTime: number): Promise<void> {
    const stats = await getUserStats();
    const today = new Date().toISOString().split('T')[0];
    const lastStudy = stats.lastStudyDate.split('T')[0];

    stats.totalCardsReviewed += cardsReviewed;
    stats.totalStudyTime += studyTime;

    // Per-day counts for the activity heatmap, pruned to roughly a year
    if (!stats.dailyReviews) stats.dailyReviews = {};
    stats.dailyReviews[today] = (stats.dailyReviews[today] || 0) + cardsReviewed;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 370);
    const cutoffKey = cutoff.toISOString().split('T')[0];
    for (const key of Object.keys(stats.dailyReviews)) {
        if (key < cutoffKey) delete stats.dailyReviews[key];
    }

    // Calculate streak
    if (lastStudy !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        if (lastStudy === yesterdayStr) {
            stats.currentStreak += 1;
        } else if (lastStudy === '') {
            stats.currentStreak = 1;
        } else {
            stats.currentStreak = 1;
        }

        if (stats.currentStreak > stats.longestStreak) {
            stats.longestStreak = stats.currentStreak;
        }
    }

    stats.lastStudyDate = new Date().toISOString();

    // Check achievements
    if (stats.totalCardsReviewed >= 100 && !stats.achievements.includes('century')) {
        stats.achievements.push('century');
    }
    if (stats.currentStreak >= 7 && !stats.achievements.includes('week_streak')) {
        stats.achievements.push('week_streak');
    }
    if (stats.currentStreak >= 30 && !stats.achievements.includes('month_streak')) {
        stats.achievements.push('month_streak');
    }

    await AsyncStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

// Folder Management
export async function getFolders(): Promise<Folder[]> {
    try {
        const json = await AsyncStorage.getItem(FOLDERS_STORAGE_KEY);
        return json ? JSON.parse(json) : [];
    } catch (e) {
        console.error('Error getting folders', e);
        return [];
    }
}

export async function saveFolder(name: string, parentId: string | null = null): Promise<Folder> {
    const newFolder: Folder = {
        id: Date.now().toString(),
        name,
        parentId,
    };

    const folders = await getFolders();
    const updatedFolders = [...folders, newFolder];
    await AsyncStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(updatedFolders));

    return newFolder;
}

export async function deleteFolder(id: string): Promise<void> {
    const folders = await getFolders();
    const updatedFolders = folders.filter(f => f.id !== id);

    // Move child folders to root before persisting
    updatedFolders.forEach(folder => {
        if (folder.parentId === id) {
            folder.parentId = null;
        }
    });
    await AsyncStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(updatedFolders));

    // Move decks in this folder to root (folderId = null)
    const decks = await getDecks();
    let decksModified = false;
    decks.forEach(deck => {
        if (deck.folderId === id) {
            deck.folderId = null;
            decksModified = true;
        }
    });

    if (decksModified) {
        await AsyncStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify(decks));
    }
}

export async function moveDeckToFolder(deckId: string, folderId: string | null): Promise<void> {
    const decks = await getDecks();
    const index = decks.findIndex(d => d.id === deckId);
    if (index !== -1) {
        decks[index].folderId = folderId;
        await AsyncStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify(decks));
    }
}

export async function updateDeck(deckId: string, name?: string, icon?: string, folderId?: string | null): Promise<void> {
    const decks = await getDecks();
    const index = decks.findIndex(d => d.id === deckId);
    if (index !== -1) {
        if (name !== undefined) decks[index].name = name;
        if (icon !== undefined) decks[index].icon = icon;
        // folderId: undefined = leave unchanged, null = move to root
        if (folderId !== undefined) decks[index].folderId = folderId;
        await AsyncStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify(decks));
    }
}

export async function addCardToDeck(deckId: string, question: string, answer: string): Promise<void> {
    const decks = await getDecks();
    const deck = decks.find(d => d.id === deckId);
    if (!deck) return;

    // 1. Update CSV file on disk
    // Escape quotes for CSV
    const escape = (text: string) => `"${text.replace(/"/g, '""')}"`;
    const newRow = `\n${escape(question)},${escape(answer)}`;

    try {
        await FileSystem.writeAsStringAsync(deck.uri, (await FileSystem.readAsStringAsync(deck.uri)) + newRow);
    } catch (e) {
        console.error('Error writing to CSV', e);
    }

    // 2. Update Cache
    let cachedCards = await getCachedData<any[]>(deckId);
    if (cachedCards) {
        cachedCards.push({ question, answer });
        await setCachedData(deckId, cachedCards);
    }

    // 3. Update totalCount in storage
    deck.totalCards = (deck.totalCards || 0) + 1;
    await AsyncStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify(decks));
}

export async function updateCardInDeck(deckId: string, cardIndex: number, updatedCard: { question: string, answer: string }): Promise<void> {
    const decks = await getDecks();
    const deck = decks.find(d => d.id === deckId);
    if (!deck) return;

    // 1. Update Cache first for speed
    let cachedCards = await getCachedData<any[]>(deckId);
    if (cachedCards) {
        cachedCards[cardIndex] = updatedCard;
        await setCachedData(deckId, cachedCards);
    } else {
        // If no cache, we can't easily update without re-parsing
        return;
    }

    // 2. Rewrite CSV file (since we need to change a line in the middle)
    const escape = (text: string) => `"${text.replace(/"/g, '""')}"`;
    const csvContent = cachedCards.map(c => `${escape(c.question)},${escape(c.answer)}`).join('\n');

    try {
        await FileSystem.writeAsStringAsync(deck.uri, csvContent);
    } catch (e) {
        console.error('Error rewriting CSV', e);
    }
}

export async function deleteCardFromDeck(deckId: string, cardIndex: number): Promise<void> {
    const decks = await getDecks();
    const deck = decks.find(d => d.id === deckId);
    if (!deck) return;

    // 1. Update Cache
    let cachedCards = await getCachedData<any[]>(deckId);
    if (!cachedCards) return;

    cachedCards.splice(cardIndex, 1);
    await setCachedData(deckId, cachedCards);

    // 2. Rewrite CSV
    const escape = (text: string) => `"${text.replace(/"/g, '""')}"`;
    const csvContent = cachedCards.map(c => `${escape(c.question)},${escape(c.answer)}`).join('\n');

    try {
        await FileSystem.writeAsStringAsync(deck.uri, csvContent);
    } catch (e) {
        console.error('Error rewriting CSV for delete', e);
    }

    // 3. Update mastery indices (they shift after deletion)
    const shiftIndices = (indices: number[]) => {
        return indices
            .filter(i => i !== cardIndex)
            .map(i => (i > cardIndex ? i - 1 : i));
    };

    deck.learnedIndices = shiftIndices(deck.learnedIndices || []);
    deck.unsureIndices = shiftIndices(deck.unsureIndices || []);
    deck.totalCards = Math.max(0, (deck.totalCards || 0) - 1);

    // 4. Update SRS data (shift keys)
    if (deck.srsData) {
        const newSrsData: Record<number, SRSCardData> = {};
        Object.entries(deck.srsData).forEach(([idxStr, data]) => {
            const idx = parseInt(idxStr);
            if (idx === cardIndex) return;
            const newIdx = idx > cardIndex ? idx - 1 : idx;
            newSrsData[newIdx] = data;
        });
        deck.srsData = newSrsData;
    }

    await AsyncStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify(decks));
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

// Persist one swipe (SRS grade + mastery lists) in a single read/write pass.
// Returns the deck's updated SRS map so callers can mirror it locally.
export async function applySwipeResult(
    deckId: string,
    cardIndex: number,
    grade: number,
    learnedIndices: number[],
    unsureIndices: number[]
): Promise<Record<number, SRSCardData>> {
    const decks = await getDecks();
    const deck = decks.find(d => d.id === deckId);
    if (!deck) return {};

    if (!deck.srsData) deck.srsData = {};
    const prevData = deck.srsData[cardIndex] || {
        interval: 0,
        repetition: 0,
        easeFactor: 2.5,
        nextReview: new Date().toISOString()
    };
    deck.srsData[cardIndex] = calculateSM2(grade, prevData.interval, prevData.repetition, prevData.easeFactor);
    deck.learnedIndices = learnedIndices;
    deck.unsureIndices = unsureIndices;

    await AsyncStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify(decks));
    return { ...deck.srsData };
}

// Restore (or clear) SRS data for a single card - used by session undo
export async function restoreCardSRS(deckId: string, cardIndex: number, data?: SRSCardData): Promise<void> {
    const decks = await getDecks();
    const deck = decks.find(d => d.id === deckId);
    if (!deck) return;

    if (!deck.srsData) deck.srsData = {};
    if (data) {
        deck.srsData[cardIndex] = data;
    } else {
        delete deck.srsData[cardIndex];
    }

    await AsyncStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify(decks));
}

export async function updateDeckStudyDirection(deckId: string, direction: StudyDirection): Promise<void> {
    const decks = await getDecks();
    const deck = decks.find(d => d.id === deckId);
    if (!deck) return;

    deck.studyDirection = direction;
    await AsyncStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify(decks));
}

// Wipe all mastery + SRS progress for a deck, keeping its cards
export async function resetDeckProgress(deckId: string): Promise<void> {
    const decks = await getDecks();
    const deck = decks.find(d => d.id === deckId);
    if (!deck) return;

    deck.learnedIndices = [];
    deck.unsureIndices = [];
    deck.srsData = {};

    await AsyncStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify(decks));
}

export async function updateCardSRS(deckId: string, cardIndex: number, grade: number): Promise<void> {
    const decks = await getDecks();
    const deck = decks.find(d => d.id === deckId);
    if (!deck) return;

    if (!deck.srsData) deck.srsData = {};

    const prevData = deck.srsData[cardIndex] || {
        interval: 0,
        repetition: 0,
        easeFactor: 2.5,
        nextReview: new Date().toISOString()
    };

    const newData = calculateSM2(grade, prevData.interval, prevData.repetition, prevData.easeFactor);
    deck.srsData[cardIndex] = newData;

    await AsyncStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify(decks));
}

// Audio Management
const AUDIO_STORAGE_KEY = 'csvtudyapp_audio_files';

export async function getAudioFiles(): Promise<AudioFile[]> {
    try {
        const json = await AsyncStorage.getItem(AUDIO_STORAGE_KEY);
        return json ? JSON.parse(json) : [];
    } catch {
        return [];
    }
}

export async function saveAudioFile(sourceUri: string, name: string): Promise<AudioFile> {
    const id = Date.now().toString();
    const localUri = `${FileSystem.documentDirectory}audio/${id}_${name}`;

    const dirInfo = await FileSystem.getInfoAsync(`${FileSystem.documentDirectory}audio/`);
    if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}audio/`, { intermediates: true });
    }

    await FileSystem.copyAsync({ from: sourceUri, to: localUri });

    const newAudio: AudioFile = { id, name, uri: localUri };
    const audios = await getAudioFiles();
    const updated = [newAudio, ...audios];
    await AsyncStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(updated));

    return newAudio;
}

export async function deleteAudioFile(id: string): Promise<void> {
    const audios = await getAudioFiles();
    const toDelete = audios.find(a => a.id === id);
    if (toDelete) {
        await FileSystem.deleteAsync(toDelete.uri, { idempotent: true });
    }
    const updated = audios.filter(a => a.id !== id);
    await AsyncStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(updated));
}
