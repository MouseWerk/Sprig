import 'expo-router/entry';
import { registerWidgetConfigurationScreen, registerWidgetTaskHandler } from 'react-native-android-widget';
import { WidgetConfigScreen } from './widget/WidgetConfigScreen';
import { widgetTaskHandler } from './widget/widget-task-handler';

registerWidgetTaskHandler(widgetTaskHandler);
registerWidgetConfigurationScreen(WidgetConfigScreen);
