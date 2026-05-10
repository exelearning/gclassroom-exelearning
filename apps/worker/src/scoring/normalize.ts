/**
 * Server-side mirror of the frontend SCORM score normalization. Lives in the
 * worker so we never trust client-submitted `pointsEarned` — we always
 * recompute from raw CMI data before writing to Classroom.
 *
 * Kept identical to apps/web/src/scorm/normalize.ts. If you change one, change
 * the other AND update the regression tests in both locations.
 */

export interface NormalizeInput {
  data: Record<string, string>;
  maxPoints: number;
}

export interface NormalizedScore {
  pointsEarned: number;
  maxPoints: number;
  rawScore?: number;
  minScore?: number;
  maxScore?: number;
  scaledScore?: number;
  completionStatus?: 'completed' | 'incomplete' | 'not_attempted' | 'unknown';
  successStatus?: 'passed' | 'failed' | 'unknown';
  isComplete: boolean;
  isPassed?: boolean;
}

export function normalizeScormScore({ data, maxPoints }: NormalizeInput): NormalizedScore {
  const safeMax = Math.max(0, Number.isFinite(maxPoints) ? maxPoints : 0);
  const scaled = num(data['cmi.score.scaled']);
  const raw = num(data['cmi.score.raw']) ?? num(data['cmi.core.score.raw']);
  const min = num(data['cmi.score.min']) ?? num(data['cmi.core.score.min']);
  const max = num(data['cmi.score.max']) ?? num(data['cmi.core.score.max']);

  const completionStatus = readCompletion(data);
  const successStatus = readSuccess(data);
  const lessonStatus = data['cmi.core.lesson_status'];
  const isComplete = completionStatus === 'completed' || lessonStatus === 'completed' || lessonStatus === 'passed' || lessonStatus === 'failed';
  const isPassed = successStatus === 'passed' || lessonStatus === 'passed' ? true : successStatus === 'failed' || lessonStatus === 'failed' ? false : undefined;

  const out: NormalizedScore = {
    pointsEarned: 0,
    maxPoints: safeMax,
    rawScore: raw,
    minScore: min,
    maxScore: max,
    scaledScore: scaled,
    completionStatus,
    successStatus,
    isComplete,
    isPassed,
  };

  if (typeof scaled === 'number') {
    out.pointsEarned = round2(clamp(scaled, 0, 1) * safeMax);
    return out;
  }
  if (typeof raw === 'number' && typeof max === 'number' && max > (min ?? 0)) {
    const lo = min ?? 0;
    out.pointsEarned = round2(clamp((raw - lo) / (max - lo), 0, 1) * safeMax);
    return out;
  }
  if (typeof raw === 'number') {
    out.pointsEarned = round2(clamp(raw / 100, 0, 1) * safeMax);
    return out;
  }
  if (isPassed === true) out.pointsEarned = safeMax;
  else if (isPassed === false) out.pointsEarned = 0;
  return out;
}

function readCompletion(data: Record<string, string>): NormalizedScore['completionStatus'] {
  const v = data['cmi.completion_status'];
  if (v === 'completed') return 'completed';
  if (v === 'incomplete') return 'incomplete';
  if (v === 'not attempted' || v === 'notattempted' || v === 'not_attempted') return 'not_attempted';
  const ls = data['cmi.core.lesson_status'];
  if (ls === 'completed' || ls === 'passed' || ls === 'failed') return 'completed';
  if (ls === 'incomplete' || ls === 'browsed') return 'incomplete';
  if (ls === 'not attempted') return 'not_attempted';
  return 'unknown';
}

function readSuccess(data: Record<string, string>): NormalizedScore['successStatus'] {
  const v = data['cmi.success_status'];
  if (v === 'passed') return 'passed';
  if (v === 'failed') return 'failed';
  const ls = data['cmi.core.lesson_status'];
  if (ls === 'passed') return 'passed';
  if (ls === 'failed') return 'failed';
  return 'unknown';
}

function num(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Number.isNaN(v) ? lo : v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
