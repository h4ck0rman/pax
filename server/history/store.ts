import type { Db } from 'mongodb';
import { getDb } from '../mongo.js';
import type { AuthConfig } from '../auth/config.js';
import type { StoredAiEstimate, TestDetail, TestRecord, TestStats, TestSummary } from './types.js';

/** Only the fields the table needs, so listing does not drag every question
 *  body back from Atlas. */
const SUMMARY_FIELDS = {
  _id: 1,
  minutes: 1,
  usedSeconds: 1,
  expired: 1,
  questionCount: 1,
  answeredCount: 1,
  years: 1,
  finishedAt: 1,
} as const;

const toSummary = (record: Omit<TestRecord, 'answers' | 'userId'>): TestSummary => ({
  id: record._id,
  minutes: record.minutes,
  usedSeconds: record.usedSeconds,
  expired: record.expired,
  questionCount: record.questionCount,
  answeredCount: record.answeredCount,
  // Sittings kept before the multi-year filter carry no years.
  years: record.years ?? [],
  finishedAt: record.finishedAt.toISOString(),
});

export type HistoryStore = {
  /** Writes the sitting, replacing any earlier save with the same id from the
   *  same person, so a retry cannot create a duplicate row. */
  save(record: TestRecord): Promise<void>;
  list(userId: string, limit: number, offset: number): Promise<{ total: number; tests: TestSummary[] }>;
  /** Scoped to the owner, so an id from somewhere else returns nothing. */
  detail(userId: string, id: string): Promise<TestDetail | null>;
  /** Aggregate numbers across all the owner's sittings, for the dashboard. */
  stats(userId: string): Promise<TestStats>;
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

    async stats(userId) {
      const db = await getDb(config.mongoUri, config.mongoDatabase);
      const rows = await db
        .collection<TestRecord>('tests')
        .find(
          { userId },
          { projection: { usedSeconds: 1, answers: 1 }, maxTimeMS: 10000 },
        )
        .toArray();

      const testsTaken = rows.length;
      if (!testsTaken) {
        return { testsTaken: 0, questionsAnswered: 0, scorePercent: null, avgSeconds: null };
      }

      let questionsAnswered = 0;
      let totalSeconds = 0;
      const answeredIds = new Set<string>();
      for (const row of rows) {
        totalSeconds += row.usedSeconds || 0;
        for (const answer of row.answers || []) {
          if (answer.selected != null) {
            questionsAnswered++;
            answeredIds.add(answer.questionId);
          }
        }
      }

      // The AI pick per answered question, to score agreement the same way the
      // review screen does: the chosen label equals the model's choice label.
      const picks = new Map<string, string | null>();
      const ids = [...answeredIds];
      for (let i = 0; i < ids.length; i += 500) {
        const batch = ids.slice(i, i + 500);
        const found = await db
          .collection<{ _id: string; ai_estimate?: StoredAiEstimate }>('questions')
          .find({ _id: { $in: batch } }, { projection: { _id: 1, 'ai_estimate.choice_label': 1 }, maxTimeMS: 10000 })
          .toArray();
        for (const row of found) picks.set(String(row._id), row.ai_estimate?.choice_label ?? null);
      }

      let matched = 0;
      for (const row of rows) {
        for (const answer of row.answers || []) {
          if (answer.selected != null && picks.get(answer.questionId) === answer.selected) matched++;
        }
      }

      return {
        testsTaken,
        questionsAnswered,
        scorePercent: questionsAnswered ? Math.round((100 * matched) / questionsAnswered) : null,
        avgSeconds: Math.round(totalSeconds / testsTaken),
      };
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
