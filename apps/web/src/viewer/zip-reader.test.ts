import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { extractElpx, findIndexHtml, isLikelyZip, normalizePath, readEntryAsText, ElpxFormatError } from './zip-reader';

function makeFixtureZip(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, contents] of Object.entries(files)) {
    entries[path] = strToU8(contents);
  }
  return zipSync(entries);
}

describe('isLikelyZip', () => {
  it('accepts a real zip', () => {
    const z = makeFixtureZip({ 'a.txt': 'hi' });
    expect(isLikelyZip(z)).toBe(true);
  });

  it('rejects non-zip bytes', () => {
    expect(isLikelyZip(new Uint8Array([0, 1, 2, 3]))).toBe(false);
    expect(isLikelyZip(new Uint8Array([]))).toBe(false);
  });
});

describe('extractElpx', () => {
  it('extracts entries to a Map keyed by normalized path', () => {
    const z = makeFixtureZip({
      'index.html': '<html>hi</html>',
      'html/page1.html': '<p>1</p>',
      'theme/style.css': 'body{}',
    });
    const { files } = extractElpx(z);
    expect(files.size).toBe(3);
    expect(files.has('index.html')).toBe(true);
    expect(files.has('html/page1.html')).toBe(true);
    expect(files.has('theme/style.css')).toBe(true);
  });

  it('throws ElpxFormatError on non-zip input', () => {
    expect(() => extractElpx(new Uint8Array([1, 2, 3, 4]))).toThrowError(ElpxFormatError);
  });
});

describe('findIndexHtml', () => {
  it('prefers root index.html', () => {
    const { files } = extractElpx(makeFixtureZip({
      'index.html': 'a',
      'inner/index.html': 'b',
    }));
    expect(findIndexHtml({ files })).toBe('index.html');
  });

  it('falls back to shallowest nested index.html', () => {
    const { files } = extractElpx(makeFixtureZip({
      'site/index.html': 'a',
      'site/foo/bar/index.html': 'b',
    }));
    expect(findIndexHtml({ files })).toBe('site/index.html');
  });

  it('returns null when no index.html exists', () => {
    const { files } = extractElpx(makeFixtureZip({ 'about.html': 'x' }));
    expect(findIndexHtml({ files })).toBeNull();
  });
});

describe('readEntryAsText', () => {
  it('returns text contents', () => {
    const entries = extractElpx(makeFixtureZip({ 'a.txt': 'hello' }));
    expect(readEntryAsText(entries, 'a.txt')).toBe('hello');
  });

  it('returns null for missing entry', () => {
    const entries = extractElpx(makeFixtureZip({ 'a.txt': 'hello' }));
    expect(readEntryAsText(entries, 'b.txt')).toBeNull();
  });
});

describe('normalizePath', () => {
  it('strips leading slashes and resolves dot segments', () => {
    expect(normalizePath('/foo/./bar/../baz.txt')).toBe('foo/baz.txt');
    expect(normalizePath('\\html\\page.html')).toBe('html/page.html');
  });
});
