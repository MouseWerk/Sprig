// Typo-tolerant answer checking for typing mode.

// Normalize for comparison: case, whitespace, punctuation and accents
// shouldn't decide right vs wrong.
export function normalizeAnswer(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // strip diacritics
        .replace(/[^\p{L}\p{N} ]+/gu, ' ') // punctuation -> space
        .replace(/\s+/g, ' ')
        .trim();
}

export function levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    let prev = new Array(b.length + 1);
    let curr = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;

    for (let i = 1; i <= a.length; i++) {
        curr[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        }
        [prev, curr] = [curr, prev];
    }
    return prev[b.length];
}

export type AnswerVerdict = 'exact' | 'close' | 'wrong';

// Exact after normalization; "close" allows small typos scaled to length
// (1 edit up to 8 chars, 2 up to 16, 3 beyond).
export function checkAnswer(typed: string, expected: string): AnswerVerdict {
    const t = normalizeAnswer(typed);
    const e = normalizeAnswer(expected);
    if (!t) return 'wrong';
    if (t === e) return 'exact';
    const tolerance = e.length <= 3 ? 0 : e.length <= 8 ? 1 : e.length <= 16 ? 2 : 3;
    if (tolerance > 0 && levenshtein(t, e) <= tolerance) return 'close';
    return 'wrong';
}
