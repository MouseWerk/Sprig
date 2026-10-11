import { cleanAnkiHtml, convertCloze, decodeEntities } from '@/utils/AnkiParse';

describe('decodeEntities', () => {
    it('decodes each entity exactly once', () => {
        expect(decodeEntities('&amp;lt;b&amp;gt;')).toBe('&lt;b&gt;');
        expect(decodeEntities('Tom &amp; Jerry &lt;3')).toBe('Tom & Jerry <3');
    });

    it('decodes decimal and hex code points, emoji included', () => {
        expect(decodeEntities('&#228;&#xE4;&#128512;')).toBe('ää😀');
    });

    it('leaves unknown or out-of-range entities alone instead of throwing', () => {
        expect(decodeEntities('&copy; &#99999999; &#0;')).toBe('&copy; &#99999999; &#0;');
    });
});

describe('cleanAnkiHtml', () => {
    it('turns markup into plain lines and collects image references', () => {
        const { text, images } = cleanAnkiHtml('<div>Herz</div><img src="heart.png"><br>Kammern&nbsp;&amp; Vorhöfe');
        expect(images).toEqual(['heart.png']);
        expect(text).toBe('Herz\n[[IMG0]]\nKammern & Vorhöfe');
    });
});

describe('convertCloze', () => {
    it('blanks the deletion on the front and reveals it on the back', () => {
        expect(convertCloze('Die Hauptstadt ist {{c1::Berlin::Stadt}}.')).toEqual({
            question: 'Die Hauptstadt ist [Stadt].',
            answer: 'Die Hauptstadt ist Berlin.',
        });
    });
});
