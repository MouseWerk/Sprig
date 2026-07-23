import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { getWidgetSnapshot } from '../utils/PinnedDeck';
import { renderPinnedDeckWidget } from './PinnedDeckWidget';

// Runs in a headless JS context spawned by Android's widget host — no
// guarantee expo-sqlite or other native modules are initialized here, so
// this only ever reads the small AsyncStorage snapshot the main app keeps
// fresh (see utils/PinnedDeck.ts). Tapping the widget is handled natively
// via clickAction="OPEN_URI" in PinnedDeckWidget.tsx, not through this file.
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
    if (props.widgetInfo.widgetName !== 'PinnedDeck') return;

    switch (props.widgetAction) {
        case 'WIDGET_ADDED':
        case 'WIDGET_UPDATE':
        case 'WIDGET_RESIZED': {
            const snapshot = await getWidgetSnapshot();
            props.renderWidget(renderPinnedDeckWidget(snapshot));
            break;
        }
        default:
            break;
    }
}
