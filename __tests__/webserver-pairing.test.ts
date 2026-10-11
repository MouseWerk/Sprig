import { buildUploadPage, PairingGuard } from '@/utils/WebServer';

describe('PairingGuard', () => {
    const codes = ['1111', '2222', '3333'];
    const guard = () => {
        let i = 0;
        const g = new PairingGuard(() => codes[i++ % codes.length]);
        g.start();
        return g;
    };

    it('accepts the code shown in the app', () => {
        expect(guard().check('1111')).toBe('ok');
    });

    it('refuses everything while the server is stopped', () => {
        const g = guard();
        g.stop();
        expect(g.check('1111')).toBe('wrong');
    });

    it('replaces the code and pauses uploads after five wrong guesses', () => {
        const g = guard();
        const now = 1_000_000;
        for (let i = 0; i < 4; i++) expect(g.check('0000', now)).toBe('wrong');
        expect(g.code).toBe('1111');
        expect(g.check('0001', now)).toBe('wrong');
        expect(g.code).toBe('2222');
        // Even the right (new) code waits out the pause
        expect(g.check('2222', now + 1000)).toBe('locked');
        expect(g.check('2222', now + 31_000)).toBe('ok');
    });

    it('makes guessing all 10,000 codes impractical', () => {
        const g = guard();
        let now = 0;
        let accepted = 0;
        // A script hammering the endpoint for an hour
        for (let tries = 0; now < 3600_000; tries++, now += 10) {
            if (g.check(String(tries % 10000).padStart(4, '0'), now) === 'ok') accepted++;
        }
        // At most five guesses per 30 s against a code that keeps changing
        expect(accepted).toBeLessThanOrEqual(1);
    });

    it('resets the count after a correct code', () => {
        const g = guard();
        for (let i = 0; i < 4; i++) g.check('0000', 0);
        expect(g.check('1111', 0)).toBe('ok');
        for (let i = 0; i < 4; i++) g.check('0000', 0);
        expect(g.code).toBe('1111');
    });
});

describe('buildUploadPage', () => {
    it('is served in the app language', () => {
        expect(buildUploadPage('de')).toContain('<html lang="de">');
        expect(buildUploadPage('de')).toContain('Dateien an Sprig senden');
        expect(buildUploadPage('en')).toContain('Drop files into Sprig');
    });

    it('embeds its texts as escaped string literals in the inline script', () => {
        const page = buildUploadPage('de');
        const block = /const TEXT = (\{[\s\S]*?\});/.exec(page)?.[1] ?? '';
        expect(block).not.toContain('</');
        // Valid JS object literal holding exactly the catalog texts
        const text = new Function(`return ${block};`)();
        expect(text.wrongCode).toBe('Falscher Code');
        expect(text.locked).toContain('30 Sekunden');
    });

    it('keeps the chunk size a multiple of three (base64 concatenation contract)', () => {
        const chunk = Number(/const CHUNK = (\d+)/.exec(buildUploadPage('en'))?.[1]);
        expect(chunk % 3).toBe(0);
    });
});
