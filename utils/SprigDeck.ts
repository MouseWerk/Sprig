import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system/legacy';
import { extractImageFiles, imageToken, IMAGE_TOKEN_RE, importCardImageBase64, resolveCardImageUri } from './CardImages';
import { parseFlashcardsCsv } from './CsvParser';
import { createDeckWithCards, Deck, getCachedData } from './Storage';
import { buildZip, extractZipEntry, parseZipEntries } from './Zip';

// The .sprig deck-sharing format: a ZIP with a deck.json manifest plus the
// images the cards reference. Unlike sharing the raw CSV, a .sprig file
// carries the deck name, icon and every attached image, so a deck opens
// complete on the recipient's device.
//
//   deck.json          { format, version, name, icon, cards: [{question, answer}] }
//   images/<file>      card images, file names as referenced by the tokens

const FORMAT = 'sprig-deck';
const FORMAT_VERSION = 1;

interface SprigDeckManifest {
    format: string;
    version: number;
    name: string;
    icon: string;
    cards: { question: string; answer: string }[];
}

export function isSprigFileName(name?: string | null): boolean {
    return /\.sprig$/i.test(name || '');
}

// ZIP local-header magic "PK\x03\x04" -> base64 "UEsDB..." (used to sniff
// incoming files that arrive without a useful extension).
export function looksLikeZipBase64Head(base64Head: string): boolean {
    return base64Head.startsWith('UEsDB');
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

// Bundles the deck into <Deck-Name>.sprig in the cache directory and returns
// its uri (caller hands it to the share sheet).
export async function exportSprigDeck(deck: Deck): Promise<string> {
    let rawCards = await getCachedData<{ question: string; answer: string }[]>(deck.id);
    if (!rawCards || rawCards.length === 0) {
        rawCards = await parseFlashcardsCsv(deck.uri);
    }
    const cards = (rawCards ?? [])
        .map(c => ({ question: String(c.question ?? ''), answer: String(c.answer ?? '') }))
        .filter(c => c.question || c.answer);
    if (cards.length === 0) throw new Error('empty');

    // Bundle every referenced image once
    const imageNames = new Set<string>();
    for (const c of cards) {
        for (const f of extractImageFiles(c.question)) imageNames.add(f);
        for (const f of extractImageFiles(c.answer)) imageNames.add(f);
    }
    const files: { name: string; data: Uint8Array }[] = [];
    for (const f of imageNames) {
        try {
            const b64 = await FileSystem.readAsStringAsync(resolveCardImageUri(f), {
                encoding: FileSystem.EncodingType.Base64,
            });
            files.push({ name: `images/${f}`, data: new Uint8Array(Buffer.from(b64, 'base64')) });
        } catch {
            // Image missing on disk — the import side strips its token.
        }
    }

    const manifest: SprigDeckManifest = {
        format: FORMAT,
        version: FORMAT_VERSION,
        name: deck.name,
        icon: deck.icon,
        cards,
    };
    files.unshift({ name: 'deck.json', data: new Uint8Array(Buffer.from(JSON.stringify(manifest), 'utf8')) });

    const zip = buildZip(files);
    const safeName = deck.name.replace(/[^\w\-. ]+/g, '').trim().replace(/\s+/g, '-') || 'deck';
    const uri = `${FileSystem.cacheDirectory}${safeName}.sprig`;
    await FileSystem.writeAsStringAsync(uri, zip.toString('base64'), {
        encoding: FileSystem.EncodingType.Base64,
    });
    return uri;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

// Reads a .sprig file, stores its bundled images under fresh local names
// (never colliding with existing ones) and creates the deck. Throws
// 'not-sprig' for files that aren't the format and 'empty' for deck files
// without usable cards.
export async function importSprigDeck(
    fileUri: string,
    folderId: string | null = null,
    nameOverride?: string
): Promise<{ deck: Deck; cardCount: number; imageCount: number }> {
    const b64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
    const buf = Buffer.from(b64, 'base64');

    let manifest: SprigDeckManifest;
    let entries;
    try {
        entries = parseZipEntries(buf);
        const manifestEntry = entries.get('deck.json');
        if (!manifestEntry) throw new Error('not-sprig');
        manifest = JSON.parse(Buffer.from(extractZipEntry(buf, manifestEntry)).toString('utf8'));
    } catch {
        throw new Error('not-sprig');
    }
    if (manifest?.format !== FORMAT || !Array.isArray(manifest.cards)) {
        throw new Error('not-sprig');
    }

    // Save bundled images under fresh names; old token file -> new file
    const renamed = new Map<string, string>();
    let imageCount = 0;
    for (const [entryName, entry] of entries) {
        if (!entryName.startsWith('images/')) continue;
        const oldFile = entryName.slice('images/'.length);
        if (!oldFile) continue;
        try {
            const data = extractZipEntry(buf, entry);
            const newFile = await importCardImageBase64(Buffer.from(data).toString('base64'), oldFile);
            renamed.set(oldFile, newFile);
            imageCount++;
        } catch {
            // Broken image entry — its token gets stripped below.
        }
    }

    // Rewrite tokens to the freshly saved files; drop tokens whose image
    // didn't make it (a broken image on every recipient device is worse).
    const remapTokens = (text: string): string =>
        text
            .replace(IMAGE_TOKEN_RE, (match, file) => {
                const newFile = renamed.get(file);
                return newFile ? imageToken(newFile) : '';
            })
            .replace(/\n{3,}/g, '\n\n')
            .trim();

    const cards = manifest.cards
        .map(c => ({
            question: remapTokens(String(c?.question ?? '')),
            answer: remapTokens(String(c?.answer ?? '')),
        }))
        .filter(c => c.question && c.answer);
    if (cards.length === 0) throw new Error('empty');

    const name = nameOverride?.trim() || (typeof manifest.name === 'string' && manifest.name.trim()) || 'Imported Deck';
    const icon = typeof manifest.icon === 'string' && manifest.icon ? manifest.icon : 'Book';
    const deck = await createDeckWithCards(name, icon, folderId, cards);
    return { deck, cardCount: cards.length, imageCount };
}
