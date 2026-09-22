import { closeAll, getClient } from './mongo.js';
import type { Db } from 'mongodb';

export type QuestionQuery = {
  search: string;
  offset: number;
  limit: number;
  random: boolean;
  /** Serve only papers from this year onwards. 0 means every year. */
  minYear: number;
};

/** The oldest and newest paper year a request may ask for. The bank holds
 *  papers from the mid 2000s on, and a year outside this range is a mistake
 *  rather than a filter. */
export const EARLIEST_YEAR = 1980;
export const LATEST_YEAR = 2049;

/** Builds the query every read path shares, so the four transports cannot
 *  drift apart on which questions are servable. */
export function questionFilter(params: Pick<QuestionQuery, 'search' | 'minYear'>) {
  const filter: Record<string, unknown> = { structural_status: 'structurally_clean' };
  if (params.search) {
    filter.stem = {
      $regex: params.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      $options: 'i',
    };
  }
  if (params.minYear) {
    // A question whose source names no year is left out rather than assumed to
    // be recent. The year is unknown, not zero.
    filter.paper_year = {
      $gte: Math.max(EARLIEST_YEAR, Math.min(LATEST_YEAR, params.minYear)),
    };
  }
  return filter;
}

/** Server-only reader for the question bank. Never imported into the browser
 *  bundle. Shares one connection pool with the rest of the process. */
export function atlasQuestionStore(uri: string, database: string) {
  return {
    async query(params: QuestionQuery) {
      const client = await getClient(uri);
      const collection = client.db(database).collection('questions');

      const filter = questionFilter(params);
      const projection = { _id: 1, stem: 1, options: 1, source: 1, paper_year: 1 };
      const limit = Math.max(1, Math.min(100, params.limit));

      const rows = params.random
        ? collection
            .aggregate(
              [{ $match: filter }, { $sample: { size: limit } }, { $project: projection }],
              { maxTimeMS: 10000 },
            )
            .toArray()
        : collection
            .find(filter, { projection, maxTimeMS: 10000 })
            .sort({ _id: 1 })
            .skip(Math.max(0, params.offset))
            .limit(limit)
            .toArray();

      const [total, questions] = await Promise.all([
        collection.countDocuments(filter, { maxTimeMS: 10000 }),
        rows,
      ]);
      return {
        total,
        questions: questions.map(({ _id, ...question }) => ({ id: String(_id), ...question })),
      };
    },

    /** Closes every shared pool. Only for shutdown, not per request. */
    async close() {
      await closeAll();
    },
  };
}

/** Indexes the questions collection needs. Safe to run repeatedly.
 *
 *  Without these every request scans the collection. They are created here as
 *  well as by the import script, because a deployment pointed at a database
 *  someone else imported would otherwise run unindexed forever. */
export async function ensureQuestionIndexes(db: Db): Promise<void> {
  const questions = db.collection('questions');
  await questions.createIndex(
    { structural_status: 1, paper_year: 1, _id: 1 },
    { name: 'structural_status_paper_year_id' },
  );
}
