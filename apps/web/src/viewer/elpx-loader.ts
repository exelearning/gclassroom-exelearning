import { extractElpx, findIndexHtml, type ZipEntries } from './zip-reader';

export interface LoadedElpx {
  sessionId: string;
  indexPath: string;
  entries: ZipEntries;
  /** Total uncompressed size in bytes, useful for diagnostics. */
  totalSize: number;
}

export interface LoadElpxOptions {
  /** Caller-provided session id; defaults to a random UUID. */
  sessionId?: string;
}

/**
 * Top-level entrypoint for the viewer: takes raw .elpx bytes (already
 * downloaded from Drive or uploaded from disk) and returns the extracted
 * package plus the path to its index.html.
 */
export function loadElpx(bytes: ArrayBuffer | Uint8Array, options: LoadElpxOptions = {}): LoadedElpx {
  const entries = extractElpx(bytes);
  const indexPath = findIndexHtml(entries);
  if (!indexPath) {
    throw new Error('The .elpx package does not contain an index.html — cannot render.');
  }
  let totalSize = 0;
  for (const data of entries.files.values()) totalSize += data.byteLength;
  return {
    sessionId: options.sessionId ?? randomSessionId(),
    indexPath,
    entries,
    totalSize,
  };
}

function randomSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `sess-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}
