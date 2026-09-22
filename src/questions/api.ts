import type { QuestionPage } from './types';

/** Mirrors the GET /api/questions contract. That contract is implemented
 *  separately in vite.config.ts, server/production.ts, api/questions.ts and
 *  scripts/query_questions.py, so keep all of them in step. */
export type QuestionQuery = {
  search?: string;
  offset?: number;
  limit?: number;
  random?: boolean;
  /** Serve only papers from this year onwards. Omitted or 0 means every year. */
  minYear?: number;
};

const UNAVAILABLE = 'The question database is unavailable.';

export async function fetchQuestions(
  query: QuestionQuery = {},
  signal?: AbortSignal,
): Promise<QuestionPage> {
  const params = new URLSearchParams();
  params.set('offset', String(query.offset ?? 0));
  params.set('limit', String(query.limit ?? 1));
  if (query.search) params.set('search', query.search);
  if (query.random) params.set('random', 'true');
  if (query.minYear) params.set('minYear', String(query.minYear));

  const response = await fetch(`/api/questions?${params}`, { signal });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : null;
    throw new Error(typeof error === 'string' && error ? error : UNAVAILABLE);
  }
  if (!isQuestionPage(body)) throw new Error(UNAVAILABLE);
  return body;
}

function isQuestionPage(value: unknown): value is QuestionPage {
  if (typeof value !== 'object' || value === null) return false;
  const page = value as { total?: unknown; questions?: unknown };
  if (typeof page.total !== 'number' || !Array.isArray(page.questions)) return false;
  return page.questions.every(question => {
    if (typeof question !== 'object' || question === null) return false;
    const record = question as { id?: unknown; stem?: unknown; options?: unknown };
    return (
      typeof record.id === 'string' &&
      typeof record.stem === 'string' &&
      Array.isArray(record.options) &&
      record.options.every(
        option =>
          typeof option === 'object' &&
          option !== null &&
          typeof (option as { label?: unknown }).label === 'string' &&
          typeof (option as { text?: unknown }).text === 'string',
      )
    );
  });
}
