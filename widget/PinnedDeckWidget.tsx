'use no memo';

import React from 'react';
import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { Language, TranslationKey } from '../constants/translations';
import { plural, translate } from '../utils/AppLanguage';
import { WidgetSnapshot } from '../utils/PinnedDeck';
import { getDeckIconSvg } from './deckIcons';

// Single-row (1x-height, resizable width) home-screen widget showing the
// pinned deck's due count. Tapping it opens Sprig straight into a study
// session for that deck (see the `sprig://study` handling in app/_layout.tsx).
// Mirrors the deck-card look from app/(tabs)/decks.tsx (icon, card count,
// mastery bar) using the same monochrome slate palette, since RemoteViews
// can't render the app's own components directly.

const BG = '#f1f5f9';
const ICON_BG = '#e2e8f0';
const TEXT = '#0f172a';
const MUTED = '#64748b';
const DUE = '#ef4444';
const TRACK = '#e2e8f0';

function masteryColorFor(percent: number): `#${string}` {
    if (percent === 0) return DUE;
    if (percent < 30) return '#f97316';
    if (percent < 60) return '#eab308';
    if (percent < 100) return TEXT;
    return '#22c55e';
}

interface PinnedDeckWidgetProps {
    snapshot: WidgetSnapshot | null;
    width?: number;
    height?: number;
    // The widget renders outside the app's LanguageProvider; callers pass
    // the app language (utils/AppLanguage.getAppLanguage).
    language?: Language;
}

// Below this, the full card (name row + cards/mastery row + progress bar)
// gets too cramped to read — fall back to just the icon and due count so the
// widget still works shrunk all the way down to a 1x1 cell.
const COMPACT_WIDTH_THRESHOLD = 140;
const COMPACT_HEIGHT_THRESHOLD = 70;

export function PinnedDeckWidget({ snapshot, width, height, language = 'en' }: PinnedDeckWidgetProps) {
    const t = (key: TranslationKey) => translate(language, key);
    const isCompact = (width !== undefined && width < COMPACT_WIDTH_THRESHOLD)
        || (height !== undefined && height < COMPACT_HEIGHT_THRESHOLD);

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
                    paddingLeft: isCompact ? 6 : 16,
                    paddingRight: isCompact ? 6 : 16,
                }}
            >
                {isCompact ? (
                    <TextWidget text="+" style={{ fontSize: 20, color: MUTED, fontWeight: '700' }} />
                ) : (
                    <TextWidget
                        text={t('widgetEmpty')}
                        style={{ fontSize: 13, color: MUTED, fontWeight: '600' }}
                    />
                )}
            </FlexWidget>
        );
    }

    const masteryColor = masteryColorFor(snapshot.masteryPercent);

    if (isCompact) {
        return (
            <FlexWidget
                clickAction="OPEN_URI"
                clickActionData={{ uri: `sprig://study?deckId=${encodeURIComponent(snapshot.deckId)}` }}
                style={{
                    height: 'match_parent',
                    width: 'match_parent',
                    backgroundColor: BG,
                    borderRadius: 16,
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <FlexWidget
                    style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        backgroundColor: ICON_BG,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <SvgWidget svg={getDeckIconSvg(snapshot.deckIcon, TEXT)} style={{ width: 16, height: 16 }} />
                </FlexWidget>
                {snapshot.dueCount > 0 && (
                    <TextWidget
                        text={`${snapshot.dueCount}`}
                        style={{ fontSize: 12, fontWeight: '800', color: DUE, marginTop: 2 }}
                    />
                )}
            </FlexWidget>
        );
    }

    const subtitle = snapshot.dueCount > 0 ? t('homeDueCount').replace('{n}', String(snapshot.dueCount)) : t('widgetAllCaughtUp');

    return (
        <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: `sprig://study?deckId=${encodeURIComponent(snapshot.deckId)}` }}
            style={{
                height: 'match_parent',
                width: 'match_parent',
                backgroundColor: BG,
                borderRadius: 20,
                flexDirection: 'column',
                justifyContent: 'center',
                paddingLeft: 14,
                paddingRight: 14,
                paddingTop: 10,
                paddingBottom: 10,
            }}
        >
            <FlexWidget
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: 'match_parent',
                }}
            >
                <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flex: 1, overflow: 'hidden' }}>
                    <FlexWidget
                        style={{
                            width: 32,
                            height: 32,
                            borderRadius: 9,
                            backgroundColor: ICON_BG,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 10,
                        }}
                    >
                        <SvgWidget svg={getDeckIconSvg(snapshot.deckIcon, TEXT)} style={{ width: 18, height: 18 }} />
                    </FlexWidget>
                    <TextWidget
                        text={snapshot.deckName}
                        truncate="END"
                        maxLines={1}
                        style={{ fontSize: 15, fontWeight: '800', color: TEXT }}
                    />
                </FlexWidget>
                <TextWidget
                    text={subtitle}
                    style={{ fontSize: 12, fontWeight: '700', color: snapshot.dueCount > 0 ? DUE : MUTED, marginLeft: 8 }}
                />
            </FlexWidget>

            <FlexWidget
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: 'match_parent',
                    marginTop: 10,
                }}
            >
                <TextWidget text={plural(t, snapshot.totalCards, 'cardsCountOne', 'deckDetailsCardsCount')} style={{ fontSize: 11, fontWeight: '600', color: MUTED }} />
                <TextWidget
                    text={t('widgetMastery').replace('{n}', String(snapshot.masteryPercent))}
                    style={{ fontSize: 11, fontWeight: '700', color: masteryColor }}
                />
            </FlexWidget>

            <FlexWidget
                style={{
                    flexDirection: 'row',
                    width: 'match_parent',
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: TRACK,
                    overflow: 'hidden',
                    marginTop: 6,
                }}
            >
                <FlexWidget style={{ width: 0, flex: snapshot.masteryPercent, height: 4, backgroundColor: masteryColor }} />
                <FlexWidget style={{ width: 0, flex: 100 - snapshot.masteryPercent, height: 4 }} />
            </FlexWidget>
        </FlexWidget>
    );
}

export function renderPinnedDeckWidget(snapshot: WidgetSnapshot | null, width?: number, height?: number, language: Language = 'en') {
    return <PinnedDeckWidget snapshot={snapshot} width={width} height={height} language={language} />;
}
