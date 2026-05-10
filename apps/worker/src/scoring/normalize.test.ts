import { describe, it, expect } from 'vitest';
import { normalizeScormScore } from './normalize';

describe('normalizeScormScore (worker)', () => {
  it('uses scaled score when present', () => {
    const r = normalizeScormScore({ maxPoints: 10, data: { 'cmi.score.scaled': '0.5' } });
    expect(r.pointsEarned).toBe(5);
    expect(r.scaledScore).toBe(0.5);
  });

  it('uses raw with min/max', () => {
    const r = normalizeScormScore({
      maxPoints: 100,
      data: { 'cmi.core.score.raw': '6', 'cmi.core.score.min': '4', 'cmi.core.score.max': '8' },
    });
    expect(r.pointsEarned).toBe(50);
  });

  it('falls back to passed = full points', () => {
    const r = normalizeScormScore({ maxPoints: 10, data: { 'cmi.core.lesson_status': 'passed' } });
    expect(r.pointsEarned).toBe(10);
    expect(r.isPassed).toBe(true);
  });

  it('returns 0 for failed status', () => {
    const r = normalizeScormScore({ maxPoints: 10, data: { 'cmi.core.lesson_status': 'failed' } });
    expect(r.pointsEarned).toBe(0);
    expect(r.isPassed).toBe(false);
  });

  it('clamps over-max raw', () => {
    const r = normalizeScormScore({
      maxPoints: 10,
      data: { 'cmi.core.score.raw': '120', 'cmi.core.score.min': '0', 'cmi.core.score.max': '100' },
    });
    expect(r.pointsEarned).toBeLessThanOrEqual(10);
  });
});
