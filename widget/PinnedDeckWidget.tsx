import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { WidgetSnapshot } from '../utils/PinnedDeck';

// Single-row (1x-height, resizable width) home-screen widget showing the
// pinned deck's due count. Tapping it opens Sprig straight into a study
// session for that deck (see the `sprig://study` handling in app/_layout.tsx).
// Kept deliberately plain — RemoteViews can't render the app's SVG line-art,
// so this leans on the same slate/text-only monochrome look instead of
// trying to approximate it.

const BG = '#f1f5f9';
const TEXT = '#0f172a';
const MUTED = '#64748b';
const DUE = '#ef4444';

export function PinnedDeckWidget({ snapshot }: { snapshot: WidgetSnapshot | null }) {
    if (!snapshot) {
        return (
            <FlexWidget
                clickAction="OPEN_APP"
                style={{
                    height: 'match_parent',
                    width: 'match_parent',
                    backgroundColor: BG,
                    borderRadius: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingLeft: 16,
                    paddingRight: 16,
                }}
            >
                <TextWidget
                    text="Pin a deck in Sprig to see it here"
                    style={{ fontSize: 13, color: MUTED, fontWeight: '600' }}
                />
            </FlexWidget>
        );
    }

    const subtitle = snapshot.dueCount > 0 ? `${snapshot.dueCount} due` : 'All caught up';

    return (
        <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: 'sprig://study' }}
            style={{
                height: 'match_parent',
                width: 'match_parent',
                backgroundColor: BG,
                borderRadius: 20,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingLeft: 16,
                paddingRight: 16,
            }}
        >
            <FlexWidget style={{ flex: 1, overflow: 'hidden' }}>
                <TextWidget
                    text={snapshot.deckName}
                    truncate="END"
                    maxLines={1}
                    style={{ fontSize: 15, fontWeight: '800', color: TEXT }}
                />
            </FlexWidget>
            <TextWidget
                text={subtitle}
                style={{ fontSize: 13, fontWeight: '700', color: snapshot.dueCount > 0 ? DUE : MUTED, marginLeft: 12 }}
            />
        </FlexWidget>
    );
}

export function renderPinnedDeckWidget(snapshot: WidgetSnapshot | null) {
    return <PinnedDeckWidget snapshot={snapshot} />;
}
