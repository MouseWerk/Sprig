import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAppLanguage } from './AppLanguage';
import { countDueCards, Deck, dueCardIndices, getDecks } from './Storage';

// Each Android home-screen widget instance can be pinned to a different deck
// (picked via the widget's own configuration screen when it's added — see
// widget/WidgetConfigScreen.tsx). Every instance keeps a small per-widget
// AsyncStorage snapshot of what it shows. The running app refreshes those
// from live deck data (refreshAllPinnedWidgets — on Home focus and when a
// study session ends); the widget's own headless task handler tries the same
// live recompute on its periodic update and falls back to the cached
// snapshot if the database isn't usable in that context, so a widget never
// goes blank just because it woke up without the app (see
// refreshCachedSnapshot).

const WIDGET_DECK_MAP_KEY = 'sprig_widget_deck_map'; // Record<widgetId, deckId>
const WIDGET_SNAPSHOT_PREFIX = 'sprig_widget_snapshot_';

export interface WidgetSnapshot {
    deckId: string;
    deckName: string;
    deckIcon: string;
    dueCount: number;
    totalCards: number;
    masteryPercent: number;
}

async function getDeckMap(): Promise<Record<string, string>> {
    try {
        const raw = await AsyncStorage.getItem(WIDGET_DECK_MAP_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

async function setDeckMap(map: Record<string, string>): Promise<void> {
    await AsyncStorage.setItem(WIDGET_DECK_MAP_KEY, JSON.stringify(map));
}

function snapshotKey(widgetId: number): string {
    return `${WIDGET_SNAPSHOT_PREFIX}${widgetId}`;
}

export async function getDeckIdForWidget(widgetId: number): Promise<string | null> {
    const map = await getDeckMap();
    return map[String(widgetId)] ?? null;
}

// Reads the cached snapshot for one widget instance — safe to call from the
// widget's headless task handler (AsyncStorage-only, no live deck data).
export async function getCachedWidgetSnapshot(widgetId: number): Promise<WidgetSnapshot | null> {
    try {
        const raw = await AsyncStorage.getItem(snapshotKey(widgetId));
        return raw ? JSON.parse(raw) : null;
    } catch (err) {
        if (__DEV__) console.warn('[PinnedDeck] getCachedWidgetSnapshot failed', err);
        return null;
    }
}

function snapshotFromDeck(deck: Deck): WidgetSnapshot {
    const totalCards = deck.totalCards || 0;
    const learnedCount = deck.learnedIndices?.length || 0;
    return {
        deckId: deck.id,
        deckName: deck.name,
        deckIcon: deck.icon,
        dueCount: countDueCards(deck),
        totalCards,
        masteryPercent: totalCards > 0 ? Math.round((learnedCount / totalCards) * 100) : 0,
    };
}

async function buildSnapshotForDeck(deckId: string): Promise<WidgetSnapshot | null> {
    const decks = await getDecks();
    const deck = decks.find(d => d.id === deckId && d.type === 'csv');
    return deck ? snapshotFromDeck(deck) : null;
}

// Live refresh for the widget's own headless task handler (periodic
// WIDGET_UPDATE / resize), so the due count doesn't go stale between visits
// to Home. Recomputes from the database when it can and re-caches the result.
// Returns `undefined` when live data can't be trusted — the database threw
// in the headless context, or it came back with no decks at all, which is
// indistinguishable from a failed read — so the caller shows the last cached
// snapshot instead of blanking a widget whose deck still exists.
export async function refreshCachedSnapshot(widgetId: number): Promise<WidgetSnapshot | null | undefined> {
    const deckId = await getDeckIdForWidget(widgetId);
    if (!deckId) return null;

    let decks: Deck[];
    try {
        decks = await getDecks();
    } catch {
        return undefined;
    }
    if (decks.length === 0) return undefined;

    const deck = decks.find(d => d.id === deckId && d.type === 'csv');
    const snapshot = deck ? snapshotFromDeck(deck) : null;
    if (snapshot) await AsyncStorage.setItem(snapshotKey(widgetId), JSON.stringify(snapshot));
    else await AsyncStorage.removeItem(snapshotKey(widgetId));
    return snapshot;
}

// Only safe to call from the running app (live deck data + native widget
// module), never from the widget's own headless task handler.
async function cacheSnapshotForWidget(widgetId: number, deckId: string | null): Promise<WidgetSnapshot | null> {
    if (!deckId) {
        await AsyncStorage.removeItem(snapshotKey(widgetId));
        return null;
    }
    const snapshot = await buildSnapshotForDeck(deckId);
    if (snapshot) await AsyncStorage.setItem(snapshotKey(widgetId), JSON.stringify(snapshot));
    else await AsyncStorage.removeItem(snapshotKey(widgetId));
    return snapshot;
}

// Called from the widget's configuration screen once the user picks a deck
// for a newly-placed widget instance.
export async function setDeckIdForWidget(widgetId: number, deckId: string): Promise<WidgetSnapshot | null> {
    const map = await getDeckMap();
    map[String(widgetId)] = deckId;
    await setDeckMap(map);
    return cacheSnapshotForWidget(widgetId, deckId);
}

export async function removeWidgetMapping(widgetId: number): Promise<void> {
    const map = await getDeckMap();
    delete map[String(widgetId)];
    await setDeckMap(map);
    await AsyncStorage.removeItem(snapshotKey(widgetId));
}

// Recomputes every placed widget instance's snapshot from live data and
// pushes it to both AsyncStorage and the widget itself. Call this after
// finishing a study session or opening Home — cheap enough to run
// opportunistically.
export async function refreshAllPinnedWidgets(): Promise<void> {
    const map = await getDeckMap();
    const widgetIds = Object.keys(map);
    if (widgetIds.length === 0) return;

    try {
        const { requestWidgetUpdateById } = await import('react-native-android-widget');
        const { renderPinnedDeckWidget } = await import('../widget/PinnedDeckWidget');
        const language = await getAppLanguage();

        for (const widgetIdStr of widgetIds) {
            const widgetId = Number(widgetIdStr);
            const snapshot = await cacheSnapshotForWidget(widgetId, map[widgetIdStr]);
            await requestWidgetUpdateById({
                widgetName: 'PinnedDeck',
                widgetId,
                renderWidget: (info) => renderPinnedDeckWidget(snapshot, info.width, info.height, language),
                widgetNotFound: () => { removeWidgetMapping(widgetId).catch(() => { }); },
            });
        }
    } catch (err) {
        // Android-only / no widget placed yet — usually fine to ignore, but
        // log so a real native-module failure doesn't disappear silently.
        if (__DEV__) console.warn('[PinnedDeck] refreshAllPinnedWidgets failed', err);
    }
}

// Shows every placed widget as "pin a deck". Used before a full data wipe,
// which clears the widget map along with everything else: afterwards
// nothing could reach the widgets, and they kept showing the deleted deck.
export async function blankAllPinnedWidgets(): Promise<void> {
    const widgetIds = Object.keys(await getDeckMap());
    if (widgetIds.length === 0) return;
    try {
        const { requestWidgetUpdateById } = await import('react-native-android-widget');
        const { renderPinnedDeckWidget } = await import('../widget/PinnedDeckWidget');
        const language = await getAppLanguage();
        for (const widgetIdStr of widgetIds) {
            await requestWidgetUpdateById({
                widgetName: 'PinnedDeck',
                widgetId: Number(widgetIdStr),
                renderWidget: (info) => renderPinnedDeckWidget(null, info.width, info.height, language),
            });
        }
    } catch (err) {
        if (__DEV__) console.warn('[PinnedDeck] blankAllPinnedWidgets failed', err);
    }
}

// Computes a deck's due card indices right now, for starting a study session
// from a widget's tap. Returns null if the deck has vanished since the
// widget last showed it.
export async function buildDeckStudySession(deckId: string): Promise<{ deckId: string; deckName: string; uri: string; cardIndices: number[] } | null> {
    const decks = await getDecks();
    const deck = decks.find(d => d.id === deckId && d.type === 'csv');
    if (!deck) return null;

    const total = deck.totalCards || 0;
    const cardIndices = dueCardIndices(deck);
    // Nothing due — still open the deck itself so the tap isn't a dead end.
    if (cardIndices.length === 0) {
        for (let i = 0; i < total; i++) cardIndices.push(i);
    }
    return { deckId: deck.id, deckName: deck.name, uri: deck.uri, cardIndices };
}
