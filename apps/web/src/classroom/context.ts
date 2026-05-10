/**
 * Classroom add-on context parsing.
 *
 * Classroom delivers context via query params on each iframe URL:
 *   - Discovery   : ?courseId=&itemId=&itemType=&login_hint=&hd=
 *   - Teacher view: ?courseId=&itemId=&itemType=&attachmentId=&login_hint=
 *   - Student view: ?courseId=&itemId=&itemType=&attachmentId=&submissionId=&login_hint=
 *   - Review view : ?courseId=&itemId=&itemType=&attachmentId=&submissionId=&login_hint=
 *
 * In addition to query params we encode our own attachmentRef so the URL works
 * even if Classroom drops/strips the standard params (which it does in some
 * preview/dev paths). The reference points to backend metadata.
 *
 * Critically: query params alone are NOT enough authentication. Production
 * code MUST validate role/identity by calling the Classroom add-on context
 * API server-side or via the GIS-issued ID token.
 */

export type ClassroomItemType =
  | 'COURSE_WORK'
  | 'COURSE_WORK_MATERIAL'
  | 'ANNOUNCEMENT'
  | 'UNKNOWN';

export type ClassroomRoleHint = 'teacher' | 'student' | 'unknown';

export interface ClassroomContext {
  courseId: string | null;
  itemId: string | null;
  itemType: ClassroomItemType;
  attachmentId: string | null;
  submissionId: string | null;
  attachmentRef: string | null;
  loginHint: string | null;
  hostedDomain: string | null;
  /**
   * Best-effort hint: derived from URL pathname (/addon/teacher → 'teacher').
   * Authoritative role MUST come from a backend validation call.
   */
  roleHint: ClassroomRoleHint;
}

const VALID_ITEM_TYPES: ClassroomItemType[] = [
  'COURSE_WORK',
  'COURSE_WORK_MATERIAL',
  'ANNOUNCEMENT',
];

export function parseClassroomContext(url: string | URL): ClassroomContext {
  const u = typeof url === 'string' ? new URL(url, 'https://placeholder.invalid') : url;
  const params = u.searchParams;

  const itemTypeRaw = params.get('itemType');
  const itemType: ClassroomItemType = itemTypeRaw && (VALID_ITEM_TYPES as string[]).includes(itemTypeRaw)
    ? (itemTypeRaw as ClassroomItemType)
    : itemTypeRaw === null
      ? 'UNKNOWN'
      : 'UNKNOWN';

  const path = u.pathname;
  let roleHint: ClassroomRoleHint = 'unknown';
  if (/\/addon\/(teacher|review|discovery)(\/|$)/.test(path)) roleHint = 'teacher';
  else if (/\/addon\/student(\/|$)/.test(path)) roleHint = 'student';

  return {
    courseId: nonEmpty(params.get('courseId')),
    itemId: nonEmpty(params.get('itemId')),
    itemType,
    attachmentId: nonEmpty(params.get('attachmentId')),
    submissionId: nonEmpty(params.get('submissionId')),
    attachmentRef: nonEmpty(params.get('attachmentRef')),
    loginHint: nonEmpty(params.get('login_hint')),
    hostedDomain: nonEmpty(params.get('hd')),
    roleHint,
  };
}

export interface ContextValidationOptions {
  required: Array<keyof ClassroomContext>;
}

export class ClassroomContextError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`Missing required Classroom add-on context: ${missing.join(', ')}`);
    this.name = 'ClassroomContextError';
    this.missing = missing;
  }
}

export function validateContext(
  ctx: ClassroomContext,
  options: ContextValidationOptions,
): ClassroomContext {
  const missing: string[] = [];
  for (const key of options.required) {
    const value = ctx[key];
    if (value === null || value === undefined || value === 'UNKNOWN') {
      missing.push(String(key));
    }
  }
  if (missing.length > 0) {
    throw new ClassroomContextError(missing);
  }
  return ctx;
}

function nonEmpty(value: string | null): string | null {
  return value && value.length > 0 ? value : null;
}
