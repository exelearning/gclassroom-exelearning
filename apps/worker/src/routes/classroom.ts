import { Hono } from 'hono';
import type { Env } from '../types';
import { type AuthVariables, requireGoogleAuth } from '../middleware/auth';
import { getAttachment } from '../db/queries';
import { patchGradePassback } from '../classroom/grade-passback';

export const classroomRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

classroomRoutes.use('/api/classroom/*', requireGoogleAuth);

interface GradePassbackBody {
  courseId: string;
  itemId: string;
  attachmentId: string;
  submissionId: string;
  pointsEarned: number;
}

/**
 * Teacher-initiated grade sync (Mode B). Uses the calling teacher's live
 * access token; the teacher MUST be the one viewing studentWorkReviewUri.
 */
classroomRoutes.post('/api/classroom/grade-passback', async (c) => {
  let body: GradePassbackBody;
  try { body = (await c.req.json()) as GradePassbackBody; }
  catch { return c.json({ error: 'Body must be JSON.' }, 400); }

  for (const key of ['courseId', 'itemId', 'attachmentId', 'submissionId'] as const) {
    if (!body[key]) return c.json({ error: `Missing field: ${key}` }, 400);
  }
  if (!Number.isFinite(body.pointsEarned) || body.pointsEarned < 0) {
    return c.json({ error: 'pointsEarned must be a non-negative number.' }, 400);
  }

  const attachment = await getAttachment(c.env, body.attachmentId);
  if (!attachment) return c.json({ error: 'Attachment not found.' }, 404);

  const user = c.get('user');
  if (user.sub !== attachment.teacher_user_id) {
    // Future: extend to co-teachers via Classroom courses.teachers list.
    return c.json({ error: 'Only the attachment owner may push grades.' }, 403);
  }

  const accessToken = c.get('accessToken');
  try {
    const result = await patchGradePassback(
      {
        courseId: body.courseId,
        itemId: body.itemId,
        itemType: attachment.item_type as 'COURSE_WORK' | 'COURSE_WORK_MATERIAL' | 'ANNOUNCEMENT',
        attachmentId: body.attachmentId,
        submissionId: body.submissionId,
        pointsEarned: body.pointsEarned,
      },
      { accessToken, apiBase: c.env.CLASSROOM_API_BASE },
    );
    return c.json(result);
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return c.json({ error: error instanceof Error ? error.message : String(error) }, status as 500);
  }
});
