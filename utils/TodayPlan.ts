import { getPrefsSync } from './Preferences';
import { Deck, getConfusionPairs, getDecks, getExamPlan } from './Storage';

// Builds the "Today" session: one cross-deck study queue that starts with
// every due card, tops up with exam-pace fillers, and sprinkles in cards the
// quizzes flagged as often-confused. The queue is grouped per deck and the
// swipe screen plays the decks back to back (via the drill mechanism).

export interface TodayDeckEntry {
    deckId: string;
    deckName: string;
    uri: string;
    cardIndices: number[];
}

export interface TodayPlan {
    entries: TodayDeckEntry[];
    totalCards: number;
    dueCount: number;
    examCount: number;
    trickyCount: number;
}

function isDue(deck: Deck, index: number, now: Date): boolean {
    const data = deck.srsData?.[index];
    if (!data) return true; // never-reviewed cards count as due
    return new Date(data.nextReview) <= now;
}

export async function buildTodayPlan(): Promise<TodayPlan> {
    const target = Math.max(5, getPrefsSync().dailyGoal);
    const now = new Date();
    const decks = (await getDecks()).filter(d => d.type === 'csv' && (d.totalCards || 0) > 0);

    const entries: TodayDeckEntry[] = [];
    let dueCount = 0;
    let examCount = 0;
    let trickyCount = 0;
    let total = 0;

    // Decks with the nearest exam first, then most due work first
    const ranked = decks
        .map(d => {
            const plan = getExamPlan(d);
            const due: number[] = [];
            for (let i = 0; i < (d.totalCards || 0); i++) {
                if (isDue(d, i, now)) due.push(i);
            }
            return { deck: d, plan, due };
        })
        .sort((a, b) => {
            const ax = a.plan && a.plan.daysLeft >= 0 ? a.plan.daysLeft : Infinity;
            const bx = b.plan && b.plan.daysLeft >= 0 ? b.plan.daysLeft : Infinity;
            if (ax !== bx) return ax - bx;
            return b.due.length - a.due.length;
        });

    for (const { deck, plan, due } of ranked) {
        if (total >= target) break;
        const picked = new Set<number>();

        // 1) Due cards, up to what's left of the target
        for (const i of due) {
            if (total >= target) break;
            picked.add(i);
            dueCount++;
            total++;
        }

        // 2) Exam pacing: if this deck has an upcoming exam and its due cards
        //    alone don't reach the daily pace, add unlearned not-yet-due cards.
        if (plan && plan.daysLeft >= 0 && !plan.onTrack) {
            const learned = new Set(deck.learnedIndices || []);
            const pace = Math.min(plan.cardsPerDay, target - total + picked.size);
            for (let i = 0; i < (deck.totalCards || 0) && picked.size < pace; i++) {
                if (total >= target) break;
                if (picked.has(i) || learned.has(i)) continue;
                picked.add(i);
                examCount++;
                total++;
            }
        }

        // 3) Tricky cards from quiz confusion pairs (small sprinkle)
        if (total < target) {
            const pairs = await getConfusionPairs(deck.id, 3);
            for (const p of pairs) {
                for (const i of [p.cardA, p.cardB]) {
                    if (total >= target) break;
                    if (i < 0 || i >= (deck.totalCards || 0) || picked.has(i)) continue;
                    picked.add(i);
                    trickyCount++;
                    total++;
                }
            }
        }

        if (picked.size > 0) {
            entries.push({
                deckId: deck.id,
                deckName: deck.name,
                uri: deck.uri,
                cardIndices: Array.from(picked).sort((a, b) => a - b),
            });
        }
    }

    return { entries, totalCards: total, dueCount, examCount, trickyCount };
}

// ---- Active session store ----------------------------------------------
// The plan lives in memory while the chained sessions run; the swipe screen
// pulls the next deck from here when a session finishes.

let activePlan: TodayDeckEntry[] = [];

export function startTodaySession(plan: TodayPlan): TodayDeckEntry | null {
    activePlan = [...plan.entries];
    return nextTodayEntry();
}

// Pops the next deck off the active plan (null when done)
export function nextTodayEntry(): TodayDeckEntry | null {
    return activePlan.shift() ?? null;
}

export function remainingTodayDecks(): number {
    return activePlan.length;
}

export function peekNextTodayEntry(): TodayDeckEntry | null {
    return activePlan[0] ?? null;
}

export function clearTodaySession(): void {
    activePlan = [];
}
