import { randomUUID } from 'node:crypto';
import type { Collection, Db } from 'mongodb';
import { getDb } from '../mongo.js';
import type { AuthConfig } from './config.js';

/** A person allowed to use Pax. Identified by their Google subject, never by
 *  their email, so changing address does not create a second account. */
export type UserRecord = {
  _id: string;
  googleSubject: string;
  email: string;
  name: string;
  createdAt: Date;
  lastSignInAt: Date;
};

/** A sign-in that can be listed and revoked. The token carries this id, so
 *  revoking the record ends the session before the token would have expired. */
export type SessionRecord = {
  _id: string;
  userId: string;
  createdAt: Date;
  lastSeenAt: Date;
  /** Sliding expiry, pushed forward while the session is in use. */
  expiresAt: Date;
  /** Hard ceiling, never extended, so a session cannot live forever. */
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
  userAgent: string | null;
};

export type PublicUser = { id: string; email: string; name: string };

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000;

export type AuthStore = {
  upsertUser(profile: { googleSubject: string; email: string; name: string }): Promise<UserRecord>;
  createSession(userId: string, userAgent: string | null): Promise<SessionRecord>;
  /** Returns the session only when it is live: present, not revoked, unexpired. */
  liveSession(sessionId: string): Promise<SessionRecord | null>;
  touchSession(sessionId: string, expiresAt: Date): Promise<void>;
  revokeSession(sessionId: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<number>;
  userById(userId: string): Promise<UserRecord | null>;
};

export function publicUser(user: UserRecord): PublicUser {
  return { id: user._id, email: user.email, name: user.name };
}

export function mongoAuthStore(config: AuthConfig): AuthStore {
  const db = () => getDb(config.mongoUri, config.mongoDatabase);
  const users = async () => (await db()).collection<UserRecord>('users');
  const sessions = async () => (await db()).collection<SessionRecord>('sessions');

  return {
    async upsertUser(profile) {
      const collection = await users();
      const now = new Date();
      const existing = await collection.findOne({ googleSubject: profile.googleSubject });
      if (existing) {
        await collection.updateOne(
          { _id: existing._id },
          { $set: { email: profile.email, name: profile.name, lastSignInAt: now } },
        );
        return { ...existing, email: profile.email, name: profile.name, lastSignInAt: now };
      }
      const created: UserRecord = {
        _id: randomUUID(),
        googleSubject: profile.googleSubject,
        email: profile.email,
        name: profile.name,
        createdAt: now,
        lastSignInAt: now,
      };
      await collection.insertOne(created);
      return created;
    },

    async createSession(userId, userAgent) {
      const collection = await sessions();
      const now = new Date();
      const record: SessionRecord = {
        _id: randomUUID(),
        userId,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
        absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS),
        revokedAt: null,
        userAgent: userAgent ? userAgent.slice(0, 200) : null,
      };
      await collection.insertOne(record);
      return record;
    },

    async liveSession(sessionId) {
      const collection = await sessions();
      const now = new Date();
      return collection.findOne({
        _id: sessionId,
        revokedAt: null,
        expiresAt: { $gt: now },
        absoluteExpiresAt: { $gt: now },
      });
    },

    async touchSession(sessionId, expiresAt) {
      const collection = await sessions();
      await collection.updateOne(
        { _id: sessionId, revokedAt: null },
        { $set: { lastSeenAt: new Date(), expiresAt } },
      );
    },

    async revokeSession(sessionId) {
      const collection = await sessions();
      await collection.updateOne(
        { _id: sessionId, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
    },

    async revokeAllForUser(userId) {
      const collection = await sessions();
      const result = await collection.updateMany(
        { userId, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
      return result.modifiedCount;
    },

    async userById(userId) {
      return (await users()).findOne({ _id: userId });
    },
  };
}

/** Indexes the auth collections need. Safe to run repeatedly. */
export async function ensureAuthIndexes(db: Db): Promise<void> {
  const users = db.collection<UserRecord>('users') as Collection<UserRecord>;
  await users.createIndex({ googleSubject: 1 }, { unique: true, name: 'googleSubject_unique' });
  await users.createIndex({ email: 1 }, { name: 'email' });

  const sessions = db.collection<SessionRecord>('sessions');
  await sessions.createIndex({ userId: 1 }, { name: 'userId' });
  // Mongo removes the document once the hard ceiling passes, so revoked and
  // stale sessions do not accumulate.
  await sessions.createIndex(
    { absoluteExpiresAt: 1 },
    { expireAfterSeconds: 0, name: 'absoluteExpiresAt_ttl' },
  );
}
