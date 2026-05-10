import { describe, it, expect } from 'vitest';
import { parseClassroomContext, validateContext, ClassroomContextError } from './context';

describe('parseClassroomContext', () => {
  it('parses a teacher view URL', () => {
    const ctx = parseClassroomContext('https://example/addon/teacher?courseId=C1&itemId=I1&itemType=COURSE_WORK&attachmentId=A1&login_hint=teacher@example.com');
    expect(ctx.courseId).toBe('C1');
    expect(ctx.itemId).toBe('I1');
    expect(ctx.itemType).toBe('COURSE_WORK');
    expect(ctx.attachmentId).toBe('A1');
    expect(ctx.submissionId).toBeNull();
    expect(ctx.loginHint).toBe('teacher@example.com');
    expect(ctx.roleHint).toBe('teacher');
  });

  it('parses a student view URL with submissionId', () => {
    const ctx = parseClassroomContext('https://example/addon/student?courseId=C1&itemId=I1&itemType=COURSE_WORK&attachmentId=A1&submissionId=S1');
    expect(ctx.submissionId).toBe('S1');
    expect(ctx.roleHint).toBe('student');
  });

  it('reads attachmentRef from query', () => {
    const ctx = parseClassroomContext('https://example/addon/teacher?attachmentRef=abc-123');
    expect(ctx.attachmentRef).toBe('abc-123');
  });

  it('marks unknown itemType as UNKNOWN', () => {
    const ctx = parseClassroomContext('https://example/addon/teacher?itemType=BOGUS');
    expect(ctx.itemType).toBe('UNKNOWN');
  });

  it('treats absent params as null, not empty string', () => {
    const ctx = parseClassroomContext('https://example/addon/discovery');
    expect(ctx.courseId).toBeNull();
    expect(ctx.attachmentId).toBeNull();
    expect(ctx.itemType).toBe('UNKNOWN');
  });

  it('roleHint is unknown for non-addon paths', () => {
    const ctx = parseClassroomContext('https://example/view?courseId=X');
    expect(ctx.roleHint).toBe('unknown');
  });
});

describe('validateContext', () => {
  it('throws ClassroomContextError listing missing keys', () => {
    const ctx = parseClassroomContext('https://example/addon/student?courseId=C');
    expect(() => validateContext(ctx, { required: ['courseId', 'itemId', 'submissionId'] }))
      .toThrowError(ClassroomContextError);

    try {
      validateContext(ctx, { required: ['courseId', 'itemId', 'submissionId'] });
    } catch (error) {
      const e = error as ClassroomContextError;
      expect(e.missing).toEqual(['itemId', 'submissionId']);
    }
  });

  it('passes when all required fields are present', () => {
    const ctx = parseClassroomContext('https://example/addon/teacher?courseId=C&itemId=I&attachmentId=A&itemType=COURSE_WORK');
    expect(() => validateContext(ctx, { required: ['courseId', 'itemId', 'attachmentId', 'itemType'] }))
      .not.toThrow();
  });

  it('treats UNKNOWN itemType as missing', () => {
    const ctx = parseClassroomContext('https://example/addon/teacher?courseId=C');
    expect(() => validateContext(ctx, { required: ['itemType'] })).toThrowError(ClassroomContextError);
  });
});
