import { describe, it, expect, vi } from 'vitest';
import { createScorm2004Api, findScorm2004Score } from './scorm2004';

describe('SCORM 2004 adapter', () => {
  it('Initialize/Terminate sequence is enforced', () => {
    const api = createScorm2004Api();
    expect(api.GetValue('cmi.score.scaled')).toBe('');
    expect(api.GetLastError()).toBe('122');
    expect(api.Initialize('')).toBe('true');
    expect(api.Initialize('')).toBe('false');
    expect(api.GetLastError()).toBe('103');
    expect(api.Terminate('')).toBe('true');
    expect(api.Terminate('')).toBe('false');
  });

  it('SetValue captures CMI keys and triggers onCommit', () => {
    const onCommit = vi.fn();
    const api = createScorm2004Api({ onCommit });
    api.Initialize('');
    expect(api.SetValue('cmi.score.scaled', '0.85')).toBe('true');
    expect(api.SetValue('cmi.completion_status', 'completed')).toBe('true');
    expect(api.SetValue('cmi.success_status', 'passed')).toBe('true');
    expect(api.Commit('')).toBe('true');
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(api.state.data['cmi.score.scaled']).toBe('0.85');
  });

  it('GetValue returns empty string for unset keys without error after init', () => {
    const api = createScorm2004Api();
    api.Initialize('');
    expect(api.GetValue('cmi.location')).toBe('');
    expect(api.GetLastError()).toBe('0');
  });

  it('rejects empty key SetValue', () => {
    const api = createScorm2004Api();
    api.Initialize('');
    expect(api.SetValue('', 'x')).toBe('false');
    expect(api.GetLastError()).toBe('201');
  });

  it('findScorm2004Score parses scaled when present', () => {
    expect(findScorm2004Score({ 'cmi.score.scaled': '0.5', 'cmi.score.raw': '50' })).toEqual({
      scaled: 0.5,
      raw: 50,
      min: undefined,
      max: undefined,
    });
  });

  it('events include error entries on misuse', () => {
    const api = createScorm2004Api();
    api.GetValue('cmi.score.raw'); // not initialized
    expect(api.events.some((e) => e.type === 'error' && e.errorCode === '122')).toBe(true);
  });
});
