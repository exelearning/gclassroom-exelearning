import { describe, it, expect } from 'vitest';
import { initAttempt, applyScormUpdate, markSubmitted, isDirty } from './attempt-state';

const baseInput = {
  attachmentId: 'a1',
  submissionId: 's1',
  courseId: 'c1',
  itemId: 'i1',
  userId: 'u1',
  fileId: 'f1',
  now: () => new Date('2026-05-10T12:00:00Z'),
};

describe('initAttempt', () => {
  it('mints an attemptId when none given', () => {
    const a = initAttempt(baseInput);
    expect(a.attemptId).toMatch(/^[\w-]+$/);
    expect(a.startedAt).toBe('2026-05-10T12:00:00.000Z');
    expect(a.scormData).toEqual({});
  });

  it('respects a caller-supplied attemptId', () => {
    const a = initAttempt({ ...baseInput, attemptId: 'fixed' });
    expect(a.attemptId).toBe('fixed');
  });
});

describe('applyScormUpdate', () => {
  it('merges new keys with existing scormData', () => {
    const a = initAttempt(baseInput);
    const next = applyScormUpdate(a, {
      version: '1.2',
      data: { 'cmi.core.score.raw': '5' },
      events: [],
    }, () => new Date('2026-05-10T12:01:00Z'));
    expect(next.scormVersion).toBe('1.2');
    expect(next.scormData).toEqual({ 'cmi.core.score.raw': '5' });
    expect(next.updatedAt).toBe('2026-05-10T12:01:00.000Z');
  });

  it('preserves prior keys when updating', () => {
    const a = initAttempt(baseInput);
    const next = applyScormUpdate(a, { version: '1.2', data: { x: '1' }, events: [] });
    const after = applyScormUpdate(next, { version: '1.2', data: { y: '2' }, events: [] });
    expect(after.scormData).toEqual({ x: '1', y: '2' });
  });
});

describe('markSubmitted', () => {
  it('stamps submittedAt', () => {
    const a = initAttempt(baseInput);
    const next = markSubmitted(a, () => new Date('2026-05-10T12:30:00Z'));
    expect(next.submittedAt).toBe('2026-05-10T12:30:00.000Z');
  });
});

describe('isDirty', () => {
  it('flags first-write as dirty', () => {
    const a = initAttempt(baseInput);
    expect(isDirty(null, a)).toBe(true);
  });

  it('flags scormData changes', () => {
    const a = initAttempt(baseInput);
    const b = applyScormUpdate(a, { version: '1.2', data: { x: '1' }, events: [] });
    expect(isDirty(a, b)).toBe(true);
  });

  it('treats identical state as clean', () => {
    const a = initAttempt(baseInput);
    expect(isDirty(a, a)).toBe(false);
  });
});
