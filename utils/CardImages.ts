import * as FileSystem from 'expo-file-system/legacy';

// Card image store. Images attached to a flashcard live in a dedicated app
// directory and are referenced from the card text with a stable markdown
// token: ![img](cardimg/<file>). The path is relative on purpose — absolute
// document-directory paths change between installs (especially on iOS), so
// only the token is persisted and the URI is resolved at render time.

export const CARD_IMG_DIR = `${FileSystem.documentDirectory}cardimg/`;

// Matches one image token; group 1 = file name.
export const IMAGE_TOKEN_RE = /!\[img\]\(cardimg\/([^)\s]+)\)/g;

// An Anki "Image Occlusion" card: a base image with an SVG mask overlaid on
// top (the mask hides/reveals labeled regions). Kept as a single token so
// the pair renders as one stacked image instead of two independent ones.
// group 1 = base image file name, group 2 = mask svg file name.
export const OCCLUSION_TOKEN_RE = /!\[occl\]\(cardimg\/([^)\s|]+)\|cardimg\/([^)\s|]+)\)/g;

// Matches either token shape as a single opaque unit — used wherever code
// just needs to recognize/strip/reattach "the media token", regardless of
// which kind it is.
export const CARD_TOKEN_RE = /(?:!\[img\]\(cardimg\/[^)\s]+\)|!\[occl\]\(cardimg\/[^)\s|]+\|cardimg\/[^)\s|]+\))/g;

let seq = 0;

export function imageToken(fileName: string): string {
    return `![img](cardimg/${fileName})`;
}

export function occlusionToken(baseFile: string, maskFile: string): string {
    return `![occl](cardimg/${baseFile}|cardimg/${maskFile})`;
}

export function isImageToken(word: string): boolean {
    return /^!\[img\]\(cardimg\/[^)\s]+\)$|^!\[occl\]\(cardimg\/[^)\s|]+\|cardimg\/[^)\s|]+\)$/.test(word);
}

export function resolveCardImageUri(fileName: string): string {
    return CARD_IMG_DIR + fileName;
}

// Every file a card references — plain images and both halves of any
// occlusion pair — for export bundling, thumbnail previews and cleanup.
export function extractImageFiles(text: string): string[] {
    const files: string[] = [];
    for (const m of text.matchAll(IMAGE_TOKEN_RE)) files.push(m[1]);
    for (const m of text.matchAll(OCCLUSION_TOKEN_RE)) files.push(m[1], m[2]);
    return files;
}

export function extractOcclusionPairs(text: string): { base: string; mask: string }[] {
    return [...text.matchAll(OCCLUSION_TOKEN_RE)].map(m => ({ base: m[1], mask: m[2] }));
}

// Remove tokens for contexts that need plain prose: TTS, typed-answer
// comparison, quiz option labels.
export function stripImageTokens(text: string): string {
    return text.replace(CARD_TOKEN_RE, ' ').replace(/[ \t]{2,}/g, ' ').trim();
}

// Removes a single referenced file. For an occlusion pair this drops the
// whole token if either half matches — a dangling half-token isn't useful.
export function removeImageToken(text: string, fileName: string): string {
    return text
        .split(imageToken(fileName))
        .join('')
        .replace(OCCLUSION_TOKEN_RE, (match, base, mask) => (base === fileName || mask === fileName) ? '' : match)
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
