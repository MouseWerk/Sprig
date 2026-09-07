import { checkAnswer, levenshtein, normalizeAnswer } from '@/utils/Fuzzy';

describe('normalizeAnswer', () => {
    it('ignores case, accents, punctuation and stray whitespace', () => {
        expect(normalizeAnswer('  Café,   THE  ')).toBe('cafe the');
        expect(normalizeAnswer('¿Dónde está?')).toBe('donde esta');
        expect(normalizeAnswer('straße')).toBe('straße'); // ß is a letter, kept
    });

    it('collapses an empty or punctuation-only answer to an empty string', () => {
        expect(normalizeAnswer('   ')).toBe('');
        expect(normalizeAnswer('!!!')).toBe('');
    });
});

describe('levenshtein', () => {
    it('is zero for identical strings and symmetric otherwise', () => {
        expect(levenshtein('kitten', 'kitten')).toBe(0);
        expect(levenshtein('kitten', 'sitting')).toBe(3);
        expect(levenshtein('sitting', 'kitten')).toBe(3);
    });

    it('degenerates to the other string length when one side is empty', () => {
        expect(levenshtein('', 'abc')).toBe(3);
        expect(levenshtein('abc', '')).toBe(3);
        expect(levenshtein('', '')).toBe(0);
    });
});

describe('checkAnswer', () => {
    it('accepts an exact match regardless of case and punctuation', () => {
        expect(checkAnswer('the library', 'The Library!')).toBe('exact');
    });

    it('rejects an empty answer outright', () => {
        expect(checkAnswer('', 'anything')).toBe('wrong');
        expect(checkAnswer('   ', 'anything')).toBe('wrong');
    });

    it('allows more typos the longer the expected answer is', () => {
        // <= 3 characters: no tolerance at all
        expect(checkAnswer('cta', 'cat')).toBe('wrong');
        // <= 8 characters: one edit
        expect(checkAnswer('librari', 'library')).toBe('close');
        expect(checkAnswer('librrari', 'library')).toBe('wrong');
        // longer: up to three edits
        expect(checkAnswer('adrenal insuficiency', 'adrenal insufficiency')).toBe('close');
    });

    it('does not let tolerance swallow a genuinely different short answer', () => {
        expect(checkAnswer('dog', 'cat')).toBe('wrong');
    });
});
