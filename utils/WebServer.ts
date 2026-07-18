import * as FileSystem from 'expo-file-system/legacy';
import * as Network from 'expo-network';
import { Buffer } from 'buffer';
import { NativeModules } from 'react-native';
import { saveAudioFile, saveDeck } from './Storage';

// Sprig's local-network upload server. Serves a small web page over HTTP on
// the phone's WiFi IP so a laptop on the same network can drop PDFs and audio
// files into the app — no cable, no cloud.
//
// Transport: react-native-tcp-socket (native module — available in dev/EAS
// builds, NOT in Expo Go). We speak just enough HTTP/1.1 for one page and a
// JSON upload endpoint.
//
// Upload protocol: the browser slices each file into chunks whose byte size is
// a multiple of 3, so their individual base64 encodings are padding-free and
// can be concatenated into one valid base64 string. Each chunk arrives as a
// small JSON POST — this keeps every request body comfortably small and pure
// ASCII, avoiding binary handling over the RN bridge.

export const WEB_SERVER_PORT = 8765;
const MAX_BODY_BYTES = 4 * 1024 * 1024;         // per request
const MAX_FILE_BYTES = 300 * 1024 * 1024;       // per assembled file
const UPLOAD_TTL_MS = 5 * 60 * 1000;            // drop stale partial uploads

type Kind = 'pdf' | 'audio';

interface PendingUpload {
    name: string;
    kind: Kind;
    total: number;
    received: number;   // chunks must arrive strictly in order (the page sends them sequentially)
    bytes: number;
    touched: number;
    fileUri: string;    // temp file the chunks are streamed into as they arrive
}

let server: { close: () => void } | null = null;
const uploads = new Map<string, PendingUpload>();
let sweepTimer: ReturnType<typeof setInterval> | null = null;
let tempSeq = 0;

// Screens subscribe here so a finished upload appears in their lists
// immediately, without waiting for the next tab refocus.
type SavedListener = (name: string, kind: Kind) => void;
const savedListeners = new Set<SavedListener>();
export function subscribeWebServerSaves(listener: SavedListener): () => void {
    savedListeners.add(listener);
    return () => { savedListeners.delete(listener); };
}

function discardUpload(id: string) {
    const u = uploads.get(id);
    uploads.delete(id);
    if (u) FileSystem.deleteAsync(u.fileUri, { idempotent: true }).catch(() => { });
}

// Small on-device request log so connection problems can be diagnosed from
// the Settings screen without adb or a debugger.
const requestLog: string[] = [];
function logRequest(entry: string) {
    const time = new Date().toTimeString().slice(0, 8);
    requestLog.unshift(`${time}  ${entry}`);
    if (requestLog.length > 20) requestLog.pop();
}
export function getWebServerLog(): string[] {
    return [...requestLog];
}

export function isWebServerSupported(): boolean {
    // In Expo Go the JS package resolves but the native module is absent.
    return NativeModules.TcpSockets != null;
}

export function isWebServerRunning(): boolean {
    return server !== null;
}

export async function getWebServerUrl(): Promise<string | null> {
    try {
        const ip = await Network.getIpAddressAsync();
        if (!ip || ip === '0.0.0.0') return null;
        return `http://${ip}:${WEB_SERVER_PORT}`;
    } catch {
        return null;
    }
}

export async function startWebServer(onFileSaved?: (name: string, kind: Kind) => void): Promise<string> {
    if (!isWebServerSupported()) {
        throw new Error('unsupported');
    }
    if (server) {
        const url = await getWebServerUrl();
        if (url) return url;
        throw new Error('no-network');
    }

    // Lazy so merely importing this module never touches the native side
    // (keeps every screen loadable in Expo Go, where TcpSockets is absent).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TcpSocket = require('react-native-tcp-socket');

    server = TcpSocket.createServer((socket: any) => {
        let buf = Buffer.alloc(0);
        let headerEnd = -1;
        let contentLength = 0;
        // Depending on platform/bridge, chunks may arrive as Buffer, plain
        // Uint8Array, or a base64 string. Detected once per connection.
        let base64Mode = false;

        const toBuffer = (data: unknown): Buffer => {
            if (Buffer.isBuffer(data)) return data;
            if (data instanceof Uint8Array) return Buffer.from(data);
            const s = String(data);
            if (base64Mode) return Buffer.from(s.replace(/\s+/g, ''), 'base64');
            return Buffer.from(s, 'utf8');
        };

        let loggedFirstChunk = false;

        socket.on('data', (data: unknown) => {
            try {
                if (!loggedFirstChunk) {
                    loggedFirstChunk = true;
                    const kind = Buffer.isBuffer(data) ? 'buffer' : data instanceof Uint8Array ? 'bytes' : typeof data;
                    const preview = toBuffer(data).subarray(0, 60).toString('utf8').replace(/[^\x20-\x7e]/g, '·');
                    logRequest(`in (${kind}): ${preview}`);
                }

                buf = Buffer.concat([buf, toBuffer(data)]);

                // If the first chunk was a string that doesn't look like HTTP,
                // it is almost certainly base64-encoded — reinterpret once.
                if (!base64Mode && typeof data === 'string' && headerEnd < 0 && !buf.subarray(0, 200).toString('utf8').includes('HTTP/')) {
                    const decoded = Buffer.from(buf.toString('utf8').replace(/\s+/g, ''), 'base64');
                    if (decoded.subarray(0, 200).toString('utf8').includes('HTTP/')) {
                        base64Mode = true;
                        buf = decoded;
                        logRequest('note: chunks arrive base64-encoded');
                    }
                }

                if (headerEnd < 0) {
                    // Ignore leading blank lines (allowed by the HTTP spec and
                    // seen from some clients between keep-alive requests).
                    let skip = 0;
                    while (skip < buf.length && (buf[skip] === 13 || buf[skip] === 10)) skip++;
                    if (skip > 0) buf = buf.subarray(skip);

                    headerEnd = buf.indexOf('\r\n\r\n');
                    if (headerEnd < 0) {
                        if (buf.length > 64 * 1024) socket.destroy();
                        return;
                    }
                    const head = buf.subarray(0, headerEnd).toString('utf8');
                    const m = /content-length:\s*(\d+)/i.exec(head);
                    contentLength = m ? parseInt(m[1], 10) : 0;
                    if (contentLength > MAX_BODY_BYTES) {
                        respond(socket, 413, 'application/json', '{"error":"chunk too large"}');
                        return;
                    }
                }

                const bodyStart = headerEnd + 4;
                if (buf.length < bodyStart + contentLength) return; // wait for more

                const head = buf.subarray(0, headerEnd).toString('utf8');
                const body = buf.subarray(bodyStart, bodyStart + contentLength).toString('utf8');
                const requestLine = head.split('\r\n').map(l => l.trim()).find(l => l.length > 0) || '';

                if (!/HTTP\//i.test(requestLine)) {
                    // Not parseable as HTTP at all — serve the page rather than
                    // a 404 so a browser always lands somewhere useful.
                    logRequest(`unparseable request line: "${requestLine.slice(0, 60)}" -> serving page`);
                    respond(socket, 200, 'text/html', UPLOAD_PAGE);
                    return;
                }

                const [method, rawPath] = requestLine.split(/\s+/);
                const path = normalizePath(rawPath);
                logRequest(`${method} ${path}`);

                handleRequest(socket, (method || '').toUpperCase(), path, body, onFileSaved).catch(e => {
                    console.error('WebServer handler error:', e);
                    respond(socket, 500, 'application/json', '{"error":"internal"}');
                });
            } catch (e) {
                console.error('WebServer request error:', e);
                logRequest(`error: ${String(e).slice(0, 80)}`);
                respond(socket, 500, 'application/json', '{"error":"internal"}');
            }
        });
        socket.on('error', () => { /* client vanished — nothing to do */ });
    });

    (server as any).on?.('error', (e: unknown) => {
        logRequest(`server error: ${String(e).slice(0, 80)}`);
    });
    (server as any).listen({ port: WEB_SERVER_PORT, host: '0.0.0.0' });
    logRequest(`server listening on :${WEB_SERVER_PORT}`);

    sweepTimer = setInterval(() => {
        const now = Date.now();
        for (const [id, u] of uploads) {
            if (now - u.touched > UPLOAD_TTL_MS) discardUpload(id);
        }
    }, 60 * 1000);

    const url = await getWebServerUrl();
    if (!url) {
        stopWebServer();
        throw new Error('no-network');
    }
    return url;
}

export function stopWebServer(): void {
    if (server) {
        try { server.close(); } catch { /* already closed */ }
        server = null;
    }
    if (sweepTimer) {
        clearInterval(sweepTimer);
        sweepTimer = null;
    }
    for (const id of [...uploads.keys()]) discardUpload(id);
}

function respond(socket: any, status: number, type: string, body: string) {
    const statusText = status === 200 ? 'OK' : status === 404 ? 'Not Found' : status === 409 ? 'Conflict' : status === 413 ? 'Payload Too Large' : 'Error';
    const payload = Buffer.from(body, 'utf8');
    socket.write(
        `HTTP/1.1 ${status} ${statusText}\r\n` +
        `Content-Type: ${type}; charset=utf-8\r\n` +
        `Content-Length: ${payload.length}\r\n` +
        `Connection: close\r\n\r\n`
    );
    socket.write(payload);
    // Give the socket a beat to flush before closing.
    setTimeout(() => { try { socket.destroy(); } catch { /* gone */ } }, 150);
}

// Reduce whatever the client sent (query strings, proxy-style absolute
// URIs) to a plain pathname.
function normalizePath(rawPath: string | undefined): string {
    let p = rawPath || '/';
    if (/^https?:\/\//i.test(p)) {
        const idx = p.indexOf('/', p.indexOf('//') + 2);
        p = idx >= 0 ? p.slice(idx) : '/';
    }
    return p.split('?')[0].split('#')[0] || '/';
}

async function handleRequest(
    socket: any,
    method: string,
    path: string,
    body: string,
    onFileSaved?: (name: string, kind: Kind) => void
) {
    // This server exists to show exactly one page — any GET that isn't the
    // upload endpoint gets it (so /index.html, odd browser probes and typos
    // all land somewhere useful).
    if (method === 'GET' && path !== '/upload') {
        respond(socket, 200, 'text/html', UPLOAD_PAGE);
        return;
    }

    if (method === 'POST' && path === '/upload') {
        let msg: { uploadId?: string; name?: string; kind?: string; index?: number; total?: number; data?: string };
        try {
            msg = JSON.parse(body);
        } catch {
            respond(socket, 400, 'application/json', '{"error":"bad json"}');
            return;
        }
        const { uploadId, name, kind, index, total, data } = msg;
        if (!uploadId || !name || (kind !== 'pdf' && kind !== 'audio') || typeof index !== 'number' || typeof total !== 'number' || typeof data !== 'string') {
            respond(socket, 400, 'application/json', '{"error":"missing fields"}');
            return;
        }

        let u = uploads.get(uploadId);
        if (!u) {
            if (index !== 0) {
                // The server lost this upload's state (restart, expiry). Tell
                // the page honestly instead of counting from scratch.
                respond(socket, 409, 'application/json', '{"error":"upload state lost — please retry the file"}');
                return;
            }
            u = {
                name: sanitizeName(name),
                kind,
                total,
                received: 0,
                bytes: 0,
                touched: Date.now(),
                fileUri: `${FileSystem.cacheDirectory}webupload_${Date.now()}_${tempSeq++}.bin`,
            };
            uploads.set(uploadId, u);
        }
        u.touched = Date.now();

        if (index < u.received) {
            // Duplicate of a chunk we already streamed to disk — acknowledge.
            respond(socket, 200, 'application/json', JSON.stringify({ received: u.received, total: u.total }));
            return;
        }
        if (index > u.received) {
            discardUpload(uploadId);
            respond(socket, 409, 'application/json', '{"error":"chunk out of order — please retry the file"}');
            return;
        }

        u.bytes += Math.floor(data.length * 0.75);
        if (u.bytes > MAX_FILE_BYTES) {
            discardUpload(uploadId);
            respond(socket, 413, 'application/json', '{"error":"file too large"}');
            return;
        }

        // Stream the chunk straight to disk. Chunk byte size is a multiple of
        // 3 (page contract), so each base64 part decodes independently.
        try {
            if (index === 0) {
                await FileSystem.writeAsStringAsync(u.fileUri, data, { encoding: FileSystem.EncodingType.Base64 });
            } else {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const RNBlob = require('react-native-blob-util').default;
                await RNBlob.fs.appendFile(u.fileUri.replace(/^file:\/\//, ''), data, 'base64');
            }
            u.received++;
        } catch (e) {
            console.error('WebServer chunk write failed:', e);
            logRequest(`chunk write failed: ${String(e).slice(0, 80)}`);
            discardUpload(uploadId);
            respond(socket, 500, 'application/json', '{"error":"could not write chunk"}');
            return;
        }

        if (u.received < u.total) {
            respond(socket, 200, 'application/json', JSON.stringify({ received: u.received, total: u.total }));
            return;
        }

        // Last chunk in: hand the assembled file to the normal ingestion path.
        uploads.delete(uploadId);
        try {
            if (u.kind === 'audio') {
                await saveAudioFile(u.fileUri, u.name);
            } else {
                await saveDeck(u.name.replace(/\.pdf$/i, '') || 'Document', u.fileUri, 'FileText', 'pdf', 0, null);
            }
            await FileSystem.deleteAsync(u.fileUri, { idempotent: true });

            logRequest(`saved ${u.kind}: ${u.name}`);
            onFileSaved?.(u.name, u.kind);
            for (const listener of savedListeners) {
                try { listener(u.name, u.kind); } catch { /* listener error must not break the server */ }
            }
            respond(socket, 200, 'application/json', '{"done":true}');
        } catch (e) {
            console.error('WebServer save failed:', e);
            logRequest(`save failed: ${String(e).slice(0, 80)}`);
            FileSystem.deleteAsync(u.fileUri, { idempotent: true }).catch(() => { });
            respond(socket, 500, 'application/json', '{"error":"save failed"}');
        }
        return;
    }

    if (method === 'POST') {
        respond(socket, 404, 'application/json', '{"error":"unknown endpoint"}');
        return;
    }
    // HEAD/OPTIONS and anything else: the page is always a safe answer.
    logRequest(`method ${method} -> serving page`);
    respond(socket, 200, 'text/html', UPLOAD_PAGE);
}

function sanitizeName(name: string): string {
    return name.replace(/[/\\:*?"<>|]/g, '_').slice(0, 120) || 'file';
}

// ---------------------------------------------------------------------------
// The page served at / — self-contained, styled to match Sprig's slate theme.
// Chunk size must stay a multiple of 3 (base64 concatenation contract above).
// ---------------------------------------------------------------------------
const UPLOAD_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sprig — Drop files</title>
<style>
  :root { --ink:#0f172a; --muted:#f1f5f9; --muted-fg:#64748b; --border:#e2e8f0; --green:#22c55e; --red:#ef4444; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#fff; color:var(--ink); font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
  .card { width:100%; max-width:520px; }
  h1 { font-size:1.6rem; letter-spacing:-.02em; margin-bottom:6px; }
  p.sub { color:var(--muted-fg); margin-bottom:28px; }
  .zone { border:2px dashed var(--border); border-radius:20px; padding:32px 24px; text-align:center; margin-bottom:16px; cursor:pointer; transition:border-color .15s, background .15s; }
  .zone:hover, .zone.drag { border-color:var(--ink); background:var(--muted); }
  .zone strong { display:block; font-size:1.05rem; margin-bottom:4px; }
  .zone span { color:var(--muted-fg); font-size:.9rem; }
  .list { margin-top:20px; display:grid; gap:8px; }
  .item { display:flex; align-items:center; gap:10px; background:var(--muted); border-radius:12px; padding:10px 14px; font-size:.92rem; }
  .item .name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .item .status { font-weight:600; color:var(--muted-fg); font-variant-numeric:tabular-nums; }
  .item.done .status { color:var(--green); }
  .item.error .status { color:var(--red); }
  .bar { height:4px; border-radius:2px; background:var(--border); overflow:hidden; margin-top:6px; }
  .bar i { display:block; height:100%; width:0; background:var(--ink); transition:width .2s; }
  footer { margin-top:28px; text-align:center; color:var(--muted-fg); font-size:.85rem; }
</style>
</head>
<body>
<div class="card">
  <h1>Drop files into Sprig</h1>
  <p class="sub">Files land directly on your phone — nothing leaves your network.</p>

  <div class="zone" id="zonePdf">
    <strong>Add PDFs</strong>
    <span>Click or drag PDF documents here</span>
    <input type="file" id="inPdf" accept="application/pdf" multiple hidden>
  </div>

  <div class="zone" id="zoneAudio">
    <strong>Add audio</strong>
    <span>Click or drag audio files here</span>
    <input type="file" id="inAudio" accept="audio/*" multiple hidden>
  </div>

  <div class="list" id="list"></div>
  <footer>Sprig · local upload · keep the app open while transferring</footer>
</div>
<script>
const CHUNK = 1050000; // ~1MB and a multiple of 3, so per-chunk base64 strings concatenate into valid base64
const list = document.getElementById('list');

function wire(zoneId, inputId, kind) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { [...input.files].forEach(f => upload(f, kind)); input.value = ''; });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag');
    [...e.dataTransfer.files].forEach(f => upload(f, kind));
  });
}
wire('zonePdf', 'inPdf', 'pdf');
wire('zoneAudio', 'inAudio', 'audio');

function row(name) {
  const el = document.createElement('div');
  el.className = 'item';
  el.innerHTML = '<div style="flex:1;min-width:0"><div class="name"></div><div class="bar"><i></i></div></div><div class="status">0%</div>';
  el.querySelector('.name').textContent = name;
  list.prepend(el);
  return el;
}

async function upload(file, kind) {
  const el = row(file.name);
  const bar = el.querySelector('.bar i');
  const status = el.querySelector('.status');
  const id = Date.now() + '-' + Math.random().toString(36).slice(2);
  const total = Math.max(1, Math.ceil(file.size / CHUNK));
  try {
    let last = null;
    for (let i = 0; i < total; i++) {
      const slice = file.slice(i * CHUNK, (i + 1) * CHUNK);
      const b64 = await toBase64(slice);
      const res = await fetch('/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId: id, name: file.name, kind, index: i, total, data: b64 })
      });
      let json = null;
      try { json = await res.json(); } catch (e) { /* non-JSON reply */ }
      if (!res.ok) throw new Error((json && json.error) || ('HTTP ' + res.status));
      last = json;
      const pct = Math.round(((i + 1) / total) * 100);
      bar.style.width = pct + '%';
      status.textContent = pct + '%';
    }
    // Only report success once the phone confirms it stored the file.
    if (!last || last.done !== true) throw new Error('phone did not confirm the save');
    el.classList.add('done');
    status.textContent = 'Saved';
  } catch (e) {
    el.classList.add('error');
    status.textContent = 'Failed';
    console.error(e);
  }
}

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
</script>
</body>
</html>`;
