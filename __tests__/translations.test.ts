import * as fs from 'fs';
import * as path from 'path';
import { translations } from '@/constants/translations';

// Guards for the UI text rules: both catalogs complete and in step, German
// typography and the "du" address, no emoji, and no screen-reader label
// left outside the catalogs.

const en = translations.en as Record<string, string>;
const de = translations.de as Record<string, string>;
const placeholders = (s: string) => (s.match(/\{\w+\}/g) || []).sort().join(',');
// © and ™ are typography, not emoji
const EMOJI = /(?![©®™])\p{Extended_Pictographic}/u;

describe('translation catalogs', () => {
    it('have the same keys and no empty texts', () => {
        expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
        for (const [key, value] of [...Object.entries(en), ...Object.entries(de)]) {
            expect({ key, empty: value.trim() === '' }).toEqual({ key, empty: false });
        }
    });

    it('use the same placeholders in both languages', () => {
        for (const key of Object.keys(en)) {
            expect({ key, de: placeholders(de[key]) }).toEqual({ key, de: placeholders(en[key]) });
        }
    });

    it('write the ellipsis as one character, directly after the word', () => {
        for (const [key, value] of [...Object.entries(en), ...Object.entries(de)]) {
            expect({ key, threeDots: value.includes('...'), spaceBefore: / …/.test(value) })
                .toEqual({ key, threeDots: false, spaceBefore: false });
        }
    });

    it('use German quotation marks and the informal address in German', () => {
        for (const [key, value] of Object.entries(de)) {
            expect({ key, straightQuotes: value.includes('"') }).toEqual({ key, straightQuotes: false });
            expect({ key, formal: /\b(Sie|Ihnen|Ihre[mnrs]?)\b/.test(value) }).toEqual({ key, formal: false });
            expect({ key, rechner: /Rechner/.test(value) }).toEqual({ key, rechner: false });
        }
    });

    it('contain no emoji', () => {
        for (const [key, value] of [...Object.entries(en), ...Object.entries(de)]) {
            expect({ key, emoji: EMOJI.test(value) }).toEqual({ key, emoji: false });
        }
    });
});

describe('screen reader labels', () => {
    const root = path.resolve(__dirname, '..');
    const files: string[] = [];
    const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.tsx')) files.push(full);
        }
    };
    ['app', 'components', 'widget'].forEach(d => walk(path.join(root, d)));

    it('come from the catalogs, not from string literals', () => {
        // The language names stay in their own language on purpose
        const allowed = new Set(['English', 'Deutsch']);
        const literal = /accessibilityLabel=(?:"([^"]*)"|\{\s*[`'"]([^`'"]*)[`'"]\s*\})/g;
        const offenders: string[] = [];
        for (const file of files) {
            const source = fs.readFileSync(file, 'utf8');
            for (const m of source.matchAll(literal)) {
                const text = m[1] ?? m[2];
                if (!allowed.has(text)) offenders.push(`${path.relative(root, file)}: ${text}`);
            }
        }
        expect(offenders).toEqual([]);
    });
});
