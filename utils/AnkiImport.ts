import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import { cleanAnkiHtml, convertCloze, imagePlaceholder, isCloze } from './AnkiParse';
import { extractZipEntryRanged, parseZipEntriesRanged, RangeReader, ZipEntry } from './Zip';
import { imageToken, importCardImageBase64, occlusionToken } from './CardImages';
import { createDeckWithCards, Deck } from './Storage';

// Imports an Anki .apkg export as a new Sprig deck: unpacks the ZIP, reads
// the notes out of the bundled SQLite collection, converts each note's HTML
// fields to plain text, and carries referenced images over into the card
// image store. Newest-format exports (Zstd) are rejected with 'new-format' —
// Anki can re-export those with "Support older Anki versions" enabled.
//
// Most note types (Basic, Cloze) put question/answer straight in the first
// two fields, which is all the default path below assumes. "Image
// Occlusion Enhanced" — very common for anatomy/diagram decks — doesn't:
// its content is a base image plus two SVG masks (see NoteModel/buildCard),
// so it's detected via the collection's model list and handled separately.
//
// The archive is read in ranged chunks (central directory, then each entry
// on demand) rather than loaded whole — real-world exports run 100+ MB, and
// reading that as a single base64 string reliably OOMs on-device.

export interface ApkgResult {
    deck: Deck;
    cardCount: number;
    imageCount: number;
}

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|svg)$/i;

interface NoteModel {
    name: string;
    // field name (lowercased) -> index into the note's split flds array
    fieldIndex: Map<string, number>;
}

export type ApkgProgress = (processed: number, total: number) => void;

export async function importApkg(
    fileUri: string,
    deckName: string,
    icon: string,
    folderId: string | null,
    onProgress?: ApkgProgress
): Promise<ApkgResult> {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) throw new Error('no-collection');
    const fileSize = info.size;

    const readRange: RangeReader = async (position, length) => {
        const b64 = await FileSystem.readAsStringAsync(fileUri, {
            encoding: FileSystem.EncodingType.Base64,
            position,
            length,
        });
        return Buffer.from(b64, 'base64');
    };

    const entries = await parseZipEntriesRanged(fileSize, readRange);

    const collection = entries.get('collection.anki21') || entries.get('collection.anki2');
    if (!collection) {
        console.warn('Anki import: no collection.anki21/anki2 found. fileSize =', fileSize,
            'entries found =', entries.size, 'names =', [...entries.keys()].slice(0, 30));
        throw new Error(entries.has('collection.anki21b') ? 'new-format' : 'no-collection');
    }

    // Media map: the ZIP stores media under numeric names; the 'media' JSON
    // maps those back to the real file names that cards reference.
    const mediaByRealName = new Map<string, ZipEntry>();
    const mediaEntry = entries.get('media');
    if (mediaEntry) {
        try {
            const bytes = await extractZipEntryRanged(mediaEntry, readRange);
            const json = JSON.parse(Buffer.from(bytes).toString('utf8'));
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
    const dbBytes = await extractZipEntryRanged(collection, readRange);
    await FileSystem.writeAsStringAsync(sqliteDir + dbName, Buffer.from(dbBytes).toString('base64'), {
        encoding: FileSystem.EncodingType.Base64,
    });

    let notes: { mid: number; flds: string }[] = [];
    const models = new Map<number, NoteModel>();
    try {
        const adb = await SQLite.openDatabaseAsync(dbName);
        try {
            notes = await adb.getAllAsync<{ mid: number; flds: string }>('SELECT mid, flds FROM notes ORDER BY id');
            try {
                const col = await adb.getFirstAsync<{ models: string }>('SELECT models FROM col');
                if (col?.models) {
                    const parsed = JSON.parse(col.models);
                    for (const [id, model] of Object.entries<any>(parsed)) {
                        const fieldIndex = new Map<string, number>();
                        for (const f of model.flds ?? []) fieldIndex.set(String(f.name).toLowerCase(), f.ord);
                        models.set(Number(id), { name: model.name ?? '', fieldIndex });
                    }
                }
            } catch {
                // Model metadata is only needed for non-Basic note types (e.g.
                // Image Occlusion) — without it those notes are just skipped below.
            }
        } finally {
            await adb.closeAsync().catch(() => { });
        }
    } finally {
        await SQLite.deleteDatabaseAsync(dbName).catch(() => { });
    }
    if (notes.length === 0) throw new Error('empty');

    // Save each referenced image once, even when several cards share it.
    // Cached by real (in-deck) file name -> the name it was saved under
    // locally; resolveImage wraps that in a ready-to-embed ![img](...) token,
    // resolveImageFile hands back the bare name for building other tokens
    // (e.g. an occlusion pair's base+mask names).
    const savedMedia = new Map<string, string | null>();
    let imageCount = 0;
    const resolveImageFile = async (realName: string): Promise<string | null> => {
        const cached = savedMedia.get(realName);
        if (cached !== undefined) return cached;
        let file: string | null = null;
        const entry = mediaByRealName.get(realName);
        if (entry && IMAGE_EXT_RE.test(realName)) {
            try {
                const bytes = await extractZipEntryRanged(entry, readRange);
                file = await importCardImageBase64(Buffer.from(bytes).toString('base64'), realName);
                imageCount++;
            } catch (e) {
                console.warn('Could not extract Anki media:', realName, e);
            }
        }
        savedMedia.set(realName, file);
        return file;
    };
    const resolveImage = async (realName: string): Promise<string | null> => {
        const file = await resolveImageFile(realName);
        return file ? imageToken(file) : null;
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

    // A field that's just `<img src="whatever" />` — as Image
    // Occlusion's Image/Question Mask/Answer Mask fields always are —
    // reduces to a single referenced file name via the same HTML cleaner
    // used for regular fields.
    const fieldImageRef = (rawField: string): string | null => cleanAnkiHtml(rawField).images[0] ?? null;

    const buildOcclusionCard = async (fields: string[], model: NoteModel): Promise<{ question: string; answer: string } | null> => {
        const idx = (name: string) => model.fieldIndex.get(name);
        const imageIdx = idx('image');
        const qMaskIdx = idx('question mask');
        const aMaskIdx = idx('answer mask');
        if (imageIdx === undefined || qMaskIdx === undefined || aMaskIdx === undefined) return null;

        const imageRef = fieldImageRef(fields[imageIdx] ?? '');
        const qMaskRef = fieldImageRef(fields[qMaskIdx] ?? '');
        const aMaskRef = fieldImageRef(fields[aMaskIdx] ?? '');
        if (!imageRef) return null;

        const baseFile = await resolveImageFile(imageRef);
        if (!baseFile) return null;

        const [header, footer, remarks, sources] = await Promise.all(
            ['header', 'footer', 'remarks', 'sources'].map(async name => {
                const i = idx(name);
                return i === undefined ? '' : await fieldToText(fields[i] ?? '');
            })
        );

        const qMaskFile = qMaskRef ? await resolveImageFile(qMaskRef) : null;
        const aMaskFile = aMaskRef ? await resolveImageFile(aMaskRef) : null;

        // Both masks present: a real hide/reveal occlusion card. Otherwise
        // fall back to a plain picture card so the note isn't dropped outright.
        const questionMedia = qMaskFile ? occlusionToken(baseFile, qMaskFile) : imageToken(baseFile);
        const answerMedia = aMaskFile ? occlusionToken(baseFile, aMaskFile) : imageToken(baseFile);

        const question = [header, questionMedia].filter(Boolean).join('\n');
        const answer = [header, answerMedia, footer, remarks, sources].filter(Boolean).join('\n');
        return { question, answer };
    };

    const cards: { question: string; answer: string }[] = [];
    for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        const fields = String(note.flds).split('\x1f');
        const model = models.get(note.mid);

        if (model && /image occlusion/i.test(model.name)) {
            const card = await buildOcclusionCard(fields, model);
            if (card && card.question && card.answer) cards.push(card);
        } else {
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

        // Extracting referenced media is what actually takes time on a big
        // deck (thousands of individual ranged file reads) — throttle so a
        // progress callback doesn't trigger a re-render on every single note.
        if (onProgress && (i % 10 === 0 || i === notes.length - 1)) onProgress(i + 1, notes.length);
    }
    if (cards.length === 0) throw new Error('empty');

    const deck = await createDeckWithCards(deckName, icon, folderId, cards);
    return { deck, cardCount: cards.length, imageCount };
}
