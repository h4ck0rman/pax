import { closeAll, getClient } from './mongo.js';

export type QuestionQuery = { search: string; offset: number; limit: number; random: boolean };

/** Server-only reader for the question bank. Never imported into the browser
 *  bundle. Shares one connection pool with the rest of the process. */
export function atlasQuestionStore(uri: string, database: string) {
  return {
    async query(params: QuestionQuery) {
      const client = await getClient(uri);
      const collection = client.db(database).collection('questions');

      const filter: Record<string, unknown> = { structural_status: 'structurally_clean' };
      if (params.search) {
        filter.stem = {
          $regex: params.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          $options: 'i',
        };
      }
      const projection = { _id: 1, stem: 1, options: 1, source: 1 };
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
