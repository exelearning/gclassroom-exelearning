import type { AttachmentRow, AttemptRow, Env, GradeSyncState, GradingMode, UserRow } from '../types';

const ATTACHMENT_COLS = 'attachment_id, course_id, item_id, item_type, teacher_user_id, drive_file_id, drive_resource_key, title, max_points, grading_mode, created_at, updated_at';
const ATTEMPT_COLS = 'attempt_id, attachment_id, submission_id, student_user_id, scorm_version, scorm_data_json, normalized_score_json, points_earned, submitted_at, grade_sync_state, grade_sync_error, created_at, updated_at';

export async function upsertUser(env: Env, input: {
  googleUserId: string;
  email?: string;
  displayName?: string;
  encryptedRefreshToken?: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO users (google_user_id, email, display_name, encrypted_refresh_token, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?5)
     ON CONFLICT(google_user_id) DO UPDATE SET
       email = COALESCE(excluded.email, users.email),
       display_name = COALESCE(excluded.display_name, users.display_name),
       encrypted_refresh_token = COALESCE(excluded.encrypted_refresh_token, users.encrypted_refresh_token),
       updated_at = excluded.updated_at`,
  ).bind(
    input.googleUserId,
    input.email ?? null,
    input.displayName ?? null,
    input.encryptedRefreshToken ?? null,
    now,
  ).run();
}

export async function getUser(env: Env, googleUserId: string): Promise<UserRow | null> {
  const row = await env.DB.prepare(
    `SELECT google_user_id, email, display_name, encrypted_refresh_token, created_at, updated_at
     FROM users WHERE google_user_id = ?1`,
  ).bind(googleUserId).first<UserRow>();
  return row ?? null;
}

export async function insertAttachment(env: Env, input: {
  attachmentId: string;
  courseId: string;
  itemId: string;
  itemType: string;
  teacherUserId: string;
  driveFileId: string;
  driveResourceKey?: string | null;
  title: string;
  maxPoints: number;
  gradingMode: GradingMode;
}): Promise<AttachmentRow> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO attachments
       (${ATTACHMENT_COLS})
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)
     ON CONFLICT(attachment_id) DO UPDATE SET
       course_id = excluded.course_id,
       item_id = excluded.item_id,
       item_type = excluded.item_type,
       teacher_user_id = excluded.teacher_user_id,
       drive_file_id = excluded.drive_file_id,
       drive_resource_key = excluded.drive_resource_key,
       title = excluded.title,
       max_points = excluded.max_points,
       grading_mode = excluded.grading_mode,
       updated_at = excluded.updated_at`,
  ).bind(
    input.attachmentId,
    input.courseId,
    input.itemId,
    input.itemType,
    input.teacherUserId,
    input.driveFileId,
    input.driveResourceKey ?? null,
    input.title,
    input.maxPoints,
    input.gradingMode,
    now,
  ).run();
  const row = await getAttachment(env, input.attachmentId);
  if (!row) throw new Error('Attachment row missing after insert.');
  return row;
}

export async function getAttachment(env: Env, attachmentId: string): Promise<AttachmentRow | null> {
  const row = await env.DB.prepare(
    `SELECT ${ATTACHMENT_COLS} FROM attachments WHERE attachment_id = ?1`,
  ).bind(attachmentId).first<AttachmentRow>();
  return row ?? null;
}

export async function upsertAttempt(env: Env, input: {
  attemptId: string;
  attachmentId: string;
  submissionId: string;
  studentUserId: string;
  scormVersion?: string | null;
  scormDataJson: string;
  normalizedScoreJson?: string | null;
  pointsEarned?: number | null;
  submittedAt?: string | null;
  gradeSyncState?: GradeSyncState;
  gradeSyncError?: string | null;
}): Promise<AttemptRow> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO attempts
       (${ATTEMPT_COLS})
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)
     ON CONFLICT(attempt_id) DO UPDATE SET
       attachment_id = excluded.attachment_id,
       submission_id = excluded.submission_id,
       student_user_id = excluded.student_user_id,
       scorm_version = excluded.scorm_version,
       scorm_data_json = excluded.scorm_data_json,
       normalized_score_json = excluded.normalized_score_json,
       points_earned = excluded.points_earned,
       submitted_at = COALESCE(excluded.submitted_at, attempts.submitted_at),
       grade_sync_state = excluded.grade_sync_state,
       grade_sync_error = excluded.grade_sync_error,
       updated_at = excluded.updated_at`,
  ).bind(
    input.attemptId,
    input.attachmentId,
    input.submissionId,
    input.studentUserId,
    input.scormVersion ?? null,
    input.scormDataJson,
    input.normalizedScoreJson ?? null,
    input.pointsEarned ?? null,
    input.submittedAt ?? null,
    input.gradeSyncState ?? 'pending',
    input.gradeSyncError ?? null,
    now,
  ).run();
  const row = await getAttempt(env, input.attemptId);
  if (!row) throw new Error('Attempt row missing after insert.');
  return row;
}

export async function getAttempt(env: Env, attemptId: string): Promise<AttemptRow | null> {
  const row = await env.DB.prepare(
    `SELECT ${ATTEMPT_COLS} FROM attempts WHERE attempt_id = ?1`,
  ).bind(attemptId).first<AttemptRow>();
  return row ?? null;
}

export async function listAttemptsForSubmission(
  env: Env,
  attachmentId: string,
  submissionId: string,
): Promise<AttemptRow[]> {
  const result = await env.DB.prepare(
    `SELECT ${ATTEMPT_COLS} FROM attempts
     WHERE attachment_id = ?1 AND submission_id = ?2
     ORDER BY created_at ASC`,
  ).bind(attachmentId, submissionId).all<AttemptRow>();
  return (result.results as AttemptRow[]) ?? [];
}

export async function setAttemptSyncState(
  env: Env,
  attemptId: string,
  state: GradeSyncState,
  error?: string | null,
  pointsEarned?: number | null,
): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE attempts SET grade_sync_state = ?2, grade_sync_error = ?3,
       points_earned = COALESCE(?4, points_earned),
       updated_at = ?5
     WHERE attempt_id = ?1`,
  ).bind(attemptId, state, error ?? null, pointsEarned ?? null, now).run();
}

export function attachmentToApi(row: AttachmentRow) {
  return {
    attachmentId: row.attachment_id,
    courseId: row.course_id,
    itemId: row.item_id,
    itemType: row.item_type,
    driveFileId: row.drive_file_id,
    driveResourceKey: row.drive_resource_key ?? undefined,
    title: row.title,
    maxPoints: row.max_points,
    gradingMode: row.grading_mode,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function attemptToApi(row: AttemptRow, maxPoints: number) {
  let normalized: Record<string, unknown> | null = null;
  try { normalized = row.normalized_score_json ? JSON.parse(row.normalized_score_json) : null; } catch { /* ignore */ }
  let scormData: Record<string, string> = {};
  try { scormData = JSON.parse(row.scorm_data_json) as Record<string, string>; } catch { /* ignore */ }
  return {
    attemptId: row.attempt_id,
    attachmentId: row.attachment_id,
    submissionId: row.submission_id,
    scormVersion: (row.scorm_version ?? 'unknown') as '1.2' | '2004' | 'unknown',
    scormData,
    pointsEarned: row.points_earned,
    maxPoints,
    isComplete: Boolean((normalized as { isComplete?: boolean } | null)?.isComplete),
    isPassed: (normalized as { isPassed?: boolean } | null)?.isPassed,
    gradeSyncState: row.grade_sync_state,
    gradeSyncError: row.grade_sync_error ?? null,
    submittedAt: row.submitted_at ?? null,
    updatedAt: row.updated_at,
  };
}
