import { Buffer } from 'buffer';

// The WiFi upload server reads ranges out of the incoming socket buffer to find
// the request line, the headers and the body. Doing that with
// `buf.subarray(a, b).toString('utf8')` is broken in the app's runtime: the
// result of subarray() is a plain Uint8Array, whose toString() ignores the
// encoding and renders the byte values as "80,79,83,...". Every request then
// failed the "is this HTTP?" test and the server silently served the upload
// page instead, so no upload could ever complete on iOS.
//
// These tests pin the reading style the server must use.

const REQUEST = 'POST /upload HTTP/1.1\r\nContent-Length: 9\r\n\r\n{"a":123}';

describe('reading ranges out of a socket buffer', () => {
    const buf = Buffer.from(REQUEST, 'utf8');

    it('decodes a range through Buffer#toString(enc, start, end)', () => {
        const headerEnd = buf.indexOf('\r\n\r\n');
        expect(buf.toString('utf8', 0, headerEnd)).toContain('HTTP/');
        expect(buf.toString('utf8', 0, headerEnd).split('\r\n')[0]).toBe('POST /upload HTTP/1.1');
    });

    it('reads the body by offset without slicing', () => {
        const headerEnd = buf.indexOf('\r\n\r\n');
        const body = buf.toString('utf8', headerEnd + 4, buf.length);
        expect(JSON.parse(body)).toEqual({ a: 123 });
    });

    it('shows why the subarray form is unsafe: it can drop the Buffer prototype', () => {
        // Node keeps the prototype, so this asserts the property the server
        // relies on rather than the broken behaviour: a range read must not
        // depend on subarray() returning something that still decodes text.
        const viaRange = buf.toString('utf8', 0, 21);
        const plain = new Uint8Array(buf.subarray(0, 21));
        expect(viaRange).toBe('POST /upload HTTP/1.1');
        // A plain Uint8Array renders as comma-separated byte values — exactly
        // the string that appeared in the server log on iOS.
        expect(plain.toString()).toMatch(/^80,79,83,84/);
    });

    it('keeps indexOf working after trimming leading blank lines', () => {
        const withBlanks = Buffer.concat([Buffer.from('\r\n\r\n'), buf]);
        let skip = 0;
        while (skip < withBlanks.length && (withBlanks[skip] === 13 || withBlanks[skip] === 10)) skip++;
        const trimmed = Buffer.from(withBlanks.subarray(skip));
        // Buffer#indexOf accepts a string; Uint8Array#indexOf does not.
        expect(trimmed.indexOf('\r\n\r\n')).toBeGreaterThan(0);
        expect(trimmed.toString('utf8', 0, 21)).toBe('POST /upload HTTP/1.1');
    });
});
