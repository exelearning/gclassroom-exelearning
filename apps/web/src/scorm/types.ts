export type ScormVersion = '1.2' | '2004' | 'unknown';

export type CompletionStatus =
  | 'completed'
  | 'incomplete'
  | 'not_attempted'
  | 'unknown';

export type SuccessStatus = 'passed' | 'failed' | 'unknown';

export type LessonStatus =
  | 'passed'
  | 'failed'
  | 'completed'
  | 'incomplete'
  | 'browsed'
  | 'not attempted';

export interface NormalizedScore {
  pointsEarned: number;
  maxPoints: number;
  rawScore?: number;
  minScore?: number;
  maxScore?: number;
  scaledScore?: number;
  completionStatus?: CompletionStatus;
  successStatus?: SuccessStatus;
  lessonStatus?: LessonStatus;
  isComplete: boolean;
  isPassed?: boolean;
}

export interface ScormEvent {
  ts: string;
  type: 'set' | 'get' | 'commit' | 'init' | 'finish' | 'error';
  key?: string;
  value?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface ScormRuntimeState {
  version: ScormVersion;
  data: Record<string, string>;
  initialized: boolean;
  finished: boolean;
  lastError: string;
  lastErrorMessage: string;
}

export interface ScormApiAdapter {
  /** Bag of CMI keys/values captured by the adapter. */
  readonly state: ScormRuntimeState;
  /** Append-only event log (init/set/commit/finish/error). */
  readonly events: ScormEvent[];
  /** Subscribe to mutation events (debounced caller responsibility). */
  onChange(listener: (state: ScormRuntimeState) => void): () => void;
}
