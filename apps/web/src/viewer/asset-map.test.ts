import { describe, it, expect } from 'vitest';
import { getMimeType, resolveAssetPath } from './asset-map';

describe('getMimeType', () => {
  it.each([
    ['index.html', 'text/html; charset=utf-8'],
    ['style.css', 'text/css; charset=utf-8'],
    ['app.js', 'application/javascript; charset=utf-8'],
    ['icon.svg', 'image/svg+xml'],
    ['photo.JPG', 'image/jpeg'],
    ['music.mp3', 'audio/mpeg'],
    ['unknown', 'application/octet-stream'],
    ['file.weirdext', 'application/octet-stream'],
  ])('maps %s to %s', (name, expected) => {
    expect(getMimeType(name)).toBe(expected);
  });
});

describe('resolveAssetPath', () => {
  function makeFiles(): Map<string, Uint8Array> {
    return new Map([
      ['index.html', new Uint8Array([1])],
      ['html/page1.html', new Uint8Array([2])],
      ['theme/Style.CSS', new Uint8Array([3])],
      ['html/index.html', new Uint8Array([4])],
    ]);
  }

  it('serves index.html for empty path', () => {
    const result = resolveAssetPath(makeFiles(), '');
    expect(result?.path).toBe('index.html');
  });

  it('serves index.html for trailing slash', () => {
    const result = resolveAssetPath(makeFiles(), 'html/');
    expect(result?.path).toBe('html/index.html');
  });

  it('finds nested files', () => {
    const result = resolveAssetPath(makeFiles(), 'html/page1.html');
    expect(result?.path).toBe('html/page1.html');
  });

  it('falls back to /index.html for directory-like requests', () => {
    const result = resolveAssetPath(makeFiles(), 'html');
    expect(result?.path).toBe('html/index.html');
  });

  it('falls back to case-insensitive match', () => {
    const result = resolveAssetPath(makeFiles(), 'theme/style.css');
    expect(result?.path).toBe('theme/Style.CSS');
  });

  it('returns null for missing assets', () => {
    expect(resolveAssetPath(makeFiles(), 'no/such/file.txt')).toBeNull();
  });

  it('decodes percent-encoded paths', () => {
    const result = resolveAssetPath(makeFiles(), 'html%2Fpage1.html');
    expect(result?.path).toBe('html/page1.html');
  });
});
