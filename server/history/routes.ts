import type { HistoryStore } from './store.js';
import { MAX_QUESTIONS, PAGE_SIZE, type StoredAnswer, type TestRecord } from './types.js';

export type HistoryRequest = {
  method: string;
  query: URLSearchParams;
  /** Already parsed JSON, or undefined for a request with no body. */
  body: unknown;
};

export type HistoryResponse = { status: number; body?: unknown };

const json = (status: number, body?: unknown): HistoryResponse => ({ status, body });

/* ---- Validation. Everything below is untrusted browser input. ---- */

const LIMITS = {
  id: 100,
  questionId: 200,
  stem: 8000,
  label: 8,
  optionText: 4000,
  source: 1000,
  originalNumber: 50,
  start: 200,
  options: 12,
};

class Invalid extends Error {}

function text(value: unknown, max: number, field: string): string {
  if (typeof value !== 'string') throw new Invalid(`${field} must be text`);
  if (!value.length || value.length > max) throw new Invalid(`${field} is the wrong length`);
  return value;
}

function optionalText(value: unknown, max: number, field: string): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new Invalid(`${field} must be text`);
  if (value.length > max) throw new Invalid(`${field} is too long`);
  return value;
}

function wholeNumber(value: unknown, min: number, max: number, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Invalid(`${field} must be a whole number`);
  }
  if (value < min || value > max) throw new Invalid(`${field} is out of range`);
  return value;
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Invalid(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function readAnswer(value: unknown, position: number): StoredAnswer {
  const raw = record(value, `answer ${position}`);

  const rawOptions = raw.options;
  if (!Array.isArray(rawOptions) || rawOptions.length < 1 || rawOptions.length > LIMITS.options) {
    throw new Invalid(`answer ${position} has the wrong number of options`);
  }
  const options = rawOptions.map((option, index) => {
    const entry = record(option, `answer ${position} option ${index}`);
    return {
      label: text(entry.label, LIMITS.label, `answer ${position} option ${index} label`),
      text: optionalText(entry.text, LIMITS.optionText, `answer ${position} option ${index} text`),
    };
  });

  const labels = new Set(options.map(option => option.label));
  if (labels.size !== options.length) throw new Invalid(`answer ${position} repeats an option label`);

  // A selection must name one of this question's own options.
  let selected: string | null = null;
  if (raw.selected !== undefined && raw.selected !== null) {
    selected = text(raw.selected, LIMITS.label, `answer ${position} selection`);
    if (!labels.has(selected)) throw new Invalid(`answer ${position} selected a missing option`);
  }

  let source: StoredAnswer['source'] = null;
  if (raw.source !== undefined && raw.source !== null) {
    const entry = record(raw.source, `answer ${position} source`);
    source = {
      source: optionalText(entry.source, LIMITS.source, `answer ${position} source path`),
      original_number: optionalText(
        entry.original_number,
        LIMITS.originalNumber,
        `answer ${position} source number`,
      ),
      start: optionalText(entry.start, LIMITS.start, `answer ${position} source start`),
    };
  }

  return {
    questionId: text(raw.questionId, LIMITS.questionId, `answer ${position} question id`),
    stem: text(raw.stem, LIMITS.stem, `answer ${position} stem`),
    options,
    source,
    selected,
  };
}

/** Builds the record to store, or throws Invalid. The clock is the server's, so
 *  a browser cannot backdate or postdate a sitting. */
export function readTest(body: unknown, userId: string): TestRecord {
  const raw = record(body, 'body');
  const rawAnswers = raw.answers;
  if (!Array.isArray(rawAnswers) || !rawAnswers.length || rawAnswers.length > MAX_QUESTIONS) {
    throw new Invalid('answers must hold between one and a hundred questions');
  }

  const answers = rawAnswers.map(readAnswer);

  return {
    _id: text(raw.id, LIMITS.id, 'id'),
    userId,
    minutes: wholeNumber(raw.minutes, 1, 600, 'minutes'),
    usedSeconds: wholeNumber(raw.usedSeconds, 0, 86_400, 'usedSeconds'),
    expired: raw.expired === true,
    // 0 means the sitting drew from every year. Any other value must be a year a
    // paper could carry, not an arbitrary number.
    minYear: raw.minYear === undefined || raw.minYear === null || raw.minYear === 0
      ? 0
      : wholeNumber(raw.minYear, 1980, 2049, 'minYear'),
    questionCount: answers.length,
    answeredCount: answers.filter(answer => answer.selected).length,
    finishedAt: new Date(),
    answers,
  };
}

/* ---- Routes ---- */

/** `/api/tests` for the signed-in reader. The caller authenticates first and
 *  passes the user id; nothing here trusts an id from the request. */
export async function handleHistoryRequest(
  store: HistoryStore,
  userId: string,
  request: HistoryRequest,
): Promise<HistoryResponse> {
  if (request.method === 'POST') {
    let candidate: TestRecord;
    try {
      candidate = readTest(request.body, userId);
    } catch (cause) {
      if (cause instanceof Invalid) return json(400, { error: cause.message });
      throw cause;
    }
    await store.save(candidate);
    return json(201, { id: candidate._id, finishedAt: candidate.finishedAt.toISOString() });
  }

  if (request.method !== 'GET') {
    return json(405, { error: 'GET or POST only' });
  }

  const id = request.query.get('id');
  if (id) {
    if (id.length > LIMITS.id) return json(400, { error: 'Invalid id' });
    const detail = await store.detail(userId, id);
    // Someone else's id is indistinguishable from one that does not exist.
    if (!detail) return json(404, { error: 'No such test' });
    return json(200, { test: detail });
  }

  const limit = Number(request.query.get('limit') ?? PAGE_SIZE);
  const offset = Number(request.query.get('offset') ?? 0);
  if (
    !Number.isSafeInteger(limit) ||
    !Number.isSafeInteger(offset) ||
    limit < 1 ||
    limit > 50 ||
    offset < 0
  ) {
    return json(400, { error: 'Invalid pagination' });
  }

  return json(200, await store.list(userId, limit, offset));
}
