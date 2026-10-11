import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer';
import Papa from 'papaparse';
import { decodeEntities } from './AnkiParse';

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
  return decodeEntities(
    text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(div|p|li)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Delimiters that split "question DELIM answer" on a single line rather than
// acting as CSV cell separators (e.g. "Capital of France -> Paris").
const ARROW_DELIMITERS = ['->', '=>', '→'];

// Rows that are fully quoted ("...","...") — the shape of app- and
// Anki-written CSV. [\s\S] because a record may span several lines.
const QUOTED_ROW_RE = /^\s*"[\s\S]*"\s*$/;

function isQuotedCsv(records: string[]): boolean {
  return records.length > 0 && records.filter(r => QUOTED_ROW_RE.test(r)).length / records.length >= 0.6;
}

// Logical records of a quoted CSV: a line that leaves a double-quoted field
// open continues on the next line (RFC 4180 multi-line cells). Sprig's own
// deck files look like this whenever an answer spans lines — every attached
// image sits on its own line — so judging the format line by line would see
// a continuation line without a delimiter and fall back to pairing up
// alternate lines, scrambling the deck when its cache is rebuilt.
function joinQuotedRecords(lines: string[]): string[] {
  const records: string[] = [];
  let open: string | null = null;
  for (const line of lines) {
    open = open === null ? line : `${open}\n${line}`;
    if ((open.match(/"/g)?.length ?? 0) % 2 === 0) {
      records.push(open);
      open = null;
    }
  }
  // An unterminated quote is a stray character, not a multi-line cell
  if (open !== null) records.push(...open.split('\n'));
  return records;
}

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

  const quotedCsv = isQuotedCsv(sample);
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
  const rawBodyLines = lines.slice(bodyStart);
  const bodyLines = rawBodyLines.filter(l => l.trim().length > 0);
  if (bodyLines.length === 0) return [];
  // Blank lines are dropped for line-based detection only: inside a quoted
  // cell they are content (a paragraph break) and must reach the CSV parser.
  text = rawBodyLines.join('\n');

  if (!delimiter) {
    const records = joinQuotedRecords(rawBodyLines).filter(r => r.trim().length > 0);
    delimiter = detectDelimiter(isQuotedCsv(records) ? records : bodyLines);
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
    // Anki's plain-text export never uses CSV-style quoting — a literal `"`
    // anywhere in a field (e.g. a quoted term in an answer) is just a
    // character, not a cell delimiter. Papaparse defaults to treating a
    // leading `"` as an opening quote, and if that quote is never properly
    // closed (no matching `"` immediately before the next delimiter), it
    // keeps consuming subsequent lines as part of the same field — silently
    // merging many cards into one and shrinking the total card count. Only
    // genuine CSV (comma-delimited) relies on quoting to embed delimiters/
    // newlines inside a field, so keep quote handling there and disable it
    // for tab/semicolon/pipe/Anki-style files.
    const quoteChar = delimiter === ',' ? '"' : '\0';
    const result = Papa.parse<string[]>(text, { delimiter, quoteChar, skipEmptyLines: true });
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

// Windows-1252 code points for bytes 0x80-0x9F (the only range where it
// differs from Latin-1); undefined slots map straight through.
const CP1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];

// Decodes an imported text file. Spreadsheet apps on Windows (Excel's
// "CSV" in German locales above all) save in Windows-1252, and some tools
// write UTF-16 with a BOM; reading every file as UTF-8 turned their umlauts
// into replacement characters. UTF-8 is still tried first and wins whenever
// the bytes are valid UTF-8.
export function decodeTextBytes(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString('utf16le', 2);
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    for (let i = 0; i + 1 < swapped.length; i += 2) {
      const b = swapped[i];
      swapped[i] = swapped[i + 1];
      swapped[i + 1] = b;
    }
    return swapped.toString('utf16le');
  }
  const utf8 = buf.toString('utf8');
  // U+FFFD only appears when decoding failed, unless the file really
  // contains one (EF BF BD)
  if (!utf8.includes('\ufffd') || buf.indexOf(Buffer.from([0xef, 0xbf, 0xbd])) >= 0) {
    return utf8;
  }
  let out = '';
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    out += String.fromCharCode(b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80] : b);
  }
  return out;
}

export async function parseFlashcardsCsv(fileUri: string): Promise<FlashcardData[]> {
  try {
    const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
    const raw = decodeTextBytes(Buffer.from(base64, 'base64'));
    return parseFlashcardsText(raw);
  } catch (error) {
    console.error('Error parsing flashcards file:', error);
    return [];
  }
}
