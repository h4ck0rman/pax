/** A sitting the reader finished, kept so it can be reviewed and exported later.
 *
 *  The questions are stored with the sitting rather than referenced, because a
 *  record of what someone was asked must not change when the bank is rebuilt.
 *
 *  Note for anyone searching the tree: this is the "past tests" feature, not the
 *  automated test suite, which lives in `tests/`.
 */
export type StoredOption = { label: string; text: string };

export type StoredSource = {
  source: string;
  original_number: string;
  start: string;
} | null;

/** An unverified AI suggestion for a question, joined in from the bank when a
 *  sitting is read. Never stored on the sitting itself, so it stays current. */
export type StoredAiEstimate = {
  model?: string;
  choice_label: string | null;
  choice_text?: string;
  matched?: boolean;
  confidence: number | null;
  probabilities?: Record<string, number> | null;
  evaluated_at?: string | null;
};

export type StoredAnswer = {
  questionId: string;
  stem: string;
  options: StoredOption[];
  source: StoredSource;
  /** The option label the reader chose, or null if they left it. */
  selected: string | null;
  /** Filled in at read time from the live bank, not persisted with the sitting. */
  ai_estimate?: StoredAiEstimate | null;
};

export type TestRecord = {
  /** Chosen by the browser, so a retried save replaces rather than duplicates. */
  _id: string;
  userId: string;
  minutes: number;
  usedSeconds: number;
  expired: boolean;
  questionCount: number;
  answeredCount: number;
  /** The exact paper years the sitting drew from. Empty means every year. */
  years: number[];
  /** Legacy single-cutoff year on sittings saved before the multi-year filter.
   *  Kept only so old records still read. */
  minYear?: number;
  finishedAt: Date;
  answers: StoredAnswer[];
};

/** One row of the past tests table. */
export type TestSummary = {
  id: string;
  minutes: number;
  usedSeconds: number;
  expired: boolean;
  questionCount: number;
  answeredCount: number;
  years: number[];
  finishedAt: string;
};

/** A whole sitting, for the review screen. */
export type TestDetail = TestSummary & { answers: StoredAnswer[] };

/** Aggregate numbers for the dashboard above the setup form. */
export type TestStats = {
  testsTaken: number;
  questionsAnswered: number;
  /** Percent of answered questions whose option matched the AI answer, over all
   *  sittings. Null when nothing answered yet. */
  scorePercent: number | null;
  /** Mean sitting length in seconds. Null when no sittings yet. */
  avgSeconds: number | null;
};

export const MAX_QUESTIONS = 100;
export const PAGE_SIZE = 10;
