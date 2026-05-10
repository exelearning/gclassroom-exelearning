import { BACKEND_BASE_URL } from '../config';

export class BackendApiError extends Error {
  readonly status: number;
  readonly details: unknown;
  constructor(status: number, message: string, details: unknown) {
    super(message);
    this.name = 'BackendApiError';
    this.status = status;
    this.details = details;
  }
}

export interface BackendRequestOptions {
  /** Google access token of the calling user. The backend re-validates. */
  accessToken?: string;
  /** Body for POST/PATCH requests; will be JSON-encoded. */
  body?: unknown;
  /** Override default JSON content-type. */
  contentType?: string;
  signal?: AbortSignal;
}

export async function backendFetch<T>(
  method: string,
  path: string,
  options: BackendRequestOptions = {},
): Promise<T> {
  if (!BACKEND_BASE_URL) {
    throw new BackendApiError(0, 'Backend URL is not configured (VITE_BACKEND_BASE_URL).', null);
  }
  const url = `${BACKEND_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers();
  if (options.accessToken) headers.set('Authorization', `Bearer ${options.accessToken}`);
  if (options.body !== undefined && options.contentType !== 'multipart/form-data') {
    headers.set('Content-Type', options.contentType ?? 'application/json');
  }
  const res = await fetch(url, {
    method,
    headers,
    body: options.body === undefined ? undefined : (options.contentType ? (options.body as BodyInit) : JSON.stringify(options.body)),
    signal: options.signal,
  });
  if (!res.ok) {
    const ct = res.headers.get('Content-Type') ?? '';
    const details = ct.includes('application/json') ? await res.json() : await res.text();
    const message = typeof details === 'object' && details && 'error' in (details as Record<string, unknown>)
      ? String((details as { error: unknown }).error)
      : res.statusText || 'Backend request failed';
    throw new BackendApiError(res.status, message, details);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// Convenience wrappers ---------------------------------------------------------

export interface AttachmentRecord {
  attachmentId: string;
  courseId: string;
  itemId: string;
  itemType: string;
  driveFileId: string;
  driveResourceKey?: string;
  title: string;
  maxPoints: number;
  gradingMode: 'automatic' | 'review';
  createdAt: string;
  updatedAt: string;
}

export function postAttachment(input: Omit<AttachmentRecord, 'createdAt' | 'updatedAt'>, accessToken: string) {
  return backendFetch<AttachmentRecord>('POST', '/api/attachments', { body: input, accessToken });
}

export function getAttachment(attachmentId: string, accessToken: string) {
  return backendFetch<AttachmentRecord>('GET', `/api/attachments/${encodeURIComponent(attachmentId)}`, { accessToken });
}

export interface AttemptUpsert {
  attemptId?: string;
  attachmentId: string;
  submissionId: string;
  scormVersion: '1.2' | '2004' | 'unknown';
  scormData: Record<string, string>;
  /** Client-computed; backend recomputes authoritatively. */
  clientNormalizedScore?: { pointsEarned: number; maxPoints: number };
}

export interface AttemptRecord {
  attemptId: string;
  attachmentId: string;
  submissionId: string;
  scormVersion: '1.2' | '2004' | 'unknown';
  scormData: Record<string, string>;
  pointsEarned: number | null;
  maxPoints: number;
  isComplete: boolean;
  isPassed?: boolean;
  gradeSyncState: 'pending' | 'synced' | 'error' | 'manual_required';
  gradeSyncError?: string | null;
  submittedAt?: string | null;
  updatedAt: string;
}

export function postAttempt(input: AttemptUpsert, accessToken: string) {
  return backendFetch<AttemptRecord>('POST', '/api/attempts', { body: input, accessToken });
}

export function submitAttempt(attemptId: string, accessToken: string) {
  return backendFetch<AttemptRecord>('POST', `/api/attempts/${encodeURIComponent(attemptId)}/submit`, { accessToken });
}

export function getAttempt(attemptId: string, accessToken: string) {
  return backendFetch<AttemptRecord>('GET', `/api/attempts/${encodeURIComponent(attemptId)}`, { accessToken });
}

export function listAttempts(attachmentId: string, accessToken: string, submissionId?: string) {
  const qs = submissionId ? `?submissionId=${encodeURIComponent(submissionId)}` : '';
  return backendFetch<{ attempts: AttemptRecord[] }>(
    'GET',
    `/api/attachments/${encodeURIComponent(attachmentId)}/attempts${qs}`,
    { accessToken },
  );
}

export function pushGradeToClassroom(input: {
  courseId: string;
  itemId: string;
  attachmentId: string;
  submissionId: string;
  pointsEarned: number;
}, accessToken: string) {
  return backendFetch<{ ok: true; pointsEarned: number }>(
    'POST',
    '/api/classroom/grade-passback',
    { body: input, accessToken },
  );
}

export function getHealth() {
  return backendFetch<{ ok: true; version: string; time: string }>('GET', '/health', {});
}
