import { IMAGE_TOKEN_RE, imageToken } from './CardImages';

// Raw card text carries markup users should never read literally:
// ==highlight== markers and ![img](cardimg/…) tokens. The editor's text
// inputs show a clean "display" version instead; these helpers convert
// between the two while keeping highlights and attached images intact.

const HIGHLIGHT_RE = /==([^=\n][\s\S]*?)==/g;

// Remove image token lines entirely (including a preceding line break so no
// blank line is left behind), then hide highlight markers.
export function toDisplayText(raw: string): string {
    return stripHighlightMarkers(removeImageTokens(raw));
}

function removeImageTokens(raw: string): string {
    // Consume only the line break that precedes an appended token — never
    // user-typed spaces, so editing stays stable while images are attached.
    return raw
        .replace(new RegExp(`\\n?${IMAGE_TOKEN_RE.source}`, 'g'), '')
        .replace(/^\n+/, '');
}

function stripHighlightMarkers(text: string): string {
    return text.replace(HIGHLIGHT_RE, '$1');
}

export function extractTokenSuffix(raw: string): string[] {
    const files: string[] = [];
    for (const m of raw.matchAll(IMAGE_TOKEN_RE)) files.push(m[1]);
    return files;
}

// Rebuild raw text after the user edited the display version: re-apply
// ==markers== to words that survived the edit unchanged (word-level LCS
// against the previous raw text), then re-append the image tokens.
export function fromDisplayText(previousRaw: string, display: string): string {
    const prevText = removeImageTokens(previousRaw);
    const files = extractTokenSuffix(previousRaw);

    const merged = reapplyHighlights(prevText, display);

    if (files.length === 0) return merged;
    const tokens = files.map(imageToken).join('\n');
    return merged.length > 0 ? `${merged}\n${tokens}` : tokens;
}

interface Word {
    text: string;      // as displayed (no markers)
    highlighted: boolean;
}

function parseWords(text: string): Word[] {
    return text
        .split(/\s+/)
        .filter(w => w.length > 0)
        .map(w => {
            const hl = w.length > 4 && w.startsWith('==') && w.endsWith('==');
            return { text: hl ? w.slice(2, -2) : w, highlighted: hl };
        });
}

function reapplyHighlights(prevRawText: string, display: string): string {
    const prevWords = parseWords(prevRawText);
    if (!prevWords.some(w => w.highlighted)) return display;

    const dispParts = display.split(/(\s+)/);
    const dispWords = dispParts.filter(p => p.trim().length > 0);

    // LCS table between previous words (by display text) and edited words.
    const n = prevWords.length;
    const m = dispWords.length;
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i][j] = prevWords[i].text === dispWords[j]
                ? dp[i + 1][j + 1] + 1
                : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }

    // Walk the LCS: display words matched to a previously highlighted word
    // get their markers back; everything else stays as typed.
    const highlightAt = new Array(m).fill(false);
    let i = 0, j = 0;
    while (i < n && j < m) {
        if (prevWords[i].text === dispWords[j]) {
            highlightAt[j] = prevWords[i].highlighted;
            i++; j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            i++;
        } else {
            j++;
        }
    }

    let wordIdx = 0;
    return dispParts
        .map(part => {
            if (part.trim().length === 0) return part;
            const idx = wordIdx++;
            return highlightAt[idx] ? `==${part}==` : part;
        })
        .join('');
}
