import * as FileSystem from 'expo-file-system/legacy';
import { importApkg } from './AnkiImport';
import { importSprigDeck, looksLikeZipBase64Head } from './SprigDeck';
import { createEmptyDeck, deleteDeck, importCsvToDeck, saveDeck } from './Storage';

// Handles files opened *with* Sprig from other apps ("Open with" / share ->
// view intents deliver a content:// or file:// URI as the launch URL).
// The file is copied into cache, sniffed (PDF/ZIP magic bytes vs. text), and
// imported through the same paths the in-app pickers use.

export interface IncomingImportResult {
    kind: 'pdf' | 'csv' | 'sprig' | 'anki';
    name: string;
    cards?: number;
}

const handled = new Set<string>();

export function isFileUrl(url: string | null): url is string {
    return !!url && (url.startsWith('content://') || url.startsWith('file://'));
}

// Best-effort human name from the URI; content URIs often encode the
// original filename in their last path segment.
function nameFromUrl(url: string, fallback: string): string {
    try {
        const last = decodeURIComponent(url.split('/').pop() || '');
        const cleaned = last.replace(/\.(pdf|csv|txt|sprig|apkg|colpkg)$/i, '').trim();
        if (cleaned.length >= 2 && cleaned.length <= 80 && !cleaned.includes(':')) return cleaned;
    } catch {
        // fall through
    }
    return fallback;
}

// Returns null when the URL was already handled (cold start + event race).
export async function importIncomingFile(url: string): Promise<IncomingImportResult | null> {
    if (handled.has(url)) return null;
    handled.add(url);

    const tmp = `${FileSystem.cacheDirectory}incoming_${Date.now()}`;
    await FileSystem.copyAsync({ from: url, to: tmp });

    // Sniff the first bytes: "%PDF" -> base64 "JVBER...", ZIP -> "UEsDB..."
    const head = await FileSystem.readAsStringAsync(tmp, { encoding: 'base64', length: 8, position: 0 } as any);

    if (head.startsWith('JVBER')) {
        const name = nameFromUrl(url, `Imported PDF ${new Date().toLocaleDateString()}`);
        await saveDeck(name, tmp, 'FileText', 'pdf', 0, null);
        await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => { });
        return { kind: 'pdf', name };
    }

    if (looksLikeZipBase64Head(head)) {
        // Could be an Anki .apkg/.colpkg export or a shared .sprig deck —
        // both are ZIPs, so try Anki's collection database first and only
        // fall back to the Sprig format when this isn't an Anki package.
        try {
            const name = nameFromUrl(url, `Imported Deck ${new Date().toLocaleDateString()}`);
            try {
                const res = await importApkg(tmp, name, 'Book', null);
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
            const res = await importSprigDeck(tmp, null);
            return { kind: 'sprig', name: res.deck.name, cards: res.cardCount };
        } catch (e: any) {
            throw new Error(e?.message === 'not-sprig'
                ? 'This file is not a Sprig deck'
                : (e?.message || 'Could not import this file'));
        } finally {
            await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => { });
        }
    }

    // Treat anything else as CSV/text and run it through the CSV importer
    const name = nameFromUrl(url, `Imported Deck ${new Date().toLocaleDateString()}`);
    const deck = await createEmptyDeck(name, 'Book', null);
    await importCsvToDeck(deck.id, tmp);
    await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => { });

    // Count what actually landed; a file with no parsable pairs is an error
    const { getCachedData } = await import('./Storage');
    const cards = await getCachedData<unknown[]>(deck.id);
    const count = cards?.length ?? 0;
    if (count === 0) {
        await deleteDeck(deck.id);
        throw new Error('No question/answer pairs found in the file');
    }
    return { kind: 'csv', name, cards: count };
}
