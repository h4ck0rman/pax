import type { Question } from '../questions/types';

/** What the candidate asked for before sitting the test. */
export type TestConfig = {
  questionCount: number;
  minutes: number;
  /** Draw only from these exact paper years. Empty draws from every year,
   *  including undated study material. */
  years: number[];
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
/** The number of servable questions in total, and the share that carries no
 *  year, so the setup copy can say what "any year" draws from. */
export const SERVABLE_TOTAL = 5374;
export const SERVABLE_UNDATED = 894;

/** Every paper year that has servable questions, newest first, with how many
 *  each has. Shown as toggle bubbles under the Papers control; ticking some
 *  draws only from those years. Counts come from the extraction in Atlas; rerun
 *  the per-year count if the bank is rebuilt. A ticked year never includes the
 *  undated material, whose year is unknown rather than old. */
export const YEAR_OPTIONS: ReadonlyArray<{ year: number; available: number }> = [
  { year: 2026, available: 78 },
  { year: 2024, available: 154 },
  { year: 2023, available: 42 },
  { year: 2022, available: 481 },
  { year: 2021, available: 1024 },
  { year: 2020, available: 391 },
  { year: 2019, available: 606 },
  { year: 2018, available: 445 },
  { year: 2017, available: 378 },
  { year: 2016, available: 306 },
  { year: 2015, available: 74 },
  { year: 2014, available: 175 },
  { year: 2013, available: 45 },
  { year: 2012, available: 89 },
  { year: 2011, available: 24 },
  { year: 2010, available: 33 },
  { year: 2009, available: 99 },
  { year: 2008, available: 32 },
  { year: 2007, available: 1 },
  { year: 2006, available: 3 },
] as const;
