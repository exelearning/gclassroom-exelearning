/**
 * Wrappers around the Google Classroom add-on REST API. Used by the frontend
 * for teacher-driven actions (creating attachments, listing courses).
 *
 * NOTE: Grade passback is intentionally NOT performed here — it requires
 * teacher credentials and runs through the backend Worker so refresh tokens
 * never live in the browser. See apps/worker/src/classroom/grade-passback.ts.
 */

const CLASSROOM_BASE = 'https://classroom.googleapis.com/v1';

export class ClassroomApiError extends Error {
  readonly status: number;
  readonly details: unknown;
  constructor(status: number, message: string, details: unknown) {
    super(message);
    this.name = 'ClassroomApiError';
    this.status = status;
    this.details = details;
  }
}

export interface ClassroomAuth {
  accessToken: string;
  signal?: AbortSignal;
}

export interface UriRef {
  uri: string;
}

export interface AddOnAttachmentInput {
  courseId: string;
  itemId: string;
  itemType: 'COURSE_WORK' | 'COURSE_WORK_MATERIAL' | 'ANNOUNCEMENT';
  body: {
    title: string;
    teacherViewUri: UriRef;
    studentViewUri: UriRef;
    studentWorkReviewUri: UriRef;
    maxPoints: number;
  };
}

export interface AddOnAttachment {
  id: string;
  courseId: string;
  itemId: string;
  itemType: string;
  title: string;
  maxPoints?: number;
  teacherViewUri?: UriRef;
  studentViewUri?: UriRef;
  studentWorkReviewUri?: UriRef;
}

export async function createAddOnAttachment(
  input: AddOnAttachmentInput,
  auth: ClassroomAuth,
): Promise<AddOnAttachment> {
  if (!input.body.studentWorkReviewUri?.uri) {
    throw new Error('studentWorkReviewUri is required for graded activity attachments.');
  }
  if (!Number.isFinite(input.body.maxPoints) || input.body.maxPoints <= 0) {
    throw new Error('maxPoints must be a positive number for graded activity attachments.');
  }
  const path = endpointFor(input.itemType, input.courseId, input.itemId);
  const url = `${CLASSROOM_BASE}${path}/addOnAttachments`;
  const res = await fetch(url, {
    method: 'POST',
    headers: jsonAuth(auth),
    body: JSON.stringify(input.body),
    signal: auth.signal,
  });
  return parseJson<AddOnAttachment>(res);
}

export interface ClassroomCourse {
  id: string;
  name: string;
  section?: string;
  courseState: string;
}

export async function listMyCourses(auth: ClassroomAuth): Promise<ClassroomCourse[]> {
  const url = `${CLASSROOM_BASE}/courses?courseStates=ACTIVE&teacherId=me&pageSize=100`;
  const out = await parseJson<{ courses?: ClassroomCourse[] }>(
    await fetch(url, { headers: bearer(auth), signal: auth.signal }),
  );
  return out.courses ?? [];
}

export interface CreateCourseWorkInput {
  courseId: string;
  title: string;
  description?: string;
  maxPoints: number;
  /** When omitted Classroom defaults to PUBLISHED. */
  state?: 'DRAFT' | 'PUBLISHED';
  topicId?: string;
  link?: { url: string; title?: string };
}

export interface CourseWork {
  id: string;
  courseId: string;
  title: string;
  workType?: string;
  state?: string;
  alternateLink?: string;
}

export async function createCourseWork(
  input: CreateCourseWorkInput,
  auth: ClassroomAuth,
): Promise<CourseWork> {
  const url = `${CLASSROOM_BASE}/courses/${encodeURIComponent(input.courseId)}/courseWork`;
  const body: Record<string, unknown> = {
    title: input.title,
    description: input.description,
    workType: 'ASSIGNMENT',
    state: input.state ?? 'PUBLISHED',
    maxPoints: input.maxPoints,
  };
  if (input.link) {
    body['materials'] = [{ link: { url: input.link.url, title: input.link.title } }];
  }
  if (input.topicId) body['topicId'] = input.topicId;
  return parseJson<CourseWork>(
    await fetch(url, { method: 'POST', headers: jsonAuth(auth), body: JSON.stringify(body), signal: auth.signal }),
  );
}

function endpointFor(itemType: AddOnAttachmentInput['itemType'], courseId: string, itemId: string): string {
  switch (itemType) {
    case 'COURSE_WORK':
      return `/courses/${courseId}/courseWork/${itemId}`;
    case 'COURSE_WORK_MATERIAL':
      return `/courses/${courseId}/courseWorkMaterials/${itemId}`;
    case 'ANNOUNCEMENT':
      return `/courses/${courseId}/announcements/${itemId}`;
  }
}

function jsonAuth(auth: ClassroomAuth): Headers {
  const headers = bearer(auth);
  headers.set('Content-Type', 'application/json; charset=UTF-8');
  return headers;
}

function bearer(auth: ClassroomAuth): Headers {
  return new Headers({ Authorization: `Bearer ${auth.accessToken}` });
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const ct = res.headers.get('Content-Type') ?? '';
    const details = ct.includes('application/json') ? await res.json() : await res.text();
    const message = typeof details === 'object' && details && 'error' in (details as Record<string, unknown>)
      ? String(((details as { error: { message?: string } }).error?.message) ?? res.statusText)
      : res.statusText || 'Classroom request failed';
    throw new ClassroomApiError(res.status, message, details);
  }
  return res.json() as Promise<T>;
}
