import { Hono } from 'hono';
import type { Env } from '../types';
import { type AuthVariables, requireGoogleAuth } from '../middleware/auth';
import {
  attemptToApi,
  getAttachment,
  getAttempt,
  setAttemptSyncState,
  upsertAttempt,
} from '../db/queries';
import { normalizeScormScore } from '../scoring/normalize';
import { decryptRefreshToken } from '../crypto/token-vault';
import { getUser } from '../db/queries';
import { refreshAccessToken } from '../auth/google-oauth';
import { patchGradePassback, GradePassbackError } from '../classroom/grade-passback';

export const attemptRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

attemptRoutes.use('/api/attempts*', requireGoogleAuth);

interface UpsertAttemptBody {
  attemptId?: string;
  attachmentId: string;
  submissionId: string;
  scormVersion: '1.2' | '2004' | 'unknown';
  scormData: Record<string, string>;
  clientNormalizedScore?: { pointsEarned: number; maxPoints: number };
}

attemptRoutes.post('/api/attempts', async (c) => {
  let body: UpsertAttemptBody;
  try { body = (await c.req.json()) as UpsertAttemptBody; }
  catch { return c.json({ error: 'Body must be JSON.' }, 400); }

  if (!body.attachmentId || !body.submissionId) {
    return c.json({ error: 'attachmentId and submissionId are required.' }, 400);
  }
  if (!body.scormData || typeof body.scormData !== 'object') {
    return c.json({ error: 'scormData must be an object of CMI keys/values.' }, 400);
  }
  const attachment = await getAttachment(c.env, body.attachmentId);
  if (!attachment) return c.json({ error: 'Attachment not found.' }, 404);

  // Authoritative recomputation — never trust clientNormalizedScore.
  const score = normalizeScormScore({ data: body.scormData, maxPoints: attachment.max_points });

  const user = c.get('user');
  const attemptId = body.attemptId ?? newAttemptId();

  const row = await upsertAttempt(c.env, {
    attemptId,
    attachmentId: body.attachmentId,
    submissionId: body.submissionId,
    studentUserId: user.sub,
    scormVersion: body.scormVersion,
    scormDataJson: JSON.stringify(body.scormData),
    normalizedScoreJson: JSON.stringify(score),
    pointsEarned: score.pointsEarned,
    gradeSyncState: 'pending',
  });
  return c.json(attemptToApi(row, attachment.max_points));
});

attemptRoutes.get('/api/attempts/:attemptId', async (c) => {
  const row = await getAttempt(c.env, c.req.param('attemptId'));
  if (!row) return c.json({ error: 'Attempt not found.' }, 404);
  const attachment = await getAttachment(c.env, row.attachment_id);
  if (!attachment) return c.json({ error: 'Attachment not found.' }, 404);
  return c.json(attemptToApi(row, attachment.max_points));
});

attemptRoutes.post('/api/attempts/:attemptId/submit', async (c) => {
  const attemptId = c.req.param('attemptId');
  const row = await getAttempt(c.env, attemptId);
  if (!row) return c.json({ error: 'Attempt not found.' }, 404);

  const attachment = await getAttachment(c.env, row.attachment_id);
  if (!attachment) return c.json({ error: 'Attachment not found.' }, 404);

  // Recompute score from raw SCORM data on submit (defense-in-depth).
  let scormData: Record<string, string> = {};
  try { scormData = JSON.parse(row.scorm_data_json) as Record<string, string>; } catch { /* ignore */ }
  const score = normalizeScormScore({ data: scormData, maxPoints: attachment.max_points });
  const submittedAt = new Date().toISOString();

  await upsertAttempt(c.env, {
    attemptId,
    attachmentId: row.attachment_id,
    submissionId: row.submission_id,
    studentUserId: row.student_user_id,
    scormVersion: row.scorm_version,
    scormDataJson: row.scorm_data_json,
    normalizedScoreJson: JSON.stringify(score),
    pointsEarned: score.pointsEarned,
    submittedAt,
    gradeSyncState: attachment.grading_mode === 'automatic' ? 'pending' : 'manual_required',
  });

  if (attachment.grading_mode !== 'automatic') {
    const fresh = await getAttempt(c.env, attemptId);
    return c.json(attemptToApi(fresh!, attachment.max_points));
  }

  // Mode A — backend uses stored teacher refresh token to push the grade.
  try {
    const teacher = await getUser(c.env, attachment.teacher_user_id);
    if (!teacher?.encrypted_refresh_token) {
      throw new Error('Teacher has not enabled automatic grading (no offline refresh token stored).');
    }
    const refreshToken = await decryptRefreshToken(teacher.encrypted_refresh_token, c.env.TOKEN_VAULT_KEY);
    const fresh = await refreshAccessToken(c.env, refreshToken);
    await patchGradePassback(
      {
        courseId: attachment.course_id,
        itemId: attachment.item_id,
        itemType: attachment.item_type as 'COURSE_WORK' | 'COURSE_WORK_MATERIAL' | 'ANNOUNCEMENT',
        attachmentId: attachment.attachment_id,
        submissionId: row.submission_id,
        pointsEarned: score.pointsEarned,
      },
      { accessToken: fresh.accessToken, apiBase: c.env.CLASSROOM_API_BASE },
    );
    await setAttemptSyncState(c.env, attemptId, 'synced', null, score.pointsEarned);
  } catch (error) {
    const message = error instanceof GradePassbackError
      ? `Classroom returned ${error.status}: ${error.message}`
      : error instanceof Error ? error.message : String(error);
    await setAttemptSyncState(c.env, attemptId, 'error', message);
  }

  const updated = await getAttempt(c.env, attemptId);
  return c.json(attemptToApi(updated!, attachment.max_points));
});

function newAttemptId(): string {
  return crypto.randomUUID();
}
