/**
 * gclassroom-exelearning — eXeLearning runtime Service Worker.
 *
 * Lives at <base>/elpx-runtime/sw.js so its default scope is
 * <base>/elpx-runtime/. Intercepts /elpx-runtime/{sessionId}/<path> and
 * serves bytes from an in-memory map populated via postMessage from clients.
 *
 * One entry per "session" — a session corresponds to a particular open
 * `.elpx` package in a particular tab. Multiple tabs/iframes can register
 * their own sessions concurrently. Sessions are cleared on `CLEAR_SESSION`
 * messages or when the SW is unregistered.
 */

/* eslint-env serviceworker */
/* global self, caches, clients */

const SW_VERSION = '0.1.0';
const CACHE_NAME = `gclassroom-elpx-sw-v${SW_VERSION}`;

// Map<sessionId, { files: Map<string, ArrayBuffer | Uint8Array> }>
const sessions = new Map();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.xhtml':'application/xhtml+xml',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml':  'application/xml',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.bmp':  'image/bmp',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.otf':  'font/otf',
  '.eot':  'application/vnd.ms-fontobject',
  '.mp3':  'audio/mpeg',
  '.mp4':  'video/mp4',
  '.m4a':  'audio/mp4',
  '.webm': 'video/webm',
  '.ogg':  'audio/ogg',
  '.ogv':  'video/ogg',
  '.wav':  'audio/wav',
  '.pdf':  'application/pdf',
  '.txt':  'text/plain; charset=utf-8',
  '.csv':  'text/csv; charset=utf-8',
};

function mimeOf(path) {
  const i = path.lastIndexOf('.');
  if (i < 0) return 'application/octet-stream';
  return MIME_TYPES[path.slice(i).toLowerCase()] || 'application/octet-stream';
}

function normalizePath(p) {
  let path = decodeURIComponent(p || '');
  while (path.startsWith('/')) path = path.slice(1);
  if (path === '' || path.endsWith('/')) path = `${path}index.html`;
  return path;
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith('gclassroom-elpx-sw-') && k !== CACHE_NAME).map((k) => caches.delete(k)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  const port = (event.ports && event.ports[0]) || null;

  switch (data.type) {
    case 'SET_SESSION': {
      const { sessionId, files } = data;
      if (!sessionId || !files) {
        port && port.postMessage({ ok: false, error: 'sessionId and files are required' });
        return;
      }
      // files: Record<string, ArrayBuffer>
      const map = new Map();
      for (const [path, buf] of Object.entries(files)) {
        map.set(path, buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf);
      }
      sessions.set(sessionId, { files: map });
      port && port.postMessage({ ok: true, sessionId, fileCount: map.size });
      break;
    }
    case 'CLEAR_SESSION': {
      sessions.delete(data.sessionId);
      port && port.postMessage({ ok: true, sessionId: data.sessionId });
      break;
    }
    case 'STATUS': {
      const ids = Array.from(sessions.keys());
      port && port.postMessage({ ok: true, version: SW_VERSION, sessions: ids });
      break;
    }
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
    default:
      port && port.postMessage({ ok: false, error: `unknown message type: ${data.type}` });
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const idx = url.pathname.indexOf('/elpx-runtime/');
  if (idx < 0) return;

  // Reserved paths that aren't session content: /elpx-runtime/sw.js itself.
  const after = url.pathname.slice(idx + '/elpx-runtime/'.length);
  if (after === 'sw.js' || after === '') return;

  event.respondWith(handleSessionFetch(after));
});

async function handleSessionFetch(after) {
  const slash = after.indexOf('/');
  const sessionId = slash >= 0 ? after.slice(0, slash) : after;
  const rawPath = slash >= 0 ? after.slice(slash + 1) : '';
  const session = sessions.get(sessionId);

  if (!session) {
    return new Response(
      `Unknown elpx-runtime session: ${sessionId}. Open the activity from the host app.`,
      { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }

  const path = normalizePath(rawPath);
  let bytes = session.files.get(path);

  // Fall back to <dir>/index.html
  if (!bytes && !path.includes('.')) {
    bytes = session.files.get(`${path}/index.html`);
  }

  // Case-insensitive fallback (Windows-built archives)
  if (!bytes) {
    const lower = path.toLowerCase();
    for (const [key, value] of session.files) {
      if (key.toLowerCase() === lower) { bytes = value; break; }
    }
  }

  if (!bytes) {
    return new Response(`Not found: ${path}`, {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const headers = new Headers({
    'Content-Type': mimeOf(path),
    'Cache-Control': 'no-store',
    'X-Served-By': 'gclassroom-elpx-sw',
  });
  return new Response(bytes, { status: 200, headers });
}
