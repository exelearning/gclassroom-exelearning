import type { CompletionStatus, LessonStatus, NormalizedScore, ScormVersion, SuccessStatus } from './types';
import { findScorm12Score } from './scorm12';
import { findScorm2004Score } from './scorm2004';

export interface NormalizeInput {
  version: ScormVersion;
  data: Record<string, string>;
  maxPoints: number;
}

/**
 * Convert raw SCORM CMI data into a normalized score that maps to Classroom's
 * `pointsEarned`. Rules (in order):
 *   1. Prefer SCORM 2004 `cmi.score.scaled` (in [-1, 1] or [0, 1] depending on
 *      content; we clamp to [0, 1]).
 *   2. Else SCORM 2004/1.2 raw with declared min/max.
 *   3. Else raw assuming a 0..100 scale.
 *   4. Else fall back to lesson_status / completion_status to score 0/full.
 *
 * The returned `pointsEarned` is always clamped to [0, maxPoints]. Callers
 * MUST treat client-side normalization as advisory; the backend recomputes.
 */
export function normalizeScormScore(input: NormalizeInput): NormalizedScore {
  const { data, maxPoints } = input;
  const safeMax = Math.max(0, Number.isFinite(maxPoints) ? maxPoints : 0);

  const score2004 = findScorm2004Score(data);
  const score12 = findScorm12Score(data);

  const completionStatus = readCompletionStatus(data);
  const successStatus = readSuccessStatus(data);
  const lessonStatus = readLessonStatus(data);

  const isComplete = completionStatus === 'completed' || lessonStatus === 'completed' || lessonStatus === 'passed' || lessonStatus === 'failed';
  const isPassed = successStatus === 'passed' || lessonStatus === 'passed' ? true : successStatus === 'failed' || lessonStatus === 'failed' ? false : undefined;

  const result: NormalizedScore = {
    pointsEarned: 0,
    maxPoints: safeMax,
    rawScore: score2004.raw ?? score12.raw,
    minScore: score2004.min ?? score12.min,
    maxScore: score2004.max ?? score12.max,
    scaledScore: score2004.scaled,
    completionStatus,
    successStatus,
    lessonStatus,
    isComplete,
    isPassed,
  };

  // Rule 1: scaled score (most reliable in 2004)
  if (typeof score2004.scaled === 'number') {
    const scaled = clamp(score2004.scaled, 0, 1);
    result.pointsEarned = round2(scaled * safeMax);
    return result;
  }

  // Rule 2: raw with min/max
  const raw = score2004.raw ?? score12.raw;
  const min = score2004.min ?? score12.min;
  const max = score2004.max ?? score12.max;

  if (typeof raw === 'number' && typeof max === 'number' && max > (min ?? 0)) {
    const lo = min ?? 0;
    const fraction = clamp((raw - lo) / (max - lo), 0, 1);
    result.pointsEarned = round2(fraction * safeMax);
    return result;
  }

  // Rule 3: raw assumed to be 0..100
  if (typeof raw === 'number') {
    const fraction = clamp(raw / 100, 0, 1);
    result.pointsEarned = round2(fraction * safeMax);
    return result;
  }

  // Rule 4: completion-only fallback
  if (isPassed === true) {
    result.pointsEarned = safeMax;
  } else if (isPassed === false) {
    result.pointsEarned = 0;
  } else if (isComplete) {
    // Pure completion without pass/fail: do not assign a grade automatically.
    // We expose isComplete=true but leave pointsEarned at 0; caller decides.
    result.pointsEarned = 0;
  }

  return result;
}

function readCompletionStatus(data: Record<string, string>): CompletionStatus {
  const v = data['cmi.completion_status'];
  if (v === 'completed') return 'completed';
  if (v === 'incomplete') return 'incomplete';
  if (v === 'not attempted' || v === 'notattempted' || v === 'not_attempted') return 'not_attempted';

  // SCORM 1.2 lesson_status overlap
  const ls = data['cmi.core.lesson_status'];
  if (ls === 'completed' || ls === 'passed' || ls === 'failed') return 'completed';
  if (ls === 'incomplete' || ls === 'browsed') return 'incomplete';
  if (ls === 'not attempted') return 'not_attempted';
  return 'unknown';
}

function readSuccessStatus(data: Record<string, string>): SuccessStatus {
  const v = data['cmi.success_status'];
  if (v === 'passed') return 'passed';
  if (v === 'failed') return 'failed';
  const ls = data['cmi.core.lesson_status'];
  if (ls === 'passed') return 'passed';
  if (ls === 'failed') return 'failed';
  return 'unknown';
}

function readLessonStatus(data: Record<string, string>): LessonStatus | undefined {
  const ls = data['cmi.core.lesson_status'];
  if (!ls) return undefined;
  const KNOWN: LessonStatus[] = ['passed', 'failed', 'completed', 'incomplete', 'browsed', 'not attempted'];
  return (KNOWN as string[]).includes(ls) ? (ls as LessonStatus) : undefined;
}

function clamp(value: number, lo: number, hi: number): number {
  if (Number.isNaN(value)) return lo;
  return Math.min(hi, Math.max(lo, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
