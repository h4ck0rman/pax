import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';

import { createProductionServer } from '../dist-server/production.js';
import { readAuthConfig } from '../dist-server/auth/config.js';
import { SESSION_COOKIE, signSessionToken } from '../dist-server/auth/tokens.js';
import { SESSION_TTL_MS } from '../dist-server/auth/store.js';

const SECRET = 'a-test-only-session-secret-of-sufficient-length';
const config = readAuthConfig({
  SESSION_SECRET: SECRET,
  MONGODB_URI: 'mongodb://localhost/pax',
  ALLOWED_EMAILS: 'reader@example.com',
});

const now = Date.now();
const user = {
  _id: 'user-1',
  googleSubject: 'google-1',
  email: 'reader@example.com',
  name: 'Reader',
  createdAt: new Date(now),
  lastSignInAt: new Date(now),
};
const session = {
  _id: 'session-1',
  userId: user._id,
  createdAt: new Date(now),
  lastSeenAt: new Date(now),
  expiresAt: new Date(now + SESSION_TTL_MS),
  absoluteExpiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
  revokedAt: null,
  userAgent: null,
};

function store({ revoked = false } = {}) {
  return {
    async upsertUser() {
      return user;
    },
    async createSession() {
      return session;
    },
    async liveSession(id) {
      if (revoked || id !== session._id) return null;
      return session;
    },
    async touchSession() {},
    async revokeSession() {},
    async revokeAllForUser() {
      return 0;
    },
    async userById(id) {
      return id === user._id ? user : null;
    },
  };
}

/** In-memory stand-in for the past tests collection. */
function historyStore() {
  const saved = [];
  return {
    saved,
    async save(record) {
      saved.push(record);
    },
    async list() {
      return { total: saved.length, tests: [] };
    },
    async detail() {
      return null;
    },
  };
}

async function start({ revoked = false } = {}) {
  let queries = 0;
  const history = historyStore();
  const server = createProductionServer({
    dist: resolve('dist'),
    store: {
      async query() {
        queries += 1;
        return { total: 1, questions: [] };
      },
    },
    history,
    auth: { config, store: store({ revoked }) },
    secure: false,
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    history,
    get queries() {
      return queries;
    },
    async stop() {
      server.closeAllConnections();
      await new Promise(done => server.close(done));
    },
  };
}

async function cookie() {
  const token = await signSessionToken(
    config.sessionSecret,
    { userId: user._id, sessionId: session._id },
    session.expiresAt,
  );
  return `${SESSION_COOKIE}=${token}`;
}

const asset = () => `/assets/${readdirSync('dist/assets').find(name => name.endsWith('.js'))}`;

test('the shell is public so the sign-in page can load', async () => {
  const app = await start();
  try {
    for (const path of ['/', '/index.html', asset(), '/favicon.svg', '/terms', '/privacy']) {
      const response = await fetch(app.base + path);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.equal(response.headers.get('x-frame-options'), 'DENY');
      assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
    }
    // A missing file still reports 404 rather than silently serving the shell.
    assert.equal((await fetch(app.base + '/assets/missing.js')).status, 404);
  } finally {
    await app.stop();
  }
});

test('question data needs a live session and never leaks to a stranger', async () => {
  const app = await start();
  try {
    for (const path of ['/api/questions', '/api/questions?random=true&limit=5']) {
      const response = await fetch(app.base + path);
      assert.equal(response.status, 401, path);
      const body = await response.json();
      assert.equal(body.questions, undefined);
    }
    // The store is never consulted for an unauthenticated request.
    assert.equal(app.queries, 0);

    for (const bad of ['nonsense', 'a.b.c', '']) {
      const response = await fetch(app.base + '/api/questions', {
        headers: { cookie: `${SESSION_COOKIE}=${bad}` },
      });
      assert.equal(response.status, 401, bad);
    }
    assert.equal(app.queries, 0);

    const response = await fetch(app.base + '/api/questions', { headers: { cookie: await cookie() } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { total: 1, questions: [] });
    assert.equal(app.queries, 1);
  } finally {
    await app.stop();
  }
});

test('a revoked session is refused even with a validly signed token', async () => {
  const app = await start({ revoked: true });
  try {
    const response = await fetch(app.base + '/api/questions', { headers: { cookie: await cookie() } });
    assert.equal(response.status, 401);
    assert.equal(app.queries, 0);
  } finally {
    await app.stop();
  }
});

test('the signed-in API still validates its inputs', async () => {
  const app = await start();
  const headers = { cookie: await cookie() };
  try {
    for (const query of ['?limit=0', '?limit=101', '?offset=-1', '?limit=abc']) {
      assert.equal((await fetch(app.base + '/api/questions' + query, { headers })).status, 400, query);
    }
    const post = await fetch(app.base + '/api/questions', { method: 'POST', headers });
    assert.equal(post.status, 405);
    assert.equal((await fetch(app.base + '/api/unknown', { headers })).status, 404);
  } finally {
    await app.stop();
  }
});

test('nothing outside the build is reachable', async () => {
  const app = await start();
  const headers = { cookie: await cookie() };
  try {
    for (const path of [
      '/.env',
      '/server/start.ts',
      '/data/extraction/questions.sqlite',
      '/%2e%2e/.env',
      '/../.env',
    ]) {
      const response = await fetch(app.base + path, { headers });
      assert.ok([400, 404].includes(response.status), `${path} -> ${response.status}`);
    }
  } finally {
    await app.stop();
  }
});

test('past tests need a live session, and never accept junk', async () => {
  const app = await start();
  const headers = { cookie: await cookie() };
  try {
    // Closed to a stranger, and the store is never touched.
    for (const init of [{}, { method: 'POST', body: '{}' }]) {
      const response = await fetch(app.base + '/api/tests', init);
      assert.equal(response.status, 401, JSON.stringify(init));
    }
    assert.equal(app.history.saved.length, 0);

    assert.equal((await fetch(app.base + '/api/tests', { headers })).status, 200);

    // A signed-in reader still has their upload checked.
    const bad = [
      {},
      { id: 'x', minutes: 15, usedSeconds: 1, answers: [] },
      { id: 'x', minutes: 0, usedSeconds: 1, answers: [{ questionId: 'q', stem: 's', options: [{ label: 'A', text: 'x' }] }] },
      {
        id: 'x',
        minutes: 15,
        usedSeconds: 1,
        answers: [{ questionId: 'q', stem: 's', options: [{ label: 'A', text: 'x' }], selected: 'Z' }],
      },
    ];
    for (const body of bad) {
      const response = await fetch(app.base + '/api/tests', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400, JSON.stringify(body).slice(0, 40));
    }
    assert.equal(app.history.saved.length, 0);

    // A well-formed sitting is kept, and stamped with the server's own clock.
    const good = {
      id: 'sitting-1',
      minutes: 15,
      usedSeconds: 42,
      expired: false,
      answers: [
        {
          questionId: 'q1',
          stem: 'A stem',
          options: [{ label: 'A', text: 'One' }, { label: 'B', text: 'Two' }],
          selected: 'B',
        },
      ],
    };
    const created = await fetch(app.base + '/api/tests', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(good),
    });
    assert.equal(created.status, 201);
    assert.equal(app.history.saved.length, 1);

    const [record] = app.history.saved;
    assert.equal(record.userId, user._id, 'the sitting is filed against the signed-in reader');
    assert.equal(record.answeredCount, 1);
    assert.equal(record.questionCount, 1);
    assert.ok(record.finishedAt instanceof Date);
  } finally {
    await app.stop();
  }
});

test('the server refuses to start without a build', () => {
  assert.throws(
    () =>
      createProductionServer({
        dist: resolve('scripts'),
        store: { async query() {} },
        history: historyStore(),
        auth: { config, store: store() },
      }),
    /Build the frontend/,
  );
});
