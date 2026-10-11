import { toDisplayText } from './CardText';

export type CardFilterMode = 'all' | 'learned' | 'unsure' | 'new';

export interface IndexedCard<T> {
    card: T;
    originalIndex: number;
}

// The deck details list: cards matching the search text (in what the user
// sees, markup stripped) and the mastery filter. Learned/unsure are looked
// up in sets; the old Array.includes per card made every keystroke in the
// search field O(cards × learned), hundreds of milliseconds on a big deck.
export function filterDeckCards<T extends { question: string; answer: string }>(
    cards: T[],
    learnedIndices: number[] | undefined,
    unsureIndices: number[] | undefined,
    query: string,
    mode: CardFilterMode
): IndexedCard<T>[] {
    const learned = new Set(learnedIndices ?? []);
    const unsure = new Set(unsureIndices ?? []);
    const q = query.trim().toLowerCase();
    const out: IndexedCard<T>[] = [];
    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        if (q && !toDisplayText(card.question).toLowerCase().includes(q) && !toDisplayText(card.answer).toLowerCase().includes(q)) {
            continue;
        }
        const isLearned = learned.has(i);
        const isUnsure = unsure.has(i);
        const keep = mode === 'learned' ? isLearned
            : mode === 'unsure' ? isUnsure
                : mode === 'new' ? !isLearned && !isUnsure
                    : true;
        if (keep) out.push({ card, originalIndex: i });
    }
    return out;
}
