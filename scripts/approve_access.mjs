// Fetch and approve access requests from the command line. Reads .env for the
// connection string. Approving an address grants Pax access on its next
// sign-in, with no redeploy, because the allowlist reads this collection.
//
//   node scripts/approve_access.mjs list [pending|approved|denied|all]
//   node scripts/approve_access.mjs approve <email>
//   node scripts/approve_access.mjs deny <email>
//
// `list` with no argument shows the pending queue.
import { MongoClient } from 'mongodb';

process.loadEnvFile('.env');

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is not set');
const database = process.env.MONGODB_DATABASE || 'pax';

const [command = 'list', target] = process.argv.slice(2);
const normalise = email => String(email ?? '').trim().toLowerCase();

function usage() {
  console.log(
    [
      'Usage:',
      '  node scripts/approve_access.mjs list [pending|approved|denied|all]',
      '  node scripts/approve_access.mjs approve <email>',
      '  node scripts/approve_access.mjs deny <email>',
    ].join('\n'),
  );
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });

try {
  await client.connect();
  const requests = client.db(database).collection('access_requests');

  if (command === 'list') {
    const status = target && target !== 'all' ? target : null;
    if (status && !['pending', 'approved', 'denied'].includes(status)) {
      usage();
      process.exitCode = 1;
    } else {
      const rows = await requests
        .find(status ? { status } : {})
        .sort({ requestedAt: 1 })
        .toArray();
      if (!rows.length) {
        console.log(status ? `No ${status} requests.` : 'No access requests yet.');
      } else {
        for (const row of rows) {
          const when = row.requestedAt
            ? new Date(row.requestedAt).toISOString().slice(0, 10)
            : '----------';
          const who = row.name ? `  (${row.name})` : '';
          console.log(`${String(row.status).padEnd(9)} ${when}  ${row.email}${who}`);
        }
        console.log(`\n${rows.length} request(s).`);
      }
    }
  } else if (command === 'approve' || command === 'deny') {
    const email = normalise(target);
    if (!email) {
      usage();
      process.exitCode = 1;
    } else {
      const status = command === 'approve' ? 'approved' : 'denied';
      const now = new Date();
      const result = await requests.updateOne(
        { _id: email },
        {
          $set: { email, status, decidedAt: now, decidedBy: 'cli' },
          // Approving an address that never used the form still works, so you
          // can invite people directly.
          $setOnInsert: { name: null, requestedAt: now },
        },
        { upsert: true },
      );
      const created = result.upsertedCount ? 'created and ' : '';
      console.log(`${email} ${created}marked ${status}.`);
      if (status === 'approved') {
        console.log('They can sign in on their next attempt — no redeploy needed.');
      }
    }
  } else {
    usage();
    process.exitCode = 1;
  }
} finally {
  await client.close();
}
