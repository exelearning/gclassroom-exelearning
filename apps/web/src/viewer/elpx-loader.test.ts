import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { loadElpx } from './elpx-loader';

function fixture(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) entries[path] = strToU8(content);
  return zipSync(entries);
}

describe('loadElpx', () => {
  it('returns indexPath, sessionId, entries', () => {
    const bytes = fixture({
      'index.html': '<html></html>',
      'theme/style.css': 'body{}',
    });
    const loaded = loadElpx(bytes, { sessionId: 'fixed' });
    expect(loaded.sessionId).toBe('fixed');
    expect(loaded.indexPath).toBe('index.html');
    expect(loaded.entries.files.size).toBe(2);
    expect(loaded.totalSize).toBeGreaterThan(0);
  });

  it('mints a session id when not provided', () => {
    const bytes = fixture({ 'index.html': '<html></html>' });
    const a = loadElpx(bytes);
    const b = loadElpx(bytes);
    expect(a.sessionId).not.toBe(b.sessionId);
  });

  it('throws when index.html is missing', () => {
    const bytes = fixture({ 'about.html': 'x' });
    expect(() => loadElpx(bytes)).toThrowError(/index\.html/);
  });
});
