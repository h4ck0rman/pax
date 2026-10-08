import type { Db } from 'mongodb';
import { getDb } from '../mongo.js';
import type { AuthConfig } from '../auth/config.js';
import type { StoredAiEstimate, TestDetail, TestRecord, TestSummary } from './types.js';

/** Only the fields the table needs, so listing does not drag every question
 *  body back from Atlas. */
const SUMMARY_FIELDS = {
  _id: 1,
  minutes: 1,
  usedSeconds: 1,
  expired: 1,
  questionCount: 1,
  answeredCount: 1,
  minYear: 1,
  finishedAt: 1,
} as const;

const toSummary = (record: Omit<TestRecord, 'answers' | 'userId'>): TestSummary => ({
  id: record._id,
  minutes: record.minutes,
  usedSeconds: record.usedSeconds,
  expired: record.expired,
  questionCount: record.questionCount,
  answeredCount: record.answeredCount,
  // Sittings kept before the year filter existed carry no minYear.
  minYear: record.minYear ?? 0,
  finishedAt: record.finishedAt.toISOString(),
});

export type HistoryStore = {
  /** Writes the sitting, replacing any earlier save with the same id from the
   *  same person, so a retry cannot create a duplicate row. */
  save(record: TestRecord): Promise<void>;
  list(userId: string, limit: number, offset: number): Promise<{ total: number; tests: TestSummary[] }>;
  /** Scoped to the owner, so an id from somewhere else returns nothing. */
  detail(userId: string, id: string): Promise<TestDetail | null>;
};

export function mongoHistoryStore(config: AuthConfig): HistoryStore {
  const collection = async () =>
    (await getDb(config.mongoUri, config.mongoDatabase)).collection<TestRecord>('tests');

  return {
    async save(record) {
      const tests = await collection();
      await tests.replaceOne({ _id: record._id, userId: record.userId }, record, {
        upsert: true,
      });
    },

    async list(userId, limit, offset) {
      const tests = await collection();
      const [total, rows] = await Promise.all([
        tests.countDocuments({ userId }, { maxTimeMS: 10000 }),
        tests
          .find({ userId }, { projection: SUMMARY_FIELDS, maxTimeMS: 10000 })
          .sort({ finishedAt: -1 })
          .skip(offset)
          .limit(limit)
          .toArray(),
      ]);
      return { total, tests: rows.map(row => toSummary(row as unknown as TestRecord)) };
    },

    async detail(userId, id) {
      const db = await getDb(config.mongoUri, config.mongoDatabase);
      const record = await db
        .collection<TestRecord>('tests')
        .findOne({ _id: id, userId }, { maxTimeMS: 10000 });
      if (!record) return null;

      // Join each question's current AI suggestion from the bank. This is done at
      // read time rather than stored on the sitting, so sittings saved before the
      // estimates existed still show them, and the stored record never changes.
      const ids = [...new Set(record.answers.map(answer => answer.questionId))];
      const estimates = new Map<string, StoredAiEstimate>();
      if (ids.length) {
        const rows = await db
          .collection<{ _id: string; ai_estimate?: StoredAiEstimate }>('questions')
          .find({ _id: { $in: ids } }, { projection: { _id: 1, ai_estimate: 1 }, maxTimeMS: 10000 })
          .toArray();
        for (const row of rows) {
          if (row.ai_estimate) estimates.set(String(row._id), row.ai_estimate);
        }
      }
      const answers = record.answers.map(answer => ({
        ...answer,
        ai_estimate: estimates.get(answer.questionId) ?? null,
      }));
      return { ...toSummary(record), answers };
    },
  };
}

/** Indexes the sittings collection needs. Safe to run repeatedly. */
export async function ensureHistoryIndexes(db: Db): Promise<void> {
  // Every query is "this person's sittings, newest first".
  await db
    .collection<TestRecord>('tests')
    .createIndex({ userId: 1, finishedAt: -1 }, { name: 'userId_finishedAt' });
}
