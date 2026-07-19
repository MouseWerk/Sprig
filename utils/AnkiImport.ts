import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import { cleanAnkiHtml, convertCloze, imagePlaceholder, isCloze } from './AnkiParse';
import { extractZipEntry, parseZipEntries, ZipEntry } from './Zip';
import { imageToken, importCardImageBase64 } from './CardImages';
import { createDeckWithCards, Deck } from './Storage';

// Imports an Anki .apkg export as a new Sprig deck: unpacks the ZIP, reads
// the notes out of the bundled SQLite collection, converts each note's HTML
// fields to plain text, and carries referenced images over into the card
// image store. Newest-format exports (Zstd) are rejected with 'new-format' —
// Anki can re-export those with "Support older Anki versions" enabled.

export interface ApkgResult {
    deck: Deck;
    cardCount: number;
    imageCount: number;
}

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|svg)$/i;

export async function importApkg(
    fileUri: string,
    deckName: string,
    icon: string,
    folderId: string | null
): Promise<ApkgResult> {
    const b64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
    const buf = Buffer.from(b64, 'base64');
    const entries = parseZipEntries(buf);

    const collection = entries.get('collection.anki21') || entries.get('collection.anki2');
    if (!collection) {
        throw new Error(entries.has('collection.anki21b') ? 'new-format' : 'no-collection');
    }

    // Media map: the ZIP stores media under numeric names; the 'media' JSON
    // maps those back to the real file names that cards reference.
    const mediaByRealName = new Map<string, ZipEntry>();
    const mediaEntry = entries.get('media');
    if (mediaEntry) {
        try {
            const json = JSON.parse(Buffer.from(extractZipEntry(buf, mediaEntry)).toString('utf8'));
            for (const [zipName, realName] of Object.entries(json)) {
                const e = entries.get(zipName);
                if (e && typeof realName === 'string') mediaByRealName.set(realName, e);
            }
        } catch {
            // Newer exports compress this map — continue without images.
        }
    }

    // Unpack the collection database next to expo-sqlite's own databases and
    // read the notes through it.
    const sqliteDir = `${FileSystem.documentDirectory}SQLite/`;
    const dirInfo = await FileSystem.getInfoAsync(sqliteDir);
    if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(sqliteDir, { intermediates: true });
    }
    const dbName = `anki_import_${Date.now()}.db`;
    const dbBytes = extractZipEntry(buf, collection);
    await FileSystem.writeAsStringAsync(sqliteDir + dbName, Buffer.from(dbBytes).toString('base64'), {
        encoding: FileSystem.EncodingType.Base64,
    });

    let notes: { flds: string }[] = [];
    try {
        const adb = await SQLite.openDatabaseAsync(dbName);
        try {
            notes = await adb.getAllAsync<{ flds: string }>('SELECT flds FROM notes ORDER BY id');
        } finally {
            await adb.closeAsync().catch(() => { });
        }
    } finally {
        await SQLite.deleteDatabaseAsync(dbName).catch(() => { });
    }
    if (notes.length === 0) throw new Error('empty');

    // Save each referenced image once, even when several cards share it.
    const savedMedia = new Map<string, string | null>();
    let imageCount = 0;
    const resolveImage = async (realName: string): Promise<string | null> => {
        const cached = savedMedia.get(realName);
        if (cached !== undefined) return cached;
        let token: string | null = null;
        const entry = mediaByRealName.get(realName);
        if (entry && IMAGE_EXT_RE.test(realName)) {
            try {
                const bytes = extractZipEntry(buf, entry);
                const file = await importCardImageBase64(Buffer.from(bytes).toString('base64'), realName);
                token = imageToken(file);
                imageCount++;
            } catch (e) {
                console.warn('Could not extract Anki media:', realName, e);
            }
        }
        savedMedia.set(realName, token);
        return token;
    };

    const fieldToText = async (rawField: string): Promise<string> => {
        const { text, images } = cleanAnkiHtml(rawField);
        let out = text;
        for (let i = 0; i < images.length; i++) {
            const token = await resolveImage(images[i]);
            out = out.split(imagePlaceholder(i)).join(token ? `\n${token}\n` : ' ');
        }
        return out
            .replace(/[ \t]{2,}/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    };

    const cards: { question: string; answer: string }[] = [];
    for (const note of notes) {
        const fields = String(note.flds).split('\x1f');
        const front = fields[0] ?? '';
        const back = fields[1] ?? '';

        let rawQ = front;
        let rawA = back;
        if (isCloze(front)) {
            const cloze = convertCloze(front);
            rawQ = cloze.question;
            rawA = cloze.answer;
        }

        const question = await fieldToText(rawQ);
        const answer = await fieldToText(rawA);
        if (question && answer) cards.push({ question, answer });
    }
    if (cards.length === 0) throw new Error('empty');

    const deck = await createDeckWithCards(deckName, icon, folderId, cards);
    return { deck, cardCount: cards.length, imageCount };
}
