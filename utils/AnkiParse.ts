import { Buffer } from 'buffer';
import { inflateRaw } from 'pako';

// Pure parsing helpers for Anki .apkg imports — no native/Expo dependencies,
// so everything in this file can be smoke-tested in plain Node.
//
// An .apkg is a ZIP archive containing:
//   - collection.anki2 / collection.anki21  (SQLite database with the notes)
//   - media                                  (JSON: zip file name -> real name)
//   - 0, 1, 2, ...                           (the media files themselves)
// Newer exports (collection.anki21b) are Zstd-compressed and unsupported —
// Anki's export dialog offers "Support older Anki versions" for those.

// ---------------------------------------------------------------------------
// Minimal ZIP reader (central directory + deflate via pako)
// ---------------------------------------------------------------------------

export interface ZipEntry {
    name: string;
    method: number;      // 0 = stored, 8 = deflate
    compSize: number;
    uncompSize: number;
    localOffset: number;
}

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

export function parseZipEntries(buf: Buffer): Map<string, ZipEntry> {
    // End-of-central-directory record sits in the last 22..65557 bytes
    let eocd = -1;
    const stop = Math.max(0, buf.length - 65557);
    for (let i = buf.length - 22; i >= stop; i--) {
        if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('not-a-zip');

    const count = buf.readUInt16LE(eocd + 10);
    let off = buf.readUInt32LE(eocd + 16);
    const entries = new Map<string, ZipEntry>();

    for (let n = 0; n < count; n++) {
        if (off + 46 > buf.length || buf.readUInt32LE(off) !== CENTRAL_SIG) break;
        const method = buf.readUInt16LE(off + 10);
        const compSize = buf.readUInt32LE(off + 20);
        const uncompSize = buf.readUInt32LE(off + 24);
        const nameLen = buf.readUInt16LE(off + 28);
        const extraLen = buf.readUInt16LE(off + 30);
        const commentLen = buf.readUInt16LE(off + 32);
        const localOffset = buf.readUInt32LE(off + 42);
        const name = buf.subarray(off + 46, off + 46 + nameLen).toString('utf8');
        entries.set(name, { name, method, compSize, uncompSize, localOffset });
        off += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
}

export function extractZipEntry(buf: Buffer, entry: ZipEntry): Uint8Array {
    const off = entry.localOffset;
    if (off + 30 > buf.length || buf.readUInt32LE(off) !== LOCAL_SIG) {
        throw new Error('bad-local-header');
    }
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const dataStart = off + 30 + nameLen + extraLen;
    const data = buf.subarray(dataStart, dataStart + entry.compSize);
    if (entry.method === 0) return new Uint8Array(data);
    if (entry.method === 8) return inflateRaw(new Uint8Array(data));
    throw new Error('unsupported-compression');
}

// ---------------------------------------------------------------------------
// Anki field HTML -> plain text (+ image references)
// ---------------------------------------------------------------------------

function decodeEntities(s: string): string {
    return s
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
        .replace(/&amp;/g, '&');
}

// Placeholder marking where an image sat in the text. The bracket sentinel
// is unlikely in real card text, and the importer swaps every occurrence
// for the saved image token (or removes it).
export function imagePlaceholder(index: number): string {
    return '[[IMG' + index + ']]';
}

// Returns the cleaned text with imagePlaceholder(n) markers where images
// were, plus the list of referenced media file names. The importer swaps the
// placeholders for real card-image tokens once the media is saved.
export function cleanAnkiHtml(html: string): { text: string; images: string[] } {
    const images: string[] = [];
    let s = html;

    s = s.replace(/\[sound:[^\]]*\]/g, ' ');
    s = s.replace(/<img[^>]*?src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi, (_m, dq, sq, bare) => {
        const src = decodeEntities((dq || sq || bare || '').trim());
        if (!src) return ' ';
        images.push(src);
        return ' ' + imagePlaceholder(images.length - 1) + ' ';
    });
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = s.replace(/<\/(div|p|li|tr|h[1-6])>/gi, '\n');
    s = s.replace(/<[^>]+>/g, '');
    s = decodeEntities(s);
    s = s
        .replace(/\r/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();

    return { text: s, images };
}

// ---------------------------------------------------------------------------
// Cloze notes: {{c1::answer::hint}} -> blanked question / revealed answer
// ---------------------------------------------------------------------------

const CLOZE_RE = /\{\{c\d+::([\s\S]*?)\}\}/g;

export function isCloze(text: string): boolean {
    return /\{\{c\d+::/.test(text);
}

export function convertCloze(text: string): { question: string; answer: string } {
    const question = text.replace(CLOZE_RE, (_m, inner) => {
        const hint = String(inner).split('::')[1];
        return hint ? `[${hint}]` : '____';
    });
    const answer = text.replace(CLOZE_RE, (_m, inner) => String(inner).split('::')[0]);
    return { question, answer };
}
