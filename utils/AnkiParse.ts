// Pure Anki-specific parsing helpers (HTML fields, cloze notes) for .apkg
// imports. ZIP handling lives in ./Zip. No native/Expo dependencies, so
// everything here can be smoke-tested in plain Node.

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
