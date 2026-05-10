/** MIME types for assets we expect to see inside an .elpx package. */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.xhtml': 'application/xhtml+xml',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.webm': 'video/webm',
  '.ogg': 'audio/ogg',
  '.ogv': 'video/ogg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
};

export function getMimeType(filename: string): string {
  const idx = filename.lastIndexOf('.');
  if (idx < 0) return 'application/octet-stream';
  const ext = filename.slice(idx).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

/**
 * Resolve a request path inside an extracted .elpx package. Mimics web-server
 * defaults:
 *   - `''` and `/` → `index.html`
 *   - directory paths fall back to `<dir>/index.html`
 *   - case-insensitive lookup as a last resort (Windows-built archives)
 */
export function resolveAssetPath(
  files: Map<string, Uint8Array>,
  requestPath: string,
  options: { defaultIndex?: string } = {},
): { path: string; bytes: Uint8Array } | null {
  const defaultIndex = options.defaultIndex ?? 'index.html';
  let path = decodeURIComponent(requestPath || '');
  while (path.startsWith('/')) path = path.slice(1);
  if (path === '' || path.endsWith('/')) {
    path = `${path}${defaultIndex}`;
  }

  let bytes = files.get(path);
  if (!bytes && !path.includes('.')) {
    bytes = files.get(`${path}/${defaultIndex}`);
    if (bytes) path = `${path}/${defaultIndex}`;
  }
  if (!bytes) {
    const lower = path.toLowerCase();
    for (const [key, value] of files) {
      if (key.toLowerCase() === lower) {
        bytes = value;
        path = key;
        break;
      }
    }
  }
  if (!bytes) return null;
  return { path, bytes };
}
