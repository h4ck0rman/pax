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

export type StoredAnswer = {
  questionId: string;
  stem: string;
  options: StoredOption[];
  source: StoredSource;
  /** The option label the reader chose, or null if they left it. */
  selected: string | null;
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
  finishedAt: string;
};

/** A whole sitting, for the review screen. */
export type TestDetail = TestSummary & { answers: StoredAnswer[] };

export const MAX_QUESTIONS = 100;
export const PAGE_SIZE = 10;
