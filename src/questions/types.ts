export type QuestionOption = { label: string; text: string };

/** Where a candidate was extracted from. Null when no occurrence was recorded. */
export type QuestionSource = {
  source: string;
  original_number: string;
  start: string;
} | null;

export type Question = {
  id: string;
  stem: string;
  options: QuestionOption[];
  source: QuestionSource;
};

export type QuestionPage = { total: number; questions: Question[] };
