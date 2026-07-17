import { Platform } from 'react-native';

const tintColorLight = '#0f172a';
const tintColorDark = '#f8fafc';

export const Colors = {
  light: {
    text: '#0f172a', // slate-900
    background: '#ffffff',
    tint: tintColorLight,
    icon: '#64748b', // slate-500
    tabIconDefault: '#94a3b8', // slate-400
    tabIconSelected: tintColorLight,

    // Shadcn-like tokens
    card: '#ffffff',
    cardForeground: '#0f172a',
    popover: '#ffffff',
    popoverForeground: '#0f172a',
    primary: '#0f172a',
    primaryForeground: '#ffffff',
    secondary: '#f1f5f9',
    secondaryForeground: '#0f172a',
    muted: '#f1f5f9',
    mutedForeground: '#64748b',
    accent: '#f1f5f9',
    accentForeground: '#0f172a',
    destructive: '#ef4444',
    destructiveForeground: '#f8fafc',
    border: '#e2e8f0',
    input: '#e2e8f0',
    ring: '#0f172a',
  },
  dark: {
    text: '#f8fafc', // slate-50
    background: '#020617', // slate-950
    tint: tintColorDark,
    icon: '#94a3b8', // slate-400
    tabIconDefault: '#475569', // slate-600
    tabIconSelected: tintColorDark,

    // Shadcn-like tokens
    // card sits one step above the near-black background so cards read as
    // elevated in dark mode (shadows are invisible on dark).
    card: '#0f172a',
    cardForeground: '#f8fafc',
    popover: '#0f172a',
    popoverForeground: '#f8fafc',
    primary: '#f8fafc',
    primaryForeground: '#0f172a',
    secondary: '#1e293b',
    secondaryForeground: '#f8fafc',
    muted: '#1e293b',
    mutedForeground: '#94a3b8',
    accent: '#1e293b',
    accentForeground: '#f8fafc',
    destructive: '#7f1d1d',
    destructiveForeground: '#f8fafc',
    border: '#1e293b',
    input: '#1e293b',
    ring: '#f8fafc',
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
