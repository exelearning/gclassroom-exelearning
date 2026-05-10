import { describe, it, expect, vi } from 'vitest';
import { patchGradePassback, GradePassbackError, buildUrl } from './grade-passback';

describe('buildUrl', () => {
  it('builds the canonical addOnAttachments URL with updateMask', () => {
    const url = buildUrl('https://classroom.googleapis.com', 'C1', 'COURSE_WORK', 'I1', 'A1', 'S1');
    expect(url).toBe(
      'https://classroom.googleapis.com/v1/courses/C1/courseWork/I1/addOnAttachments/A1/studentSubmissions/S1?updateMask=pointsEarned',
    );
  });

  it('switches segment for COURSE_WORK_MATERIAL', () => {
    expect(buildUrl('https://x', 'C', 'COURSE_WORK_MATERIAL', 'I', 'A', 'S')).toContain('/courseWorkMaterials/');
  });

  it('switches segment for ANNOUNCEMENT', () => {
    expect(buildUrl('https://x', 'C', 'ANNOUNCEMENT', 'I', 'A', 'S')).toContain('/announcements/');
  });

  it('percent-encodes path segments', () => {
    const url = buildUrl('https://x', 'a/b', 'COURSE_WORK', 'i d', 'A', 'S');
    expect(url).toContain('/courses/a%2Fb/');
    expect(url).toContain('/courseWork/i%20d/');
  });
});

describe('patchGradePassback', () => {
  it('sends PATCH with bearer token and pointsEarned body', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(init.body as string)).toEqual({ pointsEarned: 7.5 });
      const headers = new Headers(init.headers);
      expect(headers.get('Authorization')).toBe('Bearer abc');
      return new Response(JSON.stringify({ pointsEarned: 7.5 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const result = await patchGradePassback(
      { courseId: 'C', itemId: 'I', attachmentId: 'A', submissionId: 'S', pointsEarned: 7.5 },
      { accessToken: 'abc', fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.pointsEarned).toBe(7.5);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const calledUrl = fetchImpl.mock.calls[0]![0] as string;
    expect(calledUrl).toContain('updateMask=pointsEarned');
  });

  it('throws GradePassbackError with 4xx status and parsed message', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'permission denied' } }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    }));
    await expect(patchGradePassback(
      { courseId: 'C', itemId: 'I', attachmentId: 'A', submissionId: 'S', pointsEarned: 1 },
      { accessToken: 'abc', fetchImpl: fetchImpl as unknown as typeof fetch },
    )).rejects.toMatchObject({ status: 403, message: /permission denied/ });
  });

  it('rejects negative pointsEarned without making a request', async () => {
    const fetchImpl = vi.fn();
    await expect(patchGradePassback(
      { courseId: 'C', itemId: 'I', attachmentId: 'A', submissionId: 'S', pointsEarned: -1 },
      { accessToken: 'abc', fetchImpl: fetchImpl as unknown as typeof fetch },
    )).rejects.toBeInstanceOf(GradePassbackError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects missing required fields without making a request', async () => {
    const fetchImpl = vi.fn();
    await expect(patchGradePassback(
      { courseId: '', itemId: 'I', attachmentId: 'A', submissionId: 'S', pointsEarned: 1 },
      { accessToken: 'abc', fetchImpl: fetchImpl as unknown as typeof fetch },
    )).rejects.toThrowError(/courseId/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
