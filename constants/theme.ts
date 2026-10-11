import { Platform } from 'react-native';

const tintColorLight = '#0f172a';
const tintColorDark = '#f8fafc';

export const Colors = {
  light: {
    text: '#0f172a', // slate-900
    background: '#ffffff',
    tint: tintColorLight,
    icon: '#64748b', // slate-500
    tabIconDefault: '#5b6b7f', // inactive tab icon + label: AA on white
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
    // slate-500 darkened a step: muted text on secondary/muted surfaces
    // (cards, chips) has to reach WCAG AA (4.5:1), which #64748b missed.
    mutedForeground: '#5b6b7f',
    accent: '#f1f5f9',
    accentForeground: '#0f172a',
    // white on it reaches 4.5:1 (#ef4444 only managed 3.8:1)
    destructive: '#dc2626',
    destructiveForeground: '#ffffff',
    border: '#e2e8f0',
    input: '#e2e8f0',
    ring: '#0f172a',

    // Status colors for icons, small text, fills and 12 % tints — never for
    // frames around selected or current items (see design rules). Each
    // reaches 4.5:1 on background and on secondary in its theme.
    success: '#15803d',
    warning: '#b45309',
    danger: '#b91c1c',
    streak: '#c2410c',
    info: '#0369a1',
    // Highlighter marker behind ==highlighted== words; text on it is black
    highlight: '#facc15',
  },
  dark: {
    text: '#f8fafc', // slate-50
    background: '#020617', // slate-950
    tint: tintColorDark,
    icon: '#94a3b8', // slate-400
    tabIconDefault: '#94a3b8', // slate-400: AA on the near-black background
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

    success: '#4ade80',
    warning: '#fbbf24',
    danger: '#f87171',
    streak: '#fb923c',
    info: '#38bdf8',
    highlight: '#facc15',
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
