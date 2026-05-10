import { describe, it, expect, vi } from 'vitest';
import { createScormRuntime } from './runtime-bridge';

describe('createScormRuntime', () => {
  it('fans out change events from both adapters', () => {
    const onChange = vi.fn();
    const runtime = createScormRuntime({ onChange });
    runtime.scorm12.LMSInitialize('');
    runtime.scorm12.LMSSetValue('cmi.core.score.raw', '8');
    runtime.scorm2004.Initialize('');
    runtime.scorm2004.SetValue('cmi.score.scaled', '0.9');
    expect(onChange).toHaveBeenCalled();
  });

  it('snapshot reports 2004 when 2004 has been used', () => {
    const runtime = createScormRuntime();
    runtime.scorm2004.Initialize('');
    runtime.scorm2004.SetValue('cmi.score.scaled', '0.5');
    expect(runtime.snapshot().version).toBe('2004');
  });

  it('snapshot reports 1.2 when only 1.2 has been used', () => {
    const runtime = createScormRuntime();
    runtime.scorm12.LMSInitialize('');
    runtime.scorm12.LMSSetValue('cmi.core.score.raw', '5');
    expect(runtime.snapshot().version).toBe('1.2');
  });

  it('computeScore uses normalize rules', () => {
    const runtime = createScormRuntime();
    runtime.scorm2004.Initialize('');
    runtime.scorm2004.SetValue('cmi.score.scaled', '0.7');
    const score = runtime.computeScore(10);
    expect(score.pointsEarned).toBe(7);
  });

  it('listeners can be unsubscribed', () => {
    const runtime = createScormRuntime();
    const listener = vi.fn();
    const off = runtime.onChange(listener);
    runtime.scorm12.LMSInitialize('');
    runtime.scorm12.LMSSetValue('cmi.core.score.raw', '1');
    off();
    runtime.scorm12.LMSSetValue('cmi.core.score.raw', '2');
    expect(listener).toHaveBeenCalledTimes(2); // init + first set; second set doesn't fire
  });
});
