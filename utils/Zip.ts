import { Buffer } from 'buffer';
import { inflateRaw } from 'pako';

// Minimal ZIP reader/writer — pure JS (Buffer + pako only), no native or
// Expo dependencies, so it can be smoke-tested in plain Node. Used by the
// Anki .apkg importer (read) and the .sprig deck-sharing format (read+write).

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

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

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
        // Re-wrapped through Buffer.from: the `buffer` polyfill's subarray()
        // doesn't reliably keep the Buffer subclass under Hermes, and
        // .toString('utf8') on a plain Uint8Array silently ignores the
        // encoding and comma-joins the raw byte values instead of decoding.
        const name = Buffer.from(buf.subarray(off + 46, off + 46 + nameLen)).toString('utf8');
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
// Ranged reading — for archives too large to load into memory whole (a
// multi-hundred-MB .apkg export can OOM if read as one base64 string). Reads
// only the central directory up front, then each entry's bytes on demand.
// ---------------------------------------------------------------------------

export type RangeReader = (position: number, length: number) => Promise<Buffer>;

export async function parseZipEntriesRanged(fileSize: number, readRange: RangeReader): Promise<Map<string, ZipEntry>> {
    const tailSize = Math.min(fileSize, 65557);
    const tail = await readRange(fileSize - tailSize, tailSize);

    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
        if (tail.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('not-a-zip');

    const count = tail.readUInt16LE(eocd + 10);
    const centralDirSize = tail.readUInt32LE(eocd + 12);
    const centralDirOffset = tail.readUInt32LE(eocd + 16);

    const central = await readRange(centralDirOffset, centralDirSize);

    const entries = new Map<string, ZipEntry>();
    let off = 0;
    for (let n = 0; n < count; n++) {
        if (off + 46 > central.length || central.readUInt32LE(off) !== CENTRAL_SIG) break;
        const method = central.readUInt16LE(off + 10);
        const compSize = central.readUInt32LE(off + 20);
        const uncompSize = central.readUInt32LE(off + 24);
        const nameLen = central.readUInt16LE(off + 28);
        const extraLen = central.readUInt16LE(off + 30);
        const commentLen = central.readUInt16LE(off + 32);
        const localOffset = central.readUInt32LE(off + 42);
        const name = Buffer.from(central.subarray(off + 46, off + 46 + nameLen)).toString('utf8');
        entries.set(name, { name, method, compSize, uncompSize, localOffset });
        off += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
}

export async function extractZipEntryRanged(entry: ZipEntry, readRange: RangeReader): Promise<Uint8Array> {
    const header = await readRange(entry.localOffset, 30);
    if (header.readUInt32LE(0) !== LOCAL_SIG) throw new Error('bad-local-header');
    const nameLen = header.readUInt16LE(26);
    const extraLen = header.readUInt16LE(28);
    const dataStart = entry.localOffset + 30 + nameLen + extraLen;
    const data = await readRange(dataStart, entry.compSize);
    if (entry.method === 0) return new Uint8Array(data);
    if (entry.method === 8) return inflateRaw(new Uint8Array(data));
    throw new Error('unsupported-compression');
}

// ---------------------------------------------------------------------------
// Writing (store mode — deck images are already compressed formats)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    return table;
})();

export function crc32(data: Uint8Array): number {
    let c = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
        c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

// DOS date for 1980-01-01 — a fixed valid timestamp keeps output deterministic
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const UTF8_FLAG = 0x0800;

export function buildZip(files: { name: string; data: Uint8Array }[]): Buffer {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;

    for (const f of files) {
        const nameBytes = Buffer.from(f.name, 'utf8');
        const crc = crc32(f.data);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(LOCAL_SIG, 0);
        local.writeUInt16LE(20, 4);              // version needed
        local.writeUInt16LE(UTF8_FLAG, 6);
        local.writeUInt16LE(0, 8);               // method: store
        local.writeUInt16LE(0, 10);              // mod time
        local.writeUInt16LE(DOS_DATE, 12);       // mod date
        local.writeUInt32LE(crc, 16);
        local.writeUInt32LE(f.data.length, 20);  // compressed size
        local.writeUInt32LE(f.data.length, 24);  // uncompressed size
        local.writeUInt16LE(nameBytes.length, 26);
        local.writeUInt16LE(0, 28);              // extra length
        localParts.push(local, nameBytes, Buffer.from(f.data));

        const central = Buffer.alloc(46);
        central.writeUInt32LE(CENTRAL_SIG, 0);
        central.writeUInt16LE(20, 4);            // version made by
        central.writeUInt16LE(20, 6);            // version needed
        central.writeUInt16LE(UTF8_FLAG, 8);
        central.writeUInt16LE(0, 10);            // method: store
        central.writeUInt16LE(0, 12);            // mod time
        central.writeUInt16LE(DOS_DATE, 14);     // mod date
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(f.data.length, 20);
        central.writeUInt32LE(f.data.length, 24);
        central.writeUInt16LE(nameBytes.length, 28);
        central.writeUInt16LE(0, 30);            // extra length
        central.writeUInt16LE(0, 32);            // comment length
        central.writeUInt16LE(0, 34);            // disk number
        central.writeUInt16LE(0, 36);            // internal attrs
        central.writeUInt32LE(0, 38);            // external attrs
        central.writeUInt32LE(offset, 42);       // local header offset
        centralParts.push(central, nameBytes);

        offset += 30 + nameBytes.length + f.data.length;
    }

    const centralBuf = Buffer.concat(centralParts);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(EOCD_SIG, 0);
    eocd.writeUInt16LE(0, 4);                    // this disk
    eocd.writeUInt16LE(0, 6);                    // central dir start disk
    eocd.writeUInt16LE(files.length, 8);         // entries on this disk
    eocd.writeUInt16LE(files.length, 10);        // total entries
    eocd.writeUInt32LE(centralBuf.length, 12);
    eocd.writeUInt32LE(offset, 16);              // central dir offset
    eocd.writeUInt16LE(0, 20);                   // comment length

    return Buffer.concat([...localParts, centralBuf, eocd]);
}
