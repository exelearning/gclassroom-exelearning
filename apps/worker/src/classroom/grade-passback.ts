/**
 * Classroom add-on grade passback wrapper.
 *
 * Calls:
 *   PATCH https://classroom.googleapis.com/v1/courses/{courseId}/courseWork/{itemId}
 *         /addOnAttachments/{attachmentId}/studentSubmissions/{submissionId}
 *         ?updateMask=pointsEarned
 *
 * with body { pointsEarned: number }. Requires teacher OAuth scope
 * `classroom.coursework.students` (and `classroom.addons.teacher`). The
 * attachment must have been created by THIS add-on with positive maxPoints.
 *
 * Caller MUST recompute pointsEarned from raw SCORM data before invoking
 * this; see scoring/normalize.ts.
 */

export class GradePassbackError extends Error {
  readonly status: number;
  readonly details: unknown;
  constructor(status: number, message: string, details: unknown) {
    super(message);
    this.name = 'GradePassbackError';
    this.status = status;
    this.details = details;
  }
}

export interface GradePassbackInput {
  courseId: string;
  itemId: string;
  itemType?: 'COURSE_WORK' | 'COURSE_WORK_MATERIAL' | 'ANNOUNCEMENT';
  attachmentId: string;
  submissionId: string;
  pointsEarned: number;
}

export interface GradePassbackDeps {
  /** Bearer access token for a teacher with addons.teacher + coursework.students. */
  accessToken: string;
  /** Override fetch (for tests). */
  fetchImpl?: typeof fetch;
  /** Override base URL (for tests / staging). */
  apiBase?: string;
}

const DEFAULT_BASE = 'https://classroom.googleapis.com';

export async function patchGradePassback(
  input: GradePassbackInput,
  deps: GradePassbackDeps,
): Promise<{ ok: true; pointsEarned: number; statusCode: number }> {
  validateInput(input);
  const itemType = input.itemType ?? 'COURSE_WORK';

  const url = buildUrl(deps.apiBase ?? DEFAULT_BASE, input.courseId, itemType, input.itemId, input.attachmentId, input.submissionId);
  const fetchFn = deps.fetchImpl ?? fetch;

  const res = await fetchFn(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${deps.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ pointsEarned: input.pointsEarned }),
  });

  if (!res.ok) {
    const ct = res.headers.get('Content-Type') ?? '';
    const details = ct.includes('application/json') ? await res.json() : await res.text();
    throw new GradePassbackError(res.status, gradeErrorMessage(res.status, details), details);
  }
  return { ok: true, pointsEarned: input.pointsEarned, statusCode: res.status };
}

function validateInput(input: GradePassbackInput): void {
  for (const key of ['courseId', 'itemId', 'attachmentId', 'submissionId'] as const) {
    if (!input[key] || typeof input[key] !== 'string') {
      throw new GradePassbackError(400, `Grade passback missing required field: ${key}`, null);
    }
  }
  if (typeof input.pointsEarned !== 'number' || !Number.isFinite(input.pointsEarned) || input.pointsEarned < 0) {
    throw new GradePassbackError(400, `Grade passback pointsEarned must be a non-negative number; got ${input.pointsEarned}`, null);
  }
}

export function buildUrl(
  base: string,
  courseId: string,
  itemType: GradePassbackInput['itemType'],
  itemId: string,
  attachmentId: string,
  submissionId: string,
): string {
  const segment = itemType === 'COURSE_WORK_MATERIAL'
    ? 'courseWorkMaterials'
    : itemType === 'ANNOUNCEMENT'
      ? 'announcements'
      : 'courseWork';
  const root = base.replace(/\/$/, '');
  return `${root}/v1/courses/${encode(courseId)}/${segment}/${encode(itemId)}/addOnAttachments/${encode(attachmentId)}/studentSubmissions/${encode(submissionId)}?updateMask=pointsEarned`;
}

function encode(v: string): string {
  return encodeURIComponent(v);
}

function gradeErrorMessage(status: number, details: unknown): string {
  if (typeof details === 'object' && details && 'error' in (details as Record<string, unknown>)) {
    const inner = (details as { error: { message?: string } }).error;
    if (inner?.message) return `Classroom grade passback failed (${status}): ${inner.message}`;
  }
  return `Classroom grade passback failed (${status})`;
}
