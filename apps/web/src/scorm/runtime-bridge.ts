import type { ScormRuntimeState } from './types';
import { createScorm12Api, type Scorm12Api } from './scorm12';
import { createScorm2004Api, type Scorm2004Api } from './scorm2004';
import { normalizeScormScore } from './normalize';

export interface ScormRuntime {
  scorm12: Scorm12Api;
  scorm2004: Scorm2004Api;
  /** Latest combined CMI data (1.2 keys + 2004 keys, flat). */
  snapshot(): { version: '1.2' | '2004' | 'unknown'; data: Record<string, string> };
  /** Subscribe to either adapter committing or finishing. */
  onChange(listener: () => void): () => void;
  /** Compute a normalized score using current data + maxPoints. */
  computeScore(maxPoints: number): ReturnType<typeof normalizeScormScore>;
}

export interface ScormRuntimeOptions {
  /** Called whenever either adapter mutates. Useful for autosave. */
  onChange?: (state: ScormRuntimeState) => void;
}

/**
 * Bundle SCORM 1.2 and 2004 adapters together so content can target either.
 * eXeLearning packages built with different export profiles use different
 * APIs; we always expose both.
 */
export function createScormRuntime(options: ScormRuntimeOptions = {}): ScormRuntime {
  const scorm12 = createScorm12Api();
  const scorm2004 = createScorm2004Api();

  const listeners = new Set<() => void>();
  const fanout = (state: ScormRuntimeState) => {
    options.onChange?.(state);
    for (const fn of listeners) {
      try { fn(); } catch { /* ignore */ }
    }
  };
  scorm12.onChange(fanout);
  scorm2004.onChange(fanout);

  return {
    scorm12,
    scorm2004,
    snapshot() {
      const used2004 = scorm2004.state.initialized || scorm2004.state.finished || Object.keys(scorm2004.state.data).length > 0;
      const used12 = scorm12.state.initialized || scorm12.state.finished || Object.keys(scorm12.state.data).length > 0;
      const data = { ...scorm12.state.data, ...scorm2004.state.data };
      const version = used2004 ? '2004' : used12 ? '1.2' : 'unknown';
      return { version, data };
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    computeScore(maxPoints) {
      const snap = this.snapshot();
      return normalizeScormScore({ version: snap.version, data: snap.data, maxPoints });
    },
  };
}
