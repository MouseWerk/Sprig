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

// Choose the most plausible delimiter by how consistently it appears across
// lines. Prose often contains commas, so tab/semicolon/pipe get priority.
function detectDelimiter(lines: string[]): string | undefined {
  const sample = lines.slice(0, 30);
  for (const candidate of ['\t', ';', '|', ',']) {
    const hits = sample.filter(l => l.includes(candidate)).length;
    if (hits / sample.length >= 0.6) return candidate;
  }
  return undefined;
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
        return delimitedCards;
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
