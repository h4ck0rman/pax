import type { Db } from 'mongodb';
import { getDb } from '../mongo.js';
import type { AuthConfig } from '../auth/config.js';
import type { TestDetail, TestRecord, TestSummary } from './types.js';

/** Only the fields the table needs, so listing does not drag every question
 *  body back from Atlas. */
const SUMMARY_FIELDS = {
  _id: 1,
  minutes: 1,
  usedSeconds: 1,
  expired: 1,
  questionCount: 1,
  answeredCount: 1,
  finishedAt: 1,
} as const;

const toSummary = (record: Omit<TestRecord, 'answers' | 'userId'>): TestSummary => ({
  id: record._id,
  minutes: record.minutes,
  usedSeconds: record.usedSeconds,
  expired: record.expired,
  questionCount: record.questionCount,
  answeredCount: record.answeredCount,
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
      const tests = await collection();
      const record = await tests.findOne({ _id: id, userId }, { maxTimeMS: 10000 });
      if (!record) return null;
      return { ...toSummary(record), answers: record.answers };
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
