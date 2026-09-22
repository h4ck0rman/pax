import type { Question } from '../questions/types';

/** What the candidate asked for before sitting the test. */
export type TestConfig = {
  questionCount: number;
  minutes: number;
  /** Draw only from papers this year or later. 0 draws from every year. */
  minYear: number;
};

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

/** How far back a sitting may draw from.
 *
 *  The years are named rather than counted back from today, because "the last
 *  three years" would quietly change meaning as the bank ages while the papers
 *  in it do not. `available` is how many servable questions carry that year or
 *  later, from the extraction report, and is shown so nobody asks for fifty
 *  questions out of a pool of twelve.
 *
 *  Roughly one candidate in six comes from study material whose filename names
 *  no year. Those are left out as soon as any year is chosen, because their year
 *  is unknown rather than old. */
export const YEAR_FILTERS = [
  { minYear: 0, label: 'Any year', available: 5374 },
  { minYear: 2016, label: '2016 onwards', available: 3905 },
  { minYear: 2019, label: '2019 onwards', available: 2776 },
  { minYear: 2022, label: '2022 onwards', available: 755 },
  { minYear: 2024, label: '2024 onwards', available: 232 },
] as const;
