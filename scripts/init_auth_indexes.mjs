// Creates the indexes the users and sessions collections need. Safe to rerun.
import { MongoClient } from 'mongodb';

process.loadEnvFile('.env');

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is not set');
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });

try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DATABASE || 'pax');

  await db.collection('users').createIndex({ googleSubject: 1 }, { unique: true, name: 'googleSubject_unique' });
  await db.collection('users').createIndex({ email: 1 }, { name: 'email' });
  await db.collection('sessions').createIndex({ userId: 1 }, { name: 'userId' });
  await db.collection('sessions').createIndex(
    { absoluteExpiresAt: 1 },
    { expireAfterSeconds: 0, name: 'absoluteExpiresAt_ttl' },
  );

  // Past tests: every query is "this person's sittings, newest first".
  await db.collection('tests').createIndex({ userId: 1, finishedAt: -1 }, { name: 'userId_finishedAt' });

  for (const name of ['users', 'sessions', 'tests']) {
    const indexes = await db.collection(name).indexes();
    console.log(`${name}: ${indexes.map(index => index.name).join(', ')}`);
  }
} finally {
  await client.close();
}
