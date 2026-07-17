import * as FileSystem from 'expo-file-system/legacy';
import Papa from 'papaparse';

export interface FlashcardData {
  question: string;
  answer: string;
}

const HEADER_WORDS = new Set([
  'question', 'answer', 'front', 'back', 'term', 'definition', 'q', 'a', 'prompt', 'response',
]);

function looksLikeHeaderRow(row: string[]): boolean {
  if (row.length < 2) return false;
  return HEADER_WORDS.has(row[0]?.trim().toLowerCase()) && HEADER_WORDS.has(row[1]?.trim().toLowerCase());
}

// Map Anki's "#separator:xxx" directive values to actual characters
const SEPARATOR_NAMES: Record<string, string> = {
  tab: '\t',
  comma: ',',
  semicolon: ';',
  pipe: '|',
  colon: ':',
  space: ' ',
};

function decodeHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Delimiters that split "question DELIM answer" on a single line rather than
// acting as CSV cell separators (e.g. "Capital of France -> Paris").
const ARROW_DELIMITERS = ['->', '=>', '→'];

// Choose the most plausible delimiter by how consistently it appears across
// lines. Prose often contains commas, so tab/semicolon/pipe get priority.
// Arrows rank above the comma: an arrow-separated file often contains commas
// inside its prose, while a real CSV almost never has arrows on most lines.
// Exception: rows that are fully quoted ("...","...") are app/Anki-style CSV,
// so standard delimiters win even if the content itself is full of arrows.
function detectDelimiter(lines: string[]): string | undefined {
  const sample = lines.slice(0, 30);
  const hitRatio = (candidate: string) =>
    sample.filter(l => l.includes(candidate)).length / sample.length;

  const quotedCsv = sample.filter(l => /^\s*".*"\s*$/.test(l)).length / sample.length >= 0.6;
  const candidates = quotedCsv
    ? ['\t', ';', '|', ',', ...ARROW_DELIMITERS]
    : ['\t', ';', '|', ...ARROW_DELIMITERS, ','];

  for (const candidate of candidates) {
    if (hitRatio(candidate) >= 0.6) return candidate;
  }
  return undefined;
}

// A deck imported before arrow-separator support looks like: every card holds
// two full "question -> answer" lines, one in each field, because the old
// alternating-lines fallback paired whole lines together. Detect that
// signature and re-split the lines into the cards the user actually meant.
// Returns null when the deck doesn't match (nothing to repair).
export function repairMispairedArrowCards(cards: FlashcardData[]): FlashcardData[] | null {
  if (cards.length < 2) return null;
  const fieldHasArrow = (s: string) => ARROW_DELIMITERS.some(a => s.includes(a));
  const mispaired = cards.filter(c => fieldHasArrow(c.question) && fieldHasArrow(c.answer)).length;
  if (mispaired / cards.length < 0.6) return null;

  const lines = cards.flatMap(c => [c.question, c.answer]);

  // Split on whichever arrow style is the most common across all fields
  let arrow = ARROW_DELIMITERS[0];
  let bestCount = -1;
  for (const candidate of ARROW_DELIMITERS) {
    const count = lines.filter(l => l.includes(candidate)).length;
    if (count > bestCount) { bestCount = count; arrow = candidate; }
  }

  const repaired: FlashcardData[] = [];
  for (const line of lines) {
    const idx = line.indexOf(arrow);
    if (idx <= 0) continue;
    const question = line.slice(0, idx).trim();
    const answer = line.slice(idx + arrow.length).trim();
    if (question && answer) repaired.push({ question, answer });
  }
  return repaired.length / lines.length >= 0.6 ? repaired : null;
}

// Parses flashcards from raw text. Supports:
// - Anki .txt exports ("#separator:tab", "#html:true" directives, tags column)
// - Delimited formats: CSV, TSV, semicolon- or pipe-separated
// - Plain text fallback: consecutive lines as alternating question/answer pairs
export function parseFlashcardsText(raw: string): FlashcardData[] {
  // Strip a UTF-8 BOM if present and normalize line endings
  let text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
  if (!text) return [];

  // Read Anki-style "#key:value" directive lines at the top of the file
  let delimiter: string | undefined;
  let htmlContent = false;
  const lines = text.split('\n');
  let bodyStart = 0;
  while (bodyStart < lines.length && lines[bodyStart].startsWith('#')) {
    const directive = lines[bodyStart].slice(1);
    const colonIdx = directive.indexOf(':');
    if (colonIdx > 0) {
      const key = directive.slice(0, colonIdx).trim().toLowerCase();
      const value = directive.slice(colonIdx + 1).trim();
      if (key === 'separator') {
        delimiter = SEPARATOR_NAMES[value.toLowerCase()] ?? (value.length === 1 ? value : undefined);
      } else if (key === 'html') {
        htmlContent = value.toLowerCase() === 'true';
      }
    }
    bodyStart++;
  }
  const bodyLines = lines.slice(bodyStart).filter(l => l.trim().length > 0);
  if (bodyLines.length === 0) return [];
  text = bodyLines.join('\n');

  if (!delimiter) {
    delimiter = detectDelimiter(bodyLines);
  }

  // Arrow-style files ("question -> answer" per line) are split manually on
  // the first arrow of each line — quoting rules don't apply to this format.
  if (delimiter && ARROW_DELIMITERS.includes(delimiter)) {
    const arrow = delimiter;
    const clean = (value: string) => {
      const trimmed = value.trim();
      return htmlContent ? decodeHtml(trimmed) : trimmed;
    };
    const arrowCards: FlashcardData[] = [];
    for (const line of bodyLines) {
      const idx = line.indexOf(arrow);
      if (idx <= 0) continue;
      const question = clean(line.slice(0, idx));
      const answer = clean(line.slice(idx + arrow.length));
      if (question && answer) {
        arrowCards.push({ question, answer });
      }
    }
    if (arrowCards.length / bodyLines.length >= 0.6) {
      return arrowCards;
    }
    delimiter = undefined; // arrows were a false positive — use the fallback
  }

  if (delimiter) {
    const result = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: true });
    const rows = (result.data as string[][]).filter(row => row.some(cell => cell?.trim()));

    if (rows.length > 0) {
      const body = looksLikeHeaderRow(rows[0]) ? rows.slice(1) : rows;
      const clean = (value: string) => {
        const trimmed = value.trim();
        return htmlContent ? decodeHtml(trimmed) : trimmed;
      };
      const delimitedCards = body
        .filter(row => row.length >= 2 && row[0]?.trim() && row[1]?.trim())
        .map(row => ({
          question: clean(row[0]),
          // Only commas plausibly split an unquoted answer across cells;
          // for tab/semicolon/pipe files extra columns are metadata (Anki tags)
          answer: clean(delimiter === ',' ? row.slice(1).join(', ') : row[1]),
        }))
        .filter(card => card.question.length > 0 && card.answer.length > 0);

      // Trust the delimited parse if it produced cards for most rows
      if (body.length > 0 && delimitedCards.length / body.length >= 0.6) {
        // A stored CSV from a pre-arrow-support import may carry mispaired
        // arrow lines inside its cells — untangle those on the way out.
        return repairMispairedArrowCards(delimitedCards) ?? delimitedCards;
      }
    }
  }

  // Plain text fallback: alternating question/answer lines
  const alternating: FlashcardData[] = [];
  for (let i = 0; i < bodyLines.length - 1; i += 2) {
    const question = bodyLines[i].trim();
    const answer = bodyLines[i + 1].trim();
    if (question && answer) {
      alternating.push({ question, answer });
    }
  }
  return alternating;
}

export async function parseFlashcardsCsv(fileUri: string): Promise<FlashcardData[]> {
  try {
    const raw = await FileSystem.readAsStringAsync(fileUri);
    return parseFlashcardsText(raw);
  } catch (error) {
    console.error('Error parsing flashcards file:', error);
    return [];
  }
}
