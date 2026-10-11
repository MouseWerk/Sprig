import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { getAppLanguage } from '../utils/AppLanguage';
import { getCachedWidgetSnapshot, refreshCachedSnapshot, removeWidgetMapping } from '../utils/PinnedDeck';
import { renderPinnedDeckWidget } from './PinnedDeckWidget';

// Runs in a headless JS context spawned by Android's widget host, without the
// app UI. Each widget instance is pinned to its own deck via
// widget/WidgetConfigScreen.tsx (not a single global pin). On every update
// it first tries to recompute the due count from live deck data, so the
// number stays current between visits to Home; if the database isn't usable
// from this context it shows the last snapshot the app cached instead (see
// utils/PinnedDeck.ts). Tapping the widget is handled natively via
// clickAction="OPEN_URI" in PinnedDeckWidget.tsx (→ app/study.tsx), not here.
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
    if (props.widgetInfo.widgetName !== 'PinnedDeck') return;
    const { widgetId, width, height } = props.widgetInfo;

    switch (props.widgetAction) {
        case 'WIDGET_ADDED':
        case 'WIDGET_UPDATE':
        case 'WIDGET_RESIZED': {
            let snapshot = await refreshCachedSnapshot(widgetId).catch(() => undefined);
            if (snapshot === undefined) snapshot = await getCachedWidgetSnapshot(widgetId);
            props.renderWidget(renderPinnedDeckWidget(snapshot, width, height, await getAppLanguage()));
            break;
        }
        case 'WIDGET_DELETED':
            await removeWidgetMapping(widgetId);
            break;
        default:
            break;
    }
}
