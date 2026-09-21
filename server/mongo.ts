import { MongoClient, type Db } from 'mongodb';

/** One client per connection string, shared by every feature in the process.
 *  A serverless function is reused between invocations, so opening a second
 *  pool per feature would multiply connections against the Atlas limit. */
const clients = new Map<string, Promise<MongoClient>>();

export function getClient(uri: string): Promise<MongoClient> {
  const existing = clients.get(uri);
  if (existing) return existing;

  const client = new MongoClient(uri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 15000,
  });
  const connecting = client.connect().catch(async cause => {
    // Drop the failed attempt so the next request can retry.
    clients.delete(uri);
    await client.close().catch(() => {});
    throw cause instanceof Error ? cause : new Error('Atlas connection unavailable');
  });
  clients.set(uri, connecting);
  return connecting;
}

export async function getDb(uri: string, database: string): Promise<Db> {
  return (await getClient(uri)).db(database);
}

/** Only for tests and for a graceful shutdown of the long-running server. */
export async function closeAll(): Promise<void> {
  const open = [...clients.values()];
  clients.clear();
  await Promise.all(
    open.map(pending => pending.then(client => client.close()).catch(() => {})),
  );
}
