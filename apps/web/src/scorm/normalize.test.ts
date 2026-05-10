import { describe, it, expect } from 'vitest';
import { normalizeScormScore } from './normalize';

describe('normalizeScormScore', () => {
  it('uses scaled score when present (rule 1)', () => {
    const result = normalizeScormScore({
      version: '2004',
      maxPoints: 10,
      data: {
        'cmi.score.scaled': '0.8',
        'cmi.completion_status': 'completed',
        'cmi.success_status': 'passed',
      },
    });
    expect(result.pointsEarned).toBe(8);
    expect(result.scaledScore).toBe(0.8);
    expect(result.isComplete).toBe(true);
    expect(result.isPassed).toBe(true);
  });

  it('clamps scaled score to [0, 1]', () => {
    expect(normalizeScormScore({
      version: '2004', maxPoints: 10, data: { 'cmi.score.scaled': '1.5' },
    }).pointsEarned).toBe(10);

    expect(normalizeScormScore({
      version: '2004', maxPoints: 10, data: { 'cmi.score.scaled': '-0.4' },
    }).pointsEarned).toBe(0);
  });

  it('uses raw with min/max when scaled missing (rule 2)', () => {
    const result = normalizeScormScore({
      version: '1.2',
      maxPoints: 20,
      data: {
        'cmi.core.score.raw': '7',
        'cmi.core.score.min': '0',
        'cmi.core.score.max': '10',
      },
    });
    expect(result.pointsEarned).toBe(14);
    expect(result.rawScore).toBe(7);
    expect(result.maxScore).toBe(10);
  });

  it('handles non-zero min in raw scaling', () => {
    const result = normalizeScormScore({
      version: '1.2',
      maxPoints: 100,
      data: {
        'cmi.core.score.raw': '6',
        'cmi.core.score.min': '4',
        'cmi.core.score.max': '8',
      },
    });
    // (6 - 4) / (8 - 4) = 0.5 -> 50 / 100
    expect(result.pointsEarned).toBe(50);
  });

  it('falls back to 0..100 raw when min/max absent (rule 3)', () => {
    const result = normalizeScormScore({
      version: '1.2',
      maxPoints: 10,
      data: { 'cmi.core.score.raw': '85' },
    });
    expect(result.pointsEarned).toBe(8.5);
  });

  it('falls back to lesson_status pass = full points (rule 4)', () => {
    const result = normalizeScormScore({
      version: '1.2',
      maxPoints: 10,
      data: { 'cmi.core.lesson_status': 'passed' },
    });
    expect(result.pointsEarned).toBe(10);
    expect(result.isPassed).toBe(true);
  });

  it('failed status maps to 0 points but still counts as complete', () => {
    const result = normalizeScormScore({
      version: '1.2',
      maxPoints: 10,
      data: { 'cmi.core.lesson_status': 'failed' },
    });
    expect(result.pointsEarned).toBe(0);
    expect(result.isComplete).toBe(true);
    expect(result.isPassed).toBe(false);
  });

  it('completion-only without pass/fail leaves grade at 0', () => {
    const result = normalizeScormScore({
      version: '2004',
      maxPoints: 10,
      data: { 'cmi.completion_status': 'completed' },
    });
    expect(result.pointsEarned).toBe(0);
    expect(result.isComplete).toBe(true);
    expect(result.isPassed).toBeUndefined();
  });

  it('ignores NaN raw scores', () => {
    const result = normalizeScormScore({
      version: '1.2',
      maxPoints: 10,
      data: { 'cmi.core.score.raw': 'not-a-number' },
    });
    expect(result.pointsEarned).toBe(0);
  });

  it('clamps results above maxPoints (defensive)', () => {
    // Rule 2 with max < raw (broken content) — fraction can exceed 1; clamp.
    const result = normalizeScormScore({
      version: '1.2',
      maxPoints: 10,
      data: {
        'cmi.core.score.raw': '15',
        'cmi.core.score.min': '0',
        'cmi.core.score.max': '10',
      },
    });
    expect(result.pointsEarned).toBe(10);
  });

  it('treats not_attempted explicitly', () => {
    const result = normalizeScormScore({
      version: '2004',
      maxPoints: 10,
      data: { 'cmi.completion_status': 'not attempted' },
    });
    expect(result.completionStatus).toBe('not_attempted');
    expect(result.isComplete).toBe(false);
    expect(result.pointsEarned).toBe(0);
  });
});
