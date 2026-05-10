import type { NormalizedScore, ScormEvent, ScormVersion } from '../scorm/types';

export interface AttemptState {
  attemptId: string;
  attachmentId: string;
  submissionId: string;
  courseId: string;
  itemId: string;
  userId: string | null;
  fileId: string;
  startedAt: string;
  updatedAt: string;
  submittedAt?: string;
  scormVersion?: ScormVersion;
  scormData: Record<string, string>;
  normalizedScore?: NormalizedScore;
  eventLog: ScormEvent[];
}

export interface AttemptInitInput {
  attemptId?: string;
  attachmentId: string;
  submissionId: string;
  courseId: string;
  itemId: string;
  userId: string | null;
  fileId: string;
  now?: () => Date;
}

export function initAttempt(input: AttemptInitInput): AttemptState {
  const now = (input.now ?? (() => new Date()))().toISOString();
  return {
    attemptId: input.attemptId ?? newAttemptId(),
    attachmentId: input.attachmentId,
    submissionId: input.submissionId,
    courseId: input.courseId,
    itemId: input.itemId,
    userId: input.userId,
    fileId: input.fileId,
    startedAt: now,
    updatedAt: now,
    scormData: {},
    eventLog: [],
  };
}

export function applyScormUpdate(
  state: AttemptState,
  update: {
    version: ScormVersion;
    data: Record<string, string>;
    events: ScormEvent[];
    normalizedScore?: NormalizedScore;
  },
  now: () => Date = () => new Date(),
): AttemptState {
  const merged = state.eventLog.length + update.events.length > 5000
    ? [...state.eventLog.slice(-2500), ...update.events.slice(-2500)]
    : [...state.eventLog, ...update.events];
  return {
    ...state,
    updatedAt: now().toISOString(),
    scormVersion: update.version,
    scormData: { ...state.scormData, ...update.data },
    normalizedScore: update.normalizedScore ?? state.normalizedScore,
    eventLog: merged,
  };
}

export function markSubmitted(state: AttemptState, now: () => Date = () => new Date()): AttemptState {
  const ts = now().toISOString();
  return { ...state, updatedAt: ts, submittedAt: ts };
}

export function isDirty(prev: AttemptState | null, next: AttemptState): boolean {
  if (!prev) return true;
  if (prev.updatedAt !== next.updatedAt) return true;
  if (prev.submittedAt !== next.submittedAt) return true;
  if (prev.scormData !== next.scormData) {
    const prevKeys = Object.keys(prev.scormData);
    const nextKeys = Object.keys(next.scormData);
    if (prevKeys.length !== nextKeys.length) return true;
    for (const key of nextKeys) {
      if (prev.scormData[key] !== next.scormData[key]) return true;
    }
  }
  return false;
}

function newAttemptId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `att-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}
