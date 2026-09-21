import type { Question } from '../questions/types';

/** What the candidate asked for before sitting the test. */
export type TestConfig = { questionCount: number; minutes: number };

/** One question as the candidate left it. Null means they did not answer. */
export type TestAnswer = { question: Question; selected: string | null };

/** A finished sitting, ready to review or export. */
export type CompletedTest = {
  config: TestConfig;
  answers: TestAnswer[];
  finishedAt: number;
  /** Clock time actually spent, so paused time is not counted. */
  usedSeconds: number;
  /** True when the countdown ran out rather than the candidate finishing. */
  expired: boolean;
};

export const QUESTION_COUNTS = [5, 10, 20, 50] as const;
export const DURATIONS = [5, 15, 30, 60] as const;
