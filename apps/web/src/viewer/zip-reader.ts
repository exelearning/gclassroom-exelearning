import { unzipSync, strFromU8 } from 'fflate';

export interface ZipEntries {
  /** Map of entry path (forward-slashes, no leading slash) → bytes. */
  files: Map<string, Uint8Array>;
}

const PK_SIGNATURE = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
const PK_EMPTY_SIGNATURE = new Uint8Array([0x50, 0x4b, 0x05, 0x06]);

export class ElpxFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ElpxFormatError';
  }
}

/**
 * Validate that bytes start with a PKZIP local file header (or empty-archive
 * marker). Cheap up-front sanity check so we can reject obvious non-zip
 * uploads without unzipping.
 */
export function isLikelyZip(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  return matchesSignature(bytes, PK_SIGNATURE) || matchesSignature(bytes, PK_EMPTY_SIGNATURE);
}

function matchesSignature(bytes: Uint8Array, sig: Uint8Array): boolean {
  for (let i = 0; i < sig.length; i += 1) {
    if (bytes[i] !== sig[i]) return false;
  }
  return true;
}

/**
 * Fully extract a ZIP/.elpx archive to an in-memory map of path -> bytes.
 * Uses fflate (synchronous; small enough for typical eXeLearning packages
 * which are usually < 50 MB). Larger packages should use the worker variant.
 */
export function extractElpx(bytes: ArrayBuffer | Uint8Array): ZipEntries {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!isLikelyZip(u8)) {
    throw new ElpxFormatError('File does not start with a ZIP signature; not a valid .elpx package.');
  }
  const entries = unzipSync(u8);
  const files = new Map<string, Uint8Array>();
  for (const [rawPath, data] of Object.entries(entries)) {
    if (rawPath.endsWith('/')) continue; // directories
    files.set(normalizePath(rawPath), data);
  }
  return { files };
}

/** Resolve which entry serves as the root index.html. */
export function findIndexHtml(entries: ZipEntries): string | null {
  // Prefer top-level index.html.
  if (entries.files.has('index.html')) return 'index.html';
  // Some packages put it under a top folder; pick the shallowest index.html.
  let best: { path: string; depth: number } | null = null;
  for (const path of entries.files.keys()) {
    if (!path.toLowerCase().endsWith('/index.html')) continue;
    const depth = path.split('/').length;
    if (!best || depth < best.depth) best = { path, depth };
  }
  return best?.path ?? null;
}

export function readEntryAsText(entries: ZipEntries, path: string): string | null {
  const bytes = entries.files.get(normalizePath(path));
  if (!bytes) return null;
  return strFromU8(bytes);
}

export function normalizePath(path: string): string {
  let p = path.replace(/\\/g, '/');
  while (p.startsWith('/')) p = p.slice(1);
  // Normalize ./ and ../ that don't escape the root
  const segments: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') { segments.pop(); continue; }
    segments.push(seg);
  }
  return segments.join('/');
}
