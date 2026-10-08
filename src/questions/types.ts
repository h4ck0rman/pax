export type QuestionOption = { label: string; text: string };

/** An UNVERIFIED answer guess from the Jev model, stored out of band in Atlas.
 *  It is not a verified answer key: the bank has none. `choice_label` names the
 *  option Jev picked, `confidence` is the model's own certainty (0 to 1), which
 *  is not the same as being right. Absent on questions the model never ran
 *  against. The review screen highlights it only as a labelled estimate. */
export type AiEstimate = {
  model: string;
  choice_label: string | null;
  choice_text?: string;
  matched?: boolean;
  confidence: number | null;
  probabilities?: Record<string, number> | null;
  evaluated_at?: string | null;
};

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
  /** Jev's unverified pick for this question, if the model was run against it. */
  ai_estimate?: AiEstimate | null;
};

export type QuestionPage = { total: number; questions: Question[] };
