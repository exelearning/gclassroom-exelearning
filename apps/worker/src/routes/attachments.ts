import { Hono } from 'hono';
import type { Env } from '../types';
import { type AuthVariables, requireGoogleAuth } from '../middleware/auth';
import { attachmentToApi, getAttachment, insertAttachment, listAttemptsForSubmission, attemptToApi } from '../db/queries';

export const attachmentRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

attachmentRoutes.use('/api/attachments/*', requireGoogleAuth);

interface CreateAttachmentBody {
  attachmentId: string;
  courseId: string;
  itemId: string;
  itemType: string;
  driveFileId: string;
  driveResourceKey?: string;
  title: string;
  maxPoints: number;
  gradingMode: 'automatic' | 'review';
}

attachmentRoutes.post('/api/attachments', async (c) => {
  let body: CreateAttachmentBody;
  try {
    body = (await c.req.json()) as CreateAttachmentBody;
  } catch {
    return c.json({ error: 'Body must be JSON.' }, 400);
  }
  for (const key of ['attachmentId', 'courseId', 'itemId', 'itemType', 'driveFileId', 'title'] as const) {
    if (!body[key]) return c.json({ error: `Missing field: ${key}` }, 400);
  }
  if (!Number.isFinite(body.maxPoints) || body.maxPoints <= 0) {
    return c.json({ error: 'maxPoints must be a positive number for graded attachments.' }, 400);
  }
  if (body.gradingMode !== 'automatic' && body.gradingMode !== 'review') {
    return c.json({ error: 'gradingMode must be "automatic" or "review".' }, 400);
  }
  const user = c.get('user');
  const row = await insertAttachment(c.env, {
    attachmentId: body.attachmentId,
    courseId: body.courseId,
    itemId: body.itemId,
    itemType: body.itemType,
    teacherUserId: user.sub,
    driveFileId: body.driveFileId,
    driveResourceKey: body.driveResourceKey,
    title: body.title,
    maxPoints: body.maxPoints,
    gradingMode: body.gradingMode,
  });
  return c.json(attachmentToApi(row));
});

attachmentRoutes.get('/api/attachments/:attachmentId', async (c) => {
  const id = c.req.param('attachmentId');
  const row = await getAttachment(c.env, id);
  if (!row) return c.json({ error: 'Attachment not found.' }, 404);
  return c.json(attachmentToApi(row));
});

attachmentRoutes.get('/api/attachments/:attachmentId/attempts', async (c) => {
  const attachmentId = c.req.param('attachmentId');
  const submissionId = c.req.query('submissionId');
  if (!submissionId) return c.json({ error: 'submissionId query parameter is required.' }, 400);
  const attachment = await getAttachment(c.env, attachmentId);
  if (!attachment) return c.json({ error: 'Attachment not found.' }, 404);
  const rows = await listAttemptsForSubmission(c.env, attachmentId, submissionId);
  return c.json({ attempts: rows.map((r) => attemptToApi(r, attachment.max_points)) });
});
