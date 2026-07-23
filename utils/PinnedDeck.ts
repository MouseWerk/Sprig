import AsyncStorage from '@react-native-async-storage/async-storage';
import { Deck, getDecks } from './Storage';

// The Android home-screen widget shows one "pinned" deck's due count. The
// widget's task handler runs in a headless JS context where native modules
// like expo-sqlite aren't reliably available, so it never touches Storage.ts
// directly — it only reads a small AsyncStorage snapshot that the main app
// keeps fresh (see refreshWidgetSnapshot). This keeps the widget side of the
// app dependency-free and safe to run headless.

const PINNED_DECK_ID_KEY = 'sprig_pinned_widget_deck_id';
const WIDGET_SNAPSHOT_KEY = 'sprig_widget_snapshot';

export interface WidgetSnapshot {
    deckId: string;
    deckName: string;
    dueCount: number;
    totalCards: number;
}

export async function getPinnedDeckId(): Promise<string | null> {
    try {
        return await AsyncStorage.getItem(PINNED_DECK_ID_KEY);
    } catch {
        return null;
    }
}

export async function setPinnedDeckId(deckId: string | null): Promise<void> {
    try {
        if (deckId === null) await AsyncStorage.removeItem(PINNED_DECK_ID_KEY);
        else await AsyncStorage.setItem(PINNED_DECK_ID_KEY, deckId);
    } catch {
        // best effort — widget will just show its empty state
    }
    await refreshWidgetSnapshot();
}

export async function getWidgetSnapshot(): Promise<WidgetSnapshot | null> {
    try {
        const raw = await AsyncStorage.getItem(WIDGET_SNAPSHOT_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function dueCountFor(deck: Deck): number {
    const now = new Date();
    const total = deck.totalCards || 0;
    let due = 0;
    for (let i = 0; i < total; i++) {
        const data = deck.srsData?.[i];
        if (!data || new Date(data.nextReview) <= now) due++;
    }
    return due;
}

// Recomputes the pinned deck's snapshot from live data and pushes it to
// AsyncStorage (and the widget itself, if one is placed). Call this after
// pinning/unpinning a deck, finishing a study session, or opening Home —
// cheap enough to run opportunistically.
export async function refreshWidgetSnapshot(): Promise<void> {
    try {
        const deckId = await getPinnedDeckId();
        if (!deckId) {
            await AsyncStorage.removeItem(WIDGET_SNAPSHOT_KEY);
            return;
        }
        const decks = await getDecks();
        const deck = decks.find(d => d.id === deckId && d.type === 'csv');
        if (!deck) {
            await AsyncStorage.removeItem(WIDGET_SNAPSHOT_KEY);
            return;
        }
        const snapshot: WidgetSnapshot = {
            deckId: deck.id,
            deckName: deck.name,
            dueCount: dueCountFor(deck),
            totalCards: deck.totalCards || 0,
        };
        await AsyncStorage.setItem(WIDGET_SNAPSHOT_KEY, JSON.stringify(snapshot));
    } catch {
        // widget just shows stale/empty state until the next successful refresh
    }

    try {
        // Native module — only safe to call from the running app, never from
        // the widget's own headless task handler.
        const { requestWidgetUpdate } = await import('react-native-android-widget');
        const { renderPinnedDeckWidget } = await import('../widget/PinnedDeckWidget');
        const snapshot = await getWidgetSnapshot();
        await requestWidgetUpdate({
            widgetName: 'PinnedDeck',
            renderWidget: () => renderPinnedDeckWidget(snapshot),
        });
    } catch {
        // Android-only / no widget placed yet — fine to ignore.
    }
}

// Computes the pinned deck's due card indices right now, for starting a
// study session from the widget's "open app" tap. Returns null if there's
// no pinned deck or it has vanished since the widget last showed it.
export async function buildPinnedDeckSession(): Promise<{ deckId: string; deckName: string; uri: string; cardIndices: number[] } | null> {
    const deckId = await getPinnedDeckId();
    if (!deckId) return null;
    const decks = await getDecks();
    const deck = decks.find(d => d.id === deckId && d.type === 'csv');
    if (!deck) return null;

    const now = new Date();
    const total = deck.totalCards || 0;
    const cardIndices: number[] = [];
    for (let i = 0; i < total; i++) {
        const data = deck.srsData?.[i];
        if (!data || new Date(data.nextReview) <= now) cardIndices.push(i);
    }
    // Nothing due — still open the deck itself so the tap isn't a dead end.
    if (cardIndices.length === 0) {
        for (let i = 0; i < total; i++) cardIndices.push(i);
    }
    return { deckId: deck.id, deckName: deck.name, uri: deck.uri, cardIndices };
}
