import type { Collection, Db } from 'mongodb';
import { getDb } from '../mongo.js';
import type { AuthConfig } from '../auth/config.js';

/** The lifecycle of a request to use Pax. `approved` is what the allowlist
 *  reads, so approving an address here is what grants access. */
export type AccessStatus = 'pending' | 'approved' | 'denied';

/** One person's request for access. The normalised email is the `_id`, so a
 *  repeat request from the same address updates the one record rather than
 *  piling up duplicates, and no separate unique index is needed. */
export type AccessRequestRecord = {
  _id: string;
  email: string;
  name: string | null;
  status: AccessStatus;
  requestedAt: Date;
  decidedAt: Date | null;
  /** How the decision was made, e.g. 'cli'. Null while still pending. */
  decidedBy: string | null;
};

/** Lower-cased and trimmed, matching how the auth allowlist compares emails, so
 *  an approval here lines up with the address Google returns at sign-in. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type AccessStore = {
  /** Record a public request. Idempotent: an already-approved address stays
   *  approved, and any other state (new, pending, denied) becomes pending. */
  createRequest(input: { email: string; name: string | null }): Promise<AccessRequestRecord>;
  /** The single question the allowlist asks. */
  isApproved(email: string): Promise<boolean>;
  listByStatus(status: AccessStatus | null): Promise<AccessRequestRecord[]>;
};

export function mongoAccessStore(config: AuthConfig): AccessStore {
  const requests = async () =>
    (await getDb(config.mongoUri, config.mongoDatabase)).collection<AccessRequestRecord>(
      'access_requests',
    );

  return {
    async createRequest({ email, name }) {
      const collection = await requests();
      const _id = normaliseEmail(email);
      const now = new Date();
      const existing = await collection.findOne({ _id });

      if (existing) {
        // Never downgrade someone already approved back into the queue.
        const status: AccessStatus = existing.status === 'approved' ? 'approved' : 'pending';
        const next = {
          name: name ?? existing.name,
          status,
          // Only move the queue position when they are actually re-queued.
          requestedAt: status === 'pending' ? now : existing.requestedAt,
        };
        await collection.updateOne({ _id }, { $set: next });
        return { ...existing, ...next };
      }

      const record: AccessRequestRecord = {
        _id,
        email: _id,
        name: name ?? null,
        status: 'pending',
        requestedAt: now,
        decidedAt: null,
        decidedBy: null,
      };
      await collection.insertOne(record);
      return record;
    },

    async isApproved(email) {
      const collection = await requests();
      const found = await collection.findOne({ _id: normaliseEmail(email), status: 'approved' });
      return found !== null;
    },

    async listByStatus(status) {
      const collection = await requests();
      const filter = status ? { status } : {};
      return collection.find(filter).sort({ requestedAt: 1 }).toArray();
    },
  };
}

/** Index the access-request collection needs. Safe to run repeatedly. The `_id`
 *  is the email, so uniqueness is already guaranteed; this only speeds listing
 *  the queue by status. */
export async function ensureAccessIndexes(db: Db): Promise<void> {
  const requests = db.collection<AccessRequestRecord>('access_requests') as Collection<AccessRequestRecord>;
  await requests.createIndex({ status: 1, requestedAt: 1 }, { name: 'status_requestedAt' });
}
