import { describe, it, expect, vi } from 'vitest';
import { createScorm12Api, isScorm12Complete, findScorm12Score } from './scorm12';

describe('SCORM 1.2 adapter', () => {
  it('initializes once and rejects double init only after a successful first init', () => {
    const api = createScorm12Api();
    expect(api.LMSInitialize('')).toBe('true');
    // Per spec, reinit returns "true" if already initialized; we keep that lenient.
    expect(api.LMSInitialize('')).toBe('true');
    expect(api.LMSInitialize('not-empty')).toBe('false');
    expect(api.LMSGetLastError()).toBe('201');
  });

  it('rejects calls before initialization', () => {
    const api = createScorm12Api();
    expect(api.LMSGetValue('cmi.core.score.raw')).toBe('');
    expect(api.LMSGetLastError()).toBe('301');
    expect(api.LMSSetValue('cmi.core.score.raw', '5')).toBe('false');
    expect(api.LMSCommit('')).toBe('false');
  });

  it('captures sets, fires onCommit, and logs events', () => {
    const onCommit = vi.fn();
    const api = createScorm12Api({ onCommit });
    api.LMSInitialize('');
    expect(api.LMSSetValue('cmi.core.score.raw', '8')).toBe('true');
    expect(api.LMSSetValue('cmi.core.score.max', '10')).toBe('true');
    expect(api.LMSSetValue('cmi.core.lesson_status', 'passed')).toBe('true');
    expect(api.LMSGetValue('cmi.core.score.raw')).toBe('8');
    expect(api.LMSCommit('')).toBe('true');
    expect(onCommit).toHaveBeenCalledTimes(1);

    expect(api.state.data['cmi.core.score.raw']).toBe('8');
    expect(api.events.some((e) => e.type === 'set' && e.key === 'cmi.core.score.raw' && e.value === '8')).toBe(true);
    expect(api.events.some((e) => e.type === 'commit')).toBe(true);
  });

  it('LMSFinish flips state and triggers onTerminate', () => {
    const onTerminate = vi.fn();
    const api = createScorm12Api({ onTerminate });
    api.LMSInitialize('');
    expect(api.LMSFinish('')).toBe('true');
    expect(api.state.finished).toBe(true);
    expect(api.state.initialized).toBe(false);
    expect(onTerminate).toHaveBeenCalledTimes(1);
  });

  it('rejects non-empty argument to API entry points', () => {
    const api = createScorm12Api();
    expect(api.LMSInitialize('foo')).toBe('false');
    expect(api.LMSGetLastError()).toBe('201');
  });

  it('LMSGetErrorString returns human-readable text for known codes', () => {
    const api = createScorm12Api();
    expect(api.LMSGetErrorString('0')).toBe('No error');
    expect(api.LMSGetErrorString('201')).toBe('Invalid argument error');
    expect(api.LMSGetErrorString('999')).toBe('');
  });

  it('isScorm12Complete + findScorm12Score helpers', () => {
    expect(isScorm12Complete({ 'cmi.core.lesson_status': 'passed' })).toBe(true);
    expect(isScorm12Complete({ 'cmi.core.lesson_status': 'incomplete' })).toBe(false);
    expect(findScorm12Score({ 'cmi.core.score.raw': '7', 'cmi.core.score.max': '10' })).toEqual({
      raw: 7,
      min: undefined,
      max: 10,
    });
  });
});
