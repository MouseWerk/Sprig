import * as fs from 'fs';
import * as path from 'path';
import { Colors } from '@/constants/theme';

// Rules from the design guidelines that would otherwise creep back in: no
// colored bars on the left, no status-colored frames for states, colors
// from the theme tokens, and readable contrast in both themes.

const root = path.resolve(__dirname, '..');
const sources: { file: string; text: string }[] = [];
const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) sources.push({ file: path.relative(root, full), text: fs.readFileSync(full, 'utf8') });
    }
};
['app', 'components', 'widget'].forEach(d => walk(path.join(root, d)));

const offenders = (re: RegExp, allow: (file: string) => boolean = () => false) =>
    sources.flatMap(({ file, text }) =>
        allow(file) ? [] : text.split('\n').flatMap((line, i) => (re.test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : []))
    );

describe('design rules', () => {
    it('draw no colored bars on the left of anything', () => {
        expect(offenders(/border(Left|Start)(Width|Color)/)).toEqual([]);
    });

    it('never switch a border color with a state', () => {
        // Selected, active, playing and result states use a tinted
        // background and an icon or text weight, not a colored frame.
        expect(offenders(/borderColor: [^,}]*\?/)).toEqual([]);
    });

    it('take status colors from the theme instead of hard-coded values', () => {
        // The old Tailwind 500 shades failed contrast as text on white.
        // Sound tiles keep their own identity colors (content, not status).
        const legacy = /#(ef4444|22c55e|eab308|f59e0b|f97316|facc15|38bdf8|8b5cf6)\b/i;
        expect(offenders(legacy, file => file === path.join('components', 'SoundMixer.tsx'))).toEqual([]);
    });
});

// WCAG relative luminance contrast
function contrast(a: string, b: string): number {
    const lum = (hex: string) => {
        const [r, g, bl] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
            .map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

describe.each(['light', 'dark'] as const)('%s theme contrast', scheme => {
    const c = Colors[scheme];

    it.each(['text', 'mutedForeground', 'success', 'warning', 'danger', 'streak', 'info', 'tabIconDefault'] as const)(
        '%s is readable (AA) on the background and on secondary surfaces',
        token => {
            expect(contrast(c[token], c.background)).toBeGreaterThanOrEqual(4.5);
            expect(contrast(c[token], c.secondary)).toBeGreaterThanOrEqual(4.5);
        }
    );

    it('keeps button labels readable', () => {
        expect(contrast(c.primaryForeground, c.primary)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c.destructiveForeground, c.destructive)).toBeGreaterThanOrEqual(4.5);
    });
});
