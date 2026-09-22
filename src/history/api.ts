import type { CompletedTest } from '../practice/types';

export type TestSummary = {
  id: string;
  minutes: number;
  usedSeconds: number;
  expired: boolean;
  questionCount: number;
  answeredCount: number;
  /** The earliest paper year the sitting drew from. 0 means every year. */
  minYear: number;
  finishedAt: string;
};

export type StoredAnswer = {
  questionId: string;
  stem: string;
  options: { label: string; text: string }[];
  source: { source: string; original_number: string; start: string } | null;
  selected: string | null;
};

export type TestDetail = TestSummary & { answers: StoredAnswer[] };

export const PAGE_SIZE = 10;

const UNAVAILABLE = 'Your past tests are unavailable.';

async function readError(response: Response): Promise<never> {
  const body: unknown = await response.json().catch(() => null);
  const error = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : null;
  throw new Error(typeof error === 'string' && error ? error : UNAVAILABLE);
}

/** Saves a finished sitting. The id comes from the browser, so a retry replaces
 *  the same record instead of adding another row. */
export async function saveTest(test: CompletedTest, id: string): Promise<void> {
  const response = await fetch('/api/tests', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      minutes: test.config.minutes,
      minYear: test.config.minYear,
      usedSeconds: test.usedSeconds,
      expired: test.expired,
      answers: test.answers.map(answer => ({
        questionId: answer.question.id,
        stem: answer.question.stem,
        options: answer.question.options,
        source: answer.question.source,
        selected: answer.selected,
      })),
    }),
  });
  if (!response.ok) await readError(response);
}

export async function fetchTests(
  offset: number,
  signal?: AbortSignal,
): Promise<{ total: number; tests: TestSummary[] }> {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
  const response = await fetch(`/api/tests?${params}`, { signal, credentials: 'same-origin' });
  if (!response.ok) await readError(response);

  const body: unknown = await response.json();
  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as { total?: unknown }).total !== 'number' ||
    !Array.isArray((body as { tests?: unknown }).tests)
  ) {
    throw new Error(UNAVAILABLE);
  }
  return body as { total: number; tests: TestSummary[] };
}

export async function fetchTest(id: string, signal?: AbortSignal): Promise<TestDetail> {
  const response = await fetch(`/api/tests?id=${encodeURIComponent(id)}`, {
    signal,
    credentials: 'same-origin',
  });
  if (!response.ok) await readError(response);

  const body: unknown = await response.json();
  const test = typeof body === 'object' && body !== null ? (body as { test?: unknown }).test : null;
  if (typeof test !== 'object' || test === null || !Array.isArray((test as TestDetail).answers)) {
    throw new Error(UNAVAILABLE);
  }
  return test as TestDetail;
}

/** Reshapes a stored sitting into the value the review screen and the exporter
 *  already understand, so history and a just-finished paper share one path. */
export function toCompletedTest(detail: TestDetail): CompletedTest {
  return {
    config: {
      questionCount: detail.questionCount,
      minutes: detail.minutes,
      // Sittings kept before the year filter existed carry no minYear.
      minYear: detail.minYear ?? 0,
    },
    usedSeconds: detail.usedSeconds,
    expired: detail.expired,
    finishedAt: Date.parse(detail.finishedAt),
    answers: detail.answers.map(answer => ({
      question: {
        id: answer.questionId,
        stem: answer.stem,
        options: answer.options,
        source: answer.source,
      },
      selected: answer.selected,
    })),
  };
}
