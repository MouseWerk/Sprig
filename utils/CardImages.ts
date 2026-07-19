import * as FileSystem from 'expo-file-system/legacy';

// Card image store. Images attached to a flashcard live in a dedicated app
// directory and are referenced from the card text with a stable markdown
// token: ![img](cardimg/<file>). The path is relative on purpose — absolute
// document-directory paths change between installs (especially on iOS), so
// only the token is persisted and the URI is resolved at render time.

export const CARD_IMG_DIR = `${FileSystem.documentDirectory}cardimg/`;

// Matches one image token; group 1 = file name.
export const IMAGE_TOKEN_RE = /!\[img\]\(cardimg\/([^)\s]+)\)/g;

let seq = 0;

export function imageToken(fileName: string): string {
    return `![img](cardimg/${fileName})`;
}

export function isImageToken(word: string): boolean {
    return /^!\[img\]\(cardimg\/[^)\s]+\)$/.test(word);
}

export function resolveCardImageUri(fileName: string): string {
    return CARD_IMG_DIR + fileName;
}

export function extractImageFiles(text: string): string[] {
    const files: string[] = [];
    for (const m of text.matchAll(IMAGE_TOKEN_RE)) files.push(m[1]);
    return files;
}

// Remove tokens for contexts that need plain prose: TTS, typed-answer
// comparison, quiz option labels.
export function stripImageTokens(text: string): string {
    return text.replace(IMAGE_TOKEN_RE, ' ').replace(/[ \t]{2,}/g, ' ').trim();
}

export function removeImageToken(text: string, fileName: string): string {
    return text
        .split(imageToken(fileName))
        .join('')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

async function ensureDir(): Promise<void> {
    const info = await FileSystem.getInfoAsync(CARD_IMG_DIR);
    if (!info.exists) {
        await FileSystem.makeDirectoryAsync(CARD_IMG_DIR, { intermediates: true });
    }
}

function safeExt(nameOrExt: string): string {
    const m = /\.?([a-zA-Z0-9]{1,5})$/.exec(nameOrExt);
    const ext = (m ? m[1] : 'jpg').toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext) ? ext : 'jpg';
}

function nextFileName(ext: string): string {
    return `${Date.now()}_${seq++}.${ext}`;
}

// Copy a picked image into the store; returns the file name for the token.
export async function importCardImage(sourceUri: string, originalName?: string): Promise<string> {
    await ensureDir();
    const fileName = nextFileName(safeExt(originalName || sourceUri));
    await FileSystem.copyAsync({ from: sourceUri, to: CARD_IMG_DIR + fileName });
    return fileName;
}

// Write raw image bytes (base64) into the store — used by the Anki importer.
export async function importCardImageBase64(base64: string, originalName: string): Promise<string> {
    await ensureDir();
    const fileName = nextFileName(safeExt(originalName));
    await FileSystem.writeAsStringAsync(CARD_IMG_DIR + fileName, base64, {
        encoding: FileSystem.EncodingType.Base64,
    });
    return fileName;
}
