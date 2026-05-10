import { describe, it, expect } from 'vitest';
import { injectScormBridge } from './safe-html';

describe('injectScormBridge', () => {
  it('inserts bridge script as first child of <head>', () => {
    const html = '<!doctype html><html><head><title>x</title></head><body>y</body></html>';
    const out = injectScormBridge(html, 'sess-abc');
    expect(out).toMatch(/<head><script data-injected-by="gclassroom-exelearning-scorm">/);
    expect(out).toContain("host.sessionId !== 'sess-abc'");
  });

  it('appends external-link handler before </body>', () => {
    const html = '<html><head></head><body><p>x</p></body></html>';
    const out = injectScormBridge(html, 's');
    const bridgeIdx = out.indexOf('gclassroom-exelearning-scorm');
    const linksIdx = out.indexOf('gclassroom-exelearning-links');
    expect(bridgeIdx).toBeGreaterThan(0);
    expect(linksIdx).toBeGreaterThan(bridgeIdx);
    expect(out.indexOf('</body>')).toBeGreaterThan(linksIdx);
  });

  it('falls back gracefully when there is no <head>', () => {
    const html = '<html><body>z</body></html>';
    const out = injectScormBridge(html, 's');
    expect(out.startsWith('<script')).toBe(true);
  });

  it('falls back gracefully when there is no </body>', () => {
    const html = '<html><head></head>fragment';
    const out = injectScormBridge(html, 's');
    expect(out).toContain('gclassroom-exelearning-links');
  });
});
