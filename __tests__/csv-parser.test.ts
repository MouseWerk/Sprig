import { parseFlashcardsText, repairMispairedArrowCards } from '@/utils/CsvParser';

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
