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
  /** The year of the paper this came from, derived from the source path.
   *  Null when the source names no year, which is a real answer: roughly one in
   *  six candidates sit in undated study material. */
  paper_year?: number | null;
};

export type QuestionPage = { total: number; questions: Question[] };
