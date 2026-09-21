import { MongoClient } from 'mongodb';

export type QuestionQuery = { search: string; offset: number; limit: number; random: boolean };

/** Server-only connection pool; never imported into the browser bundle. */
export function atlasQuestionStore(uri: string, database: string) {
  let client: MongoClient | null = null;
  let connection: Promise<MongoClient> | null = null;
  async function connect() {
    if (!connection) {
      client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000, socketTimeoutMS: 15000 });
      const current = client;
      connection = current.connect().catch(async () => {
        connection = null;
        await current.close();
        throw new Error('Atlas connection unavailable');
      });
    }
    return connection;
  }
  return {
    async query(params: QuestionQuery) {
      const databaseClient = await connect();
      const collection = databaseClient.db(database).collection('questions');
      const filter: Record<string, unknown> = { structural_status: 'structurally_clean' };
      if (params.search) filter.stem = { $regex: params.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      const projection = { _id: 1, stem: 1, options: 1, source: 1 };
      const limit = Math.max(1, Math.min(100, params.limit));
      const rows = params.random
        ? collection.aggregate([{ $match: filter }, { $sample: { size: limit } }, { $project: projection }], { maxTimeMS: 10000 }).toArray()
        : collection.find(filter, { projection, maxTimeMS: 10000 }).sort({ _id: 1 }).skip(Math.max(0, params.offset)).limit(limit).toArray();
      const [total, questions] = await Promise.all([collection.countDocuments(filter, { maxTimeMS: 10000 }), rows]);
      return { total, questions: questions.map(({ _id, ...question }) => ({ id: String(_id), ...question })) };
    },
    async close() { if (client) await client.close(); },
  };
}
