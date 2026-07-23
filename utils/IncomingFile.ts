import * as FileSystem from 'expo-file-system/legacy';
import { importApkg } from './AnkiImport';
import { importSprigDeck, looksLikeZipBase64Head } from './SprigDeck';
import { createEmptyDeck, deleteDeck, importCsvToDeck, saveAudioFile, saveDeck } from './Storage';

// Handles files opened *with* Sprig from other apps ("Open with" / share ->
// view intents deliver a content:// or file:// URI as the launch URL).
// The file is copied into cache and sniffed (PDF/ZIP magic bytes, audio
// extension, vs. plain text) so the caller can ask the user to confirm a
// name and destination folder *before* anything is actually imported —
// detectIncomingFile() never writes a deck/audio entry, only
// commitIncomingImport() does.

export type IncomingFileKind = 'pdf' | 'audio' | 'zip' | 'csv';

export interface DetectedIncomingFile {
    kind: IncomingFileKind;
    tmpUri: string;
    suggestedName: string;
}

export interface IncomingImportResult {
    kind: 'pdf' | 'csv' | 'sprig' | 'anki' | 'audio';
    name: string;
    cards?: number;
}

const handled = new Set<string>();
const AUDIO_EXT_RE = /\.(mp3|m4a|wav|aac|ogg|flac)$/i;

export function isFileUrl(url: string | null): url is string {
    return !!url && (url.startsWith('content://') || url.startsWith('file://'));
}

// Best-effort human name from the URI; content URIs often encode the
// original filename in their last path segment.
function nameFromUrl(url: string, fallback: string): string {
    try {
        const last = decodeURIComponent(url.split('/').pop() || '');
        const cleaned = last.replace(/\.(pdf|csv|txt|sprig|apkg|colpkg|mp3|m4a|wav|aac|ogg|flac)$/i, '').trim();
        if (cleaned.length >= 2 && cleaned.length <= 80 && !cleaned.includes(':')) return cleaned;
    } catch {
        // fall through
    }
    return fallback;
}

function extFromUrl(url: string): string {
    try {
        return decodeURIComponent(url.split('/').pop() || '');
    } catch {
        return url;
    }
}

// Copies the incoming file into cache and figures out roughly what kind of
// file it is, without importing anything yet. Returns null when the URL was
// already handled (cold start + event race).
export async function detectIncomingFile(url: string): Promise<DetectedIncomingFile | null> {
    if (handled.has(url)) return null;
    handled.add(url);

    const tmp = `${FileSystem.cacheDirectory}incoming_${Date.now()}`;
    await FileSystem.copyAsync({ from: url, to: tmp });

    // Sniff the first bytes: "%PDF" -> base64 "JVBER...", ZIP -> "UEsDB..."
    const head = await FileSystem.readAsStringAsync(tmp, { encoding: 'base64', length: 8, position: 0 } as any);

    if (head.startsWith('JVBER')) {
        return { kind: 'pdf', tmpUri: tmp, suggestedName: nameFromUrl(url, `Imported PDF ${new Date().toLocaleDateString()}`) };
    }

    if (AUDIO_EXT_RE.test(extFromUrl(url))) {
        return { kind: 'audio', tmpUri: tmp, suggestedName: nameFromUrl(url, `Imported Audio ${new Date().toLocaleDateString()}`) };
    }

    if (looksLikeZipBase64Head(head)) {
        // Could be an Anki .apkg/.colpkg export or a shared .sprig deck — both
        // are ZIPs, resolved at commit time (Anki's collection DB is tried
        // first, falling back to the Sprig format).
        return { kind: 'zip', tmpUri: tmp, suggestedName: nameFromUrl(url, `Imported Deck ${new Date().toLocaleDateString()}`) };
    }

    // Treat anything else as CSV/text
    return { kind: 'csv', tmpUri: tmp, suggestedName: nameFromUrl(url, `Imported Deck ${new Date().toLocaleDateString()}`) };
}

// Performs the actual import once the user has confirmed a name and folder.
export async function commitIncomingImport(
    detected: DetectedIncomingFile,
    name: string,
    folderId: string | null
): Promise<IncomingImportResult> {
    const { tmpUri: tmp, kind } = detected;

    try {
        if (kind === 'pdf') {
            await saveDeck(name, tmp, 'FileText', 'pdf', 0, folderId);
            return { kind: 'pdf', name };
        }

        if (kind === 'audio') {
            await saveAudioFile(tmp, name, folderId);
            return { kind: 'audio', name };
        }

        if (kind === 'zip') {
            try {
                const res = await importApkg(tmp, name, 'Book', folderId);
                return { kind: 'anki', name, cards: res.cardCount };
            } catch (e: any) {
                if (e?.message !== 'no-collection') {
                    throw new Error(
                        e?.message === 'new-format' ? 'This Anki export uses a newer format Sprig can\'t read yet — re-export with "Support older Anki versions" enabled'
                            : e?.message === 'empty' ? 'No cards found in this Anki deck'
                                : 'Could not import this Anki deck'
                    );
                }
            }

            // Not an Anki package — try it as a shared Sprig deck
            try {
                const res = await importSprigDeck(tmp, folderId, name);
                return { kind: 'sprig', name: res.deck.name, cards: res.cardCount };
            } catch (e: any) {
                throw new Error(e?.message === 'not-sprig'
                    ? 'This file is not a Sprig deck'
                    : (e?.message || 'Could not import this file'));
            }
        }

        // CSV/text
        const deck = await createEmptyDeck(name, 'Book', folderId);
        await importCsvToDeck(deck.id, tmp);

        // Count what actually landed; a file with no parsable pairs is an error
        const { getCachedData } = await import('./Storage');
        const cards = await getCachedData<unknown[]>(deck.id);
        const count = cards?.length ?? 0;
        if (count === 0) {
            await deleteDeck(deck.id);
            throw new Error('No question/answer pairs found in the file');
        }
        return { kind: 'csv', name, cards: count };
    } finally {
        await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => { });
    }
}

export async function discardIncomingFile(detected: DetectedIncomingFile): Promise<void> {
    await FileSystem.deleteAsync(detected.tmpUri, { idempotent: true }).catch(() => { });
}
