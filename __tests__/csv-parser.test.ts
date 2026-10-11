import { Buffer } from 'buffer';
import { decodeTextBytes, parseFlashcardsText, repairMispairedArrowCards } from '@/utils/CsvParser';

describe('parseFlashcardsText', () => {
    it('parses plain comma-separated pairs', () => {
        expect(parseFlashcardsText('cat,Katze\ndog,Hund')).toEqual([
            { question: 'cat', answer: 'Katze' },
            { question: 'dog', answer: 'Hund' },
        ]);
    });

    it('drops a header row it recognises', () => {
        const cards = parseFlashcardsText('Question,Answer\ncat,Katze\ndog,Hund');
        expect(cards).toHaveLength(2);
        expect(cards[0].question).toBe('cat');
    });

    it('handles a UTF-8 BOM and CRLF line endings', () => {
        expect(parseFlashcardsText('﻿cat,Katze\r\ndog,Hund')).toHaveLength(2);
    });

    it('follows an Anki #separator directive', () => {
        const cards = parseFlashcardsText('#separator:tab\n#html:false\ncat\tKatze\ndog\tHund');
        expect(cards).toEqual([
            { question: 'cat', answer: 'Katze' },
            { question: 'dog', answer: 'Hund' },
        ]);
    });

    it('decodes HTML when the directive says the fields contain it', () => {
        const cards = parseFlashcardsText('#separator:tab\n#html:true\ncat\t<b>Katze</b>&nbsp;(f)');
        expect(cards[0].answer).toBe('Katze (f)');
    });

    it('splits arrow-separated lines on the first arrow only', () => {
        const cards = parseFlashcardsText(
            'Capital of France -> Paris\nA -> B -> C\nCapital of Spain -> Madrid'
        );
        expect(cards[0]).toEqual({ question: 'Capital of France', answer: 'Paris' });
        expect(cards[1]).toEqual({ question: 'A', answer: 'B -> C' });
    });

    it('keeps commas inside an answer when the file is tab-separated', () => {
        const cards = parseFlashcardsText('#separator:tab\nterm\tone, two, three');
        expect(cards[0].answer).toBe('one, two, three');
    });

    it('falls back to alternating lines when there is no delimiter at all', () => {
        expect(parseFlashcardsText('cat\nKatze\ndog\nHund')).toEqual([
            { question: 'cat', answer: 'Katze' },
            { question: 'dog', answer: 'Hund' },
        ]);
    });

    it('returns nothing for empty or whitespace-only input', () => {
        expect(parseFlashcardsText('')).toEqual([]);
        expect(parseFlashcardsText('   \n  \n')).toEqual([]);
    });

    it('does not merge cards when an answer contains a stray quote', () => {
        // Papaparse would treat a leading quote as an opening quote and swallow
        // the following lines; quoting is disabled for tab files for that reason.
        const cards = parseFlashcardsText('#separator:tab\na\t"quoted\nb\tplain\nc\tthird');
        expect(cards).toHaveLength(3);
    });
});

describe('repairMispairedArrowCards', () => {
    it('untangles cards whose two fields are each a whole "q -> a" line', () => {
        const broken = [
            { question: 'cat -> Katze', answer: 'dog -> Hund' },
            { question: 'bird -> Vogel', answer: 'fish -> Fisch' },
        ];
        expect(repairMispairedArrowCards(broken)).toEqual([
            { question: 'cat', answer: 'Katze' },
            { question: 'dog', answer: 'Hund' },
            { question: 'bird', answer: 'Vogel' },
            { question: 'fish', answer: 'Fisch' },
        ]);
    });

    it('leaves a healthy deck alone', () => {
        const fine = [
            { question: 'cat', answer: 'Katze' },
            { question: 'dog', answer: 'Hund' },
        ];
        expect(repairMispairedArrowCards(fine)).toBeNull();
    });

    it('does nothing to a deck too small to judge', () => {
        expect(repairMispairedArrowCards([{ question: 'a -> b', answer: 'c -> d' }])).toBeNull();
    });

    it('cannot tell a real deck about reactions apart from a broken one', () => {
        // Documents the limit of the heuristic rather than a bug in it: a deck
        // whose content legitimately uses arrows on both sides looks exactly
        // like the mispairing it repairs. Storage.getCachedData therefore only
        // applies the repair to decks with no review history, so a false
        // positive here can never cost anyone their SRS progress.
        const chemistry = [
            { question: 'H2 + O2 -> ?', answer: 'H2 + O2 -> H2O' },
            { question: 'Na + Cl -> ?', answer: 'Na + Cl -> NaCl' },
            { question: 'C + O2 -> ?', answer: 'C + O2 -> CO2' },
        ];
        expect(repairMispairedArrowCards(chemistry)).not.toBeNull();
    });
});

// The deck files Sprig writes itself (Storage.cardsToCsv): every field quoted,
// rows joined with \n, and answers free to span several lines — Anki imports
// put each attached image on its own line, and multi-paragraph answers keep
// their blank line. The cache is rebuilt from this file after "Clear cache",
// a restored backup or a cache miss, so it has to read back card for card.
describe('reading back the app\'s own quoted CSV', () => {
    const csv = (cards: { question: string; answer: string }[]) =>
        cards.map(c => `"${c.question.replace(/"/g, '""')}","${c.answer.replace(/"/g, '""')}"`).join('\n');

    it('keeps multi-line answers together instead of splitting them into new cards', () => {
        const cards = [
            { question: 'Heart', answer: 'Pumps blood\n![img](cardimg/1_0.png)\nfour chambers' },
            { question: 'Lung', answer: 'Gas exchange\n![img](cardimg/1_1.png)\nalveoli' },
            { question: 'Liver', answer: 'Detox\n![img](cardimg/1_2.png)\nbile' },
        ];
        expect(parseFlashcardsText(csv(cards))).toEqual(cards);
    });

    it('keeps a blank line inside a quoted answer', () => {
        const cards = [
            { question: 'Two paragraphs', answer: 'First part.\n\nSecond part.' },
            { question: 'Plain', answer: 'One line' },
        ];
        expect(parseFlashcardsText(csv(cards))).toEqual(cards);
    });

    it('keeps escaped quotes and commas inside fields', () => {
        const cards = [
            { question: 'Say "hello", politely', answer: '"Guten Tag", sagte er' },
            { question: 'a', answer: 'b' },
        ];
        expect(parseFlashcardsText(csv(cards))).toEqual(cards);
    });
});

describe('HTML in Anki text exports', () => {
    it('decodes &amp; only once', () => {
        const cards = parseFlashcardsText('#separator:tab\n#html:true\nless than\t&amp;lt; is written as &lt;');
        expect(cards[0].answer).toBe('&lt; is written as <');
    });

    it('decodes numeric entities, including ones outside the BMP', () => {
        const cards = parseFlashcardsText('#separator:tab\n#html:true\nGreek\t&#945;&#x3B2; &#128512;');
        expect(cards[0].answer).toBe('αβ 😀');
    });
});

describe('decodeTextBytes', () => {
    it('reads UTF-8 as UTF-8', () => {
        expect(decodeTextBytes(Buffer.from('Größe;Mäßig\nÜbel;Ärger', 'utf8'))).toBe('Größe;Mäßig\nÜbel;Ärger');
    });

    it('falls back to Windows-1252 for an Excel CSV saved in a German locale', () => {
        // "Größe;Maß – „gut“" in Windows-1252: umlauts are Latin-1, the dash
        // and the German quotes live in the 0x80-0x9F block
        const bytes = Uint8Array.from([0x47, 0x72, 0xf6, 0xdf, 0x65, 0x3b, 0x4d, 0x61, 0xdf, 0x20, 0x96, 0x20, 0x84, 0x67, 0x75, 0x74, 0x93]);
        expect(decodeTextBytes(bytes)).toBe('Größe;Maß – „gut“');
        expect(parseFlashcardsText(decodeTextBytes(bytes))).toEqual([{ question: 'Größe', answer: 'Maß – „gut“' }]);
    });

    it('reads UTF-16 with a byte order mark', () => {
        const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Haus,house', 'utf16le')]);
        expect(decodeTextBytes(le)).toBe('Haus,house');
        const be = Buffer.from(le);
        for (let i = 0; i + 1 < be.length; i += 2) [be[i], be[i + 1]] = [be[i + 1], be[i]];
        expect(decodeTextBytes(be)).toBe('Haus,house');
    });

    it('keeps the UTF-8 BOM for the parser to strip', () => {
        const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('cat,Katze', 'utf8')]);
        expect(parseFlashcardsText(decodeTextBytes(withBom))).toEqual([{ question: 'cat', answer: 'Katze' }]);
    });
});
