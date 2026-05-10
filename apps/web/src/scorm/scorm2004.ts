import type { ScormApiAdapter, ScormEvent, ScormRuntimeState } from './types';

const ERR_NO_ERROR = '0';
const ERR_NOT_INITIALIZED = '122';
const ERR_ALREADY_INITIALIZED = '103';
const ERR_TERMINATED = '113';
const ERR_INVALID_ARGUMENT = '201';

const ERROR_STRINGS: Record<string, string> = {
  '0': 'No error',
  '101': 'General exception',
  '103': 'Already initialized',
  '113': 'Termination after termination',
  '122': 'Retrieve data before initialization',
  '201': 'General argument error',
  '301': 'General get failure',
  '351': 'General set failure',
};

export interface Scorm2004ApiOptions {
  initial?: Record<string, string>;
  onCommit?: (state: ScormRuntimeState) => void;
  onTerminate?: (state: ScormRuntimeState) => void;
  now?: () => Date;
}

export interface Scorm2004Api extends ScormApiAdapter {
  Initialize(arg: string): 'true' | 'false';
  Terminate(arg: string): 'true' | 'false';
  GetValue(key: string): string;
  SetValue(key: string, value: string): 'true' | 'false';
  Commit(arg: string): 'true' | 'false';
  GetLastError(): string;
  GetErrorString(code: string): string;
  GetDiagnostic(code: string): string;
}

export function createScorm2004Api(options: Scorm2004ApiOptions = {}): Scorm2004Api {
  const now = options.now ?? (() => new Date());
  const state: ScormRuntimeState = {
    version: '2004',
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
      try { listener(state); } catch { /* ignore */ }
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
    Initialize(arg) {
      if (arg !== '') return fail(ERR_INVALID_ARGUMENT, 'Initialize argument must be empty string');
      if (state.finished) return fail(ERR_TERMINATED, 'Cannot Initialize after Terminate');
      if (state.initialized) return fail(ERR_ALREADY_INITIALIZED, 'Already initialized');
      state.initialized = true;
      recordEvent({ ts: now().toISOString(), type: 'init' });
      emit();
      return ok();
    },
    Terminate(arg) {
      if (arg !== '') return fail(ERR_INVALID_ARGUMENT, 'Terminate argument must be empty string');
      if (!state.initialized) return fail(ERR_NOT_INITIALIZED, 'Terminate before Initialize');
      state.finished = true;
      state.initialized = false;
      recordEvent({ ts: now().toISOString(), type: 'finish' });
      options.onTerminate?.(state);
      emit();
      return ok();
    },
    GetValue(key) {
      if (!state.initialized) {
        fail(ERR_NOT_INITIALIZED, 'GetValue before Initialize');
        return '';
      }
      const value = state.data[key] ?? '';
      recordEvent({ ts: now().toISOString(), type: 'get', key, value });
      ok();
      return value;
    },
    SetValue(key, value) {
      if (!state.initialized) return fail(ERR_NOT_INITIALIZED, 'SetValue before Initialize');
      if (typeof key !== 'string' || key.length === 0) {
        return fail(ERR_INVALID_ARGUMENT, 'SetValue requires a non-empty key');
      }
      state.data[key] = String(value);
      recordEvent({ ts: now().toISOString(), type: 'set', key, value: String(value) });
      emit();
      return ok();
    },
    Commit(arg) {
      if (arg !== '') return fail(ERR_INVALID_ARGUMENT, 'Commit argument must be empty string');
      if (!state.initialized) return fail(ERR_NOT_INITIALIZED, 'Commit before Initialize');
      recordEvent({ ts: now().toISOString(), type: 'commit' });
      options.onCommit?.(state);
      emit();
      return ok();
    },
    GetLastError() {
      return state.lastError;
    },
    GetErrorString(code) {
      return ERROR_STRINGS[code] ?? '';
    },
    GetDiagnostic(code) {
      if (!code) return state.lastErrorMessage;
      return ERROR_STRINGS[code] ?? '';
    },
  };
}

export function findScorm2004Score(data: Record<string, string>): {
  raw?: number;
  min?: number;
  max?: number;
  scaled?: number;
} {
  return {
    raw: num(data['cmi.score.raw']),
    min: num(data['cmi.score.min']),
    max: num(data['cmi.score.max']),
    scaled: num(data['cmi.score.scaled']),
  };
}

function num(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export const __scorm2004Internal = { ERR_NO_ERROR, ERR_INVALID_ARGUMENT, ERR_NOT_INITIALIZED, ERR_TERMINATED };
