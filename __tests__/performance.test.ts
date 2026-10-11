import { filterDeckCards } from '@/utils/CardFilter';
import { parseFlashcardsText } from '@/utils/CsvParser';
import { dueCardIndices } from '@/utils/Storage';

// Budgets for the paths that scale with deck size. Each takes the best of a
// few runs to keep noise out, prints what it measured, and allows generous
// headroom (CI machines and phones are slower than this one); a regression
// to the quadratic versions these replaced blows through them by far.
function best(runs: number, fn: () => void): number {
    let min = Infinity;
    for (let i = 0; i < runs; i++) {
        const start = performance.now();
        fn();
        min = Math.min(min, performance.now() - start);
    }
    return min;
}

const N = 20000;

describe('performance budgets', () => {
    it('parses a 20,000-row CSV with a stray quote in its first line', () => {
        // Was 4.2 s: the quote-aware record join recounted the growing record
        const text = ['5" screen,display', ...Array.from({ length: N }, (_, i) => `question ${i},answer ${i}`)].join('\n');
        const ms = best(3, () => expect(parseFlashcardsText(text)).toHaveLength(N + 1));
        console.log(`CSV with stray quote, ${N} rows: ${ms.toFixed(1)} ms`);
        expect(ms).toBeLessThan(500);
    });

    it('parses 20,000 quoted cards with multi-line answers', () => {
        const text = Array.from({ length: N }, (_, i) => `"q ${i}","line one\nline two ${i}"`).join('\n');
        const ms = best(3, () => expect(parseFlashcardsText(text)).toHaveLength(N));
        console.log(`Quoted multi-line CSV, ${N} rows: ${ms.toFixed(1)} ms`);
        expect(ms).toBeLessThan(800);
    });

    it('filters a 20,000-card deck per keystroke', () => {
        // Was cards × learned Array.includes calls per keystroke
        const cards = Array.from({ length: N }, (_, i) => ({ question: `Frage ${i}`, answer: `Antwort ${i}` }));
        const learned = Array.from({ length: N / 2 }, (_, i) => i * 2);
        const unsure = Array.from({ length: N / 4 }, (_, i) => i * 4 + 1);
        const ms = best(3, () => {
            filterDeckCards(cards, learned, unsure, 'frage 1', 'new');
            filterDeckCards(cards, learned, unsure, '', 'learned');
        });
        console.log(`Deck filter, ${N} cards: ${ms.toFixed(1)} ms`);
        expect(ms).toBeLessThan(150);
    });

    it('counts due cards in a 20,000-card deck', () => {
        const now = new Date();
        const srsData: Record<number, { interval: number; repetition: number; easeFactor: number; nextReview: string }> = {};
        for (let i = 0; i < N; i += 2) {
            srsData[i] = { interval: 3, repetition: 2, easeFactor: 2.5, nextReview: new Date(now.getTime() + ((i % 7) - 3) * 86400000).toISOString() };
        }
        const ms = best(3, () => dueCardIndices({ totalCards: N, srsData }, now));
        console.log(`Due count, ${N} cards: ${ms.toFixed(1)} ms`);
        expect(ms).toBeLessThan(250);
    });
});

describe('filterDeckCards', () => {
    const cards = [
        { question: 'Hauptstadt von ==Spanien==', answer: 'Madrid' },
        { question: 'Hauptstadt von Frankreich', answer: 'Paris\n![img](cardimg/1_0.png)' },
        { question: 'Fluss', answer: 'Rhein' },
    ];

    it('searches what the user sees, not the markup', () => {
        expect(filterDeckCards(cards, [], [], 'spanien', 'all').map(c => c.originalIndex)).toEqual([0]);
        expect(filterDeckCards(cards, [], [], 'cardimg', 'all')).toEqual([]);
    });

    it('applies the mastery filter and keeps original indices', () => {
        expect(filterDeckCards(cards, [2], [1], '', 'learned').map(c => c.originalIndex)).toEqual([2]);
        expect(filterDeckCards(cards, [2], [1], '', 'unsure').map(c => c.originalIndex)).toEqual([1]);
        expect(filterDeckCards(cards, [2], [1], '', 'new').map(c => c.originalIndex)).toEqual([0]);
        expect(filterDeckCards(cards, [2], [1], 'hauptstadt', 'all').map(c => c.originalIndex)).toEqual([0, 1]);
    });
});
