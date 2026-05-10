import type { ScormApiAdapter, ScormEvent, ScormRuntimeState } from './types';

// SCORM 1.2 error codes — subset that we report to content. Full list is in the
// CAM/RTE spec; everything else maps to 0 (no error).
const ERR_NO_ERROR = '0';
const ERR_INVALID_ARGUMENT = '201';
const ERR_NOT_INITIALIZED = '301';

const ERROR_STRINGS: Record<string, string> = {
  '0': 'No error',
  '101': 'General exception',
  '201': 'Invalid argument error',
  '301': 'Not initialized',
};

export interface Scorm12ApiOptions {
  initial?: Record<string, string>;
  onCommit?: (state: ScormRuntimeState) => void;
  onTerminate?: (state: ScormRuntimeState) => void;
  now?: () => Date;
}

export interface Scorm12Api extends ScormApiAdapter {
  LMSInitialize(arg: string): 'true' | 'false';
  LMSFinish(arg: string): 'true' | 'false';
  LMSGetValue(key: string): string;
  LMSSetValue(key: string, value: string): 'true' | 'false';
  LMSCommit(arg: string): 'true' | 'false';
  LMSGetLastError(): string;
  LMSGetErrorString(code: string): string;
  LMSGetDiagnostic(code: string): string;
}

export function createScorm12Api(options: Scorm12ApiOptions = {}): Scorm12Api {
  const now = options.now ?? (() => new Date());
  const state: ScormRuntimeState = {
    version: '1.2',
    data: { ...(options.initial ?? {}) },
    initialized: false,
    finished: false,
    lastError: ERR_NO_ERROR,
    lastErrorMessage: '',
  };
  const events: ScormEvent[] = [];
  const listeners = new Set<(state: ScormRuntimeState) => void>();

  function emit(): void {
    for (const listener of listeners) {
      try {
        listener(state);
      } catch {
        /* swallow listener errors so SCORM API remains synchronous */
      }
    }
  }

  function recordEvent(event: ScormEvent): void {
    events.push(event);
    if (events.length > 5000) {
      events.splice(0, events.length - 5000);
    }
  }

  function fail(code: string, message: string): 'false' {
    state.lastError = code;
    state.lastErrorMessage = message;
    recordEvent({ ts: now().toISOString(), type: 'error', errorCode: code, errorMessage: message });
    return 'false';
  }

  function ok(): 'true' {
    state.lastError = ERR_NO_ERROR;
    state.lastErrorMessage = '';
    return 'true';
  }

  return {
    state,
    events,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    LMSInitialize(arg) {
      if (arg !== '') {
        return fail(ERR_INVALID_ARGUMENT, 'LMSInitialize argument must be empty string');
      }
      if (state.initialized) {
        return ok();
      }
      state.initialized = true;
      state.finished = false;
      recordEvent({ ts: now().toISOString(), type: 'init' });
      emit();
      return ok();
    },
    LMSFinish(arg) {
      if (arg !== '') {
        return fail(ERR_INVALID_ARGUMENT, 'LMSFinish argument must be empty string');
      }
      if (!state.initialized) {
        return fail(ERR_NOT_INITIALIZED, 'LMSFinish called before LMSInitialize');
      }
      state.finished = true;
      state.initialized = false;
      recordEvent({ ts: now().toISOString(), type: 'finish' });
      options.onTerminate?.(state);
      emit();
      return ok();
    },
    LMSGetValue(key) {
      if (!state.initialized) {
        return fail(ERR_NOT_INITIALIZED, 'LMSGetValue called before LMSInitialize') === 'false' ? '' : '';
      }
      const value = state.data[key] ?? '';
      recordEvent({ ts: now().toISOString(), type: 'get', key, value });
      ok();
      return value;
    },
    LMSSetValue(key, value) {
      if (!state.initialized) {
        return fail(ERR_NOT_INITIALIZED, 'LMSSetValue called before LMSInitialize');
      }
      if (typeof key !== 'string' || key.length === 0) {
        return fail(ERR_INVALID_ARGUMENT, 'LMSSetValue requires a non-empty key');
      }
      state.data[key] = String(value);
      recordEvent({ ts: now().toISOString(), type: 'set', key, value: String(value) });
      emit();
      return ok();
    },
    LMSCommit(arg) {
      if (arg !== '') {
        return fail(ERR_INVALID_ARGUMENT, 'LMSCommit argument must be empty string');
      }
      if (!state.initialized) {
        return fail(ERR_NOT_INITIALIZED, 'LMSCommit called before LMSInitialize');
      }
      recordEvent({ ts: now().toISOString(), type: 'commit' });
      options.onCommit?.(state);
      emit();
      return ok();
    },
    LMSGetLastError() {
      return state.lastError;
    },
    LMSGetErrorString(code) {
      return ERROR_STRINGS[code] ?? '';
    },
    LMSGetDiagnostic(code) {
      if (!code) return state.lastErrorMessage;
      return ERROR_STRINGS[code] ?? '';
    },
  };
}

// Convenience: report whether a SCORM 1.2 state looks like a finished attempt.
export function isScorm12Complete(data: Record<string, string>): boolean {
  const status = data['cmi.core.lesson_status'];
  return status === 'completed' || status === 'passed' || status === 'failed';
}

export function findScorm12Score(data: Record<string, string>): {
  raw?: number;
  min?: number;
  max?: number;
} {
  const raw = num(data['cmi.core.score.raw']);
  const min = num(data['cmi.core.score.min']);
  const max = num(data['cmi.core.score.max']);
  return { raw, min, max };
}

function num(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export const __scorm12Internal = { ERR_NO_ERROR, ERR_INVALID_ARGUMENT, ERR_NOT_INITIALIZED };
