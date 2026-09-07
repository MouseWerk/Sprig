import { fromDisplayText, toDisplayText } from '@/utils/CardText';
import { extractImageFiles, imageToken, isImageToken, occlusionToken, removeImageToken, stripImageTokens } from '@/utils/CardImages';

describe('toDisplayText', () => {
    it('hides highlight markers but keeps the words', () => {
        expect(toDisplayText('The capital is ==Paris==')).toBe('The capital is Paris');
    });

    it('strips an attached image token and the line break before it', () => {
        expect(toDisplayText('Heart anatomy\n![img](cardimg/1_0.png)')).toBe('Heart anatomy');
    });

    it('strips an occlusion pair as one unit', () => {
        expect(toDisplayText('Label it\n![occl](cardimg/a.png|cardimg/b.svg)')).toBe('Label it');
    });

    it('leaves ordinary prose untouched', () => {
        expect(toDisplayText('Just a plain answer')).toBe('Just a plain answer');
    });
});

describe('fromDisplayText', () => {
    it('re-attaches the image token after an edit', () => {
        const raw = 'Old question\n![img](cardimg/1_0.png)';
        expect(fromDisplayText(raw, 'New question')).toBe('New question\n![img](cardimg/1_0.png)');
    });

    it('keeps the occlusion pair intact', () => {
        const raw = 'Label it\n![occl](cardimg/a.png|cardimg/b.svg)';
        expect(fromDisplayText(raw, 'Name the region')).toContain('![occl](cardimg/a.png|cardimg/b.svg)');
    });

    it('restores highlights on words that survived the edit', () => {
        const raw = 'The capital is ==Paris== today';
        expect(fromDisplayText(raw, 'The capital is Paris')).toBe('The capital is ==Paris==');
    });

    it('does not invent highlights on newly typed words', () => {
        const raw = 'The capital is ==Paris==';
        const out = fromDisplayText(raw, 'The capital is Paris and Lyon');
        expect(out).toBe('The capital is ==Paris== and Lyon');
    });

    it('round-trips text that has no markup at all', () => {
        const raw = 'Plain answer';
        expect(fromDisplayText(raw, toDisplayText(raw))).toBe(raw);
    });

    it('survives the highlighted word being deleted', () => {
        const raw = 'The capital is ==Paris==';
        expect(fromDisplayText(raw, 'The capital is unknown')).toBe('The capital is unknown');
    });
});

describe('image tokens', () => {
    it('recognises both token shapes and nothing else', () => {
        expect(isImageToken(imageToken('a.png'))).toBe(true);
        expect(isImageToken(occlusionToken('a.png', 'b.svg'))).toBe(true);
        expect(isImageToken('![img](http://example.com/x.png)')).toBe(false);
        expect(isImageToken('just words')).toBe(false);
    });

    it('lists every file a card references, both halves of a pair included', () => {
        const text = `q ${imageToken('one.png')} ${occlusionToken('base.jpg', 'mask.svg')}`;
        expect(extractImageFiles(text).sort()).toEqual(['base.jpg', 'mask.svg', 'one.png']);
    });

    it('drops a whole occlusion token when either half is removed', () => {
        const text = `q\n${occlusionToken('base.jpg', 'mask.svg')}`;
        expect(removeImageToken(text, 'mask.svg')).toBe('q');
        expect(removeImageToken(text, 'base.jpg')).toBe('q');
    });

    it('strips tokens for text-only contexts like typing mode and TTS', () => {
        expect(stripImageTokens(`Flumazenil ${imageToken('x.png')}`)).toBe('Flumazenil');
    });
});
