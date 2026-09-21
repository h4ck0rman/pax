import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  readAuthConfig,
  emailAllowed,
  secureCookiesFor,
  isLoopbackHost,
  AuthConfigError,
} from '../dist-server/auth/config.js';
import {
  SESSION_COOKIE,
  OAUTH_COOKIE,
  clearCookie,
  readCookie,
  serialiseCookie,
  signOAuthToken,
  signSessionToken,
  verifyOAuthToken,
  verifySessionToken,
} from '../dist-server/auth/tokens.js';
import { authenticate, handleAuthRequest } from '../dist-server/auth/routes.js';
import { SESSION_TTL_MS } from '../dist-server/auth/store.js';

const SECRET = 'a-test-only-session-secret-of-sufficient-length';

const baseEnv = {
  SESSION_SECRET: SECRET,
  MONGODB_URI: 'mongodb://localhost/pax',
  ALLOWED_EMAILS: 'reader@example.com',
};

const config = (overrides = {}) => readAuthConfig({ ...baseEnv, ...overrides });

/** In-memory replacement for the Mongo-backed store. */
function fakeStore({ user, session } = {}) {
  const users = new Map();
  const sessions = new Map();
  if (user) users.set(user._id, user);
  if (session) sessions.set(session._id, session);
  const calls = { revoked: [], touched: [], created: [] };

  return {
    calls,
    users,
    sessions,
    async upsertUser(profile) {
      const existing = [...users.values()].find(item => item.googleSubject === profile.googleSubject);
      if (existing) {
        Object.assign(existing, { email: profile.email, name: profile.name });
        return existing;
      }
      const created = {
        _id: `user-${users.size + 1}`,
        googleSubject: profile.googleSubject,
        email: profile.email,
        name: profile.name,
        createdAt: new Date(),
        lastSignInAt: new Date(),
      };
      users.set(created._id, created);
      return created;
    },
    async createSession(userId) {
      const now = Date.now();
      const record = {
        _id: `session-${sessions.size + 1}`,
        userId,
        createdAt: new Date(now),
        lastSeenAt: new Date(now),
        expiresAt: new Date(now + SESSION_TTL_MS),
        absoluteExpiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
        revokedAt: null,
        userAgent: null,
      };
      sessions.set(record._id, record);
      calls.created.push(record._id);
      return record;
    },
    async liveSession(id) {
      const record = sessions.get(id);
      if (!record || record.revokedAt) return null;
      const now = Date.now();
      if (record.expiresAt.getTime() <= now) return null;
      if (record.absoluteExpiresAt.getTime() <= now) return null;
      return record;
    },
    async touchSession(id, expiresAt) {
      calls.touched.push(id);
      const record = sessions.get(id);
      if (record && !record.revokedAt) record.expiresAt = expiresAt;
    },
    async revokeSession(id) {
      calls.revoked.push(id);
      const record = sessions.get(id);
      if (record) record.revokedAt = new Date();
    },
    async revokeAllForUser() {
      return 0;
    },
    async userById(id) {
      return users.get(id) ?? null;
    },
  };
}

function signedInFixture({ email = 'reader@example.com', ageMs = 0 } = {}) {
  const now = Date.now();
  const user = {
    _id: 'user-1',
    googleSubject: 'google-1',
    email,
    name: 'Reader',
    createdAt: new Date(now),
    lastSignInAt: new Date(now),
  };
  const session = {
    _id: 'session-1',
    userId: user._id,
    createdAt: new Date(now - ageMs),
    lastSeenAt: new Date(now - ageMs),
    expiresAt: new Date(now - ageMs + SESSION_TTL_MS),
    absoluteExpiresAt: new Date(now - ageMs + 7 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    userAgent: null,
  };
  return { user, session };
}

const request = (overrides = {}) => ({
  method: 'GET',
  path: '/api/auth/me',
  query: new URLSearchParams(),
  cookie: undefined,
  userAgent: null,
  requestOrigin: 'https://pax.test',
  secure: true,
  ...overrides,
});

async function sessionCookie(claims, expiresAt) {
  const token = await signSessionToken(config().sessionSecret, claims, expiresAt);
  return `${SESSION_COOKIE}=${token}`;
}

test('configuration fails closed rather than weakening', () => {
  assert.throws(() => readAuthConfig({}), AuthConfigError);
  assert.throws(() => readAuthConfig({ SESSION_SECRET: 'short' }), AuthConfigError);
  // A secret but nobody allowed is misconfiguration, never "allow everyone".
  assert.throws(
    () => readAuthConfig({ SESSION_SECRET: SECRET, MONGODB_URI: 'mongodb://x/pax' }),
    AuthConfigError,
  );
  // Google is optional, so an existing session still works without a client.
  assert.equal(config().google, null);
  assert.deepEqual(
    config({
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
      PUBLIC_ORIGIN: 'https://pax.test',
    }).google,
    { clientId: 'id', clientSecret: 'secret' },
  );

  // Google without a pinned origin would mean trusting the request Host.
  assert.throws(
    () => config({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' }),
    AuthConfigError,
  );
  for (const bad of ['not-a-url', 'ftp://pax.test', 'https://pax.test/app', 'https://pax.test/?a=1']) {
    assert.throws(() => config({ PUBLIC_ORIGIN: bad }), AuthConfigError, bad);
  }
  assert.equal(config({ PUBLIC_ORIGIN: 'https://pax.test/' }).publicOrigin, 'https://pax.test');
});

test('cookie transport is decided by configuration, not by a request', () => {
  assert.equal(secureCookiesFor(config({ PUBLIC_ORIGIN: 'https://pax.test' })), true);
  assert.equal(secureCookiesFor(config({ PUBLIC_ORIGIN: 'http://127.0.0.1:5173' })), false);
  // Nothing trustworthy to decide from, so the caller must fall back.
  assert.equal(secureCookiesFor(config()), null);

  for (const host of ['localhost', 'localhost:3000', '127.0.0.1', '127.0.0.1:5173', '[::1]:8080']) {
    assert.ok(isLoopbackHost(host), host);
  }
  for (const host of ['pax.test', 'pax.test:443', 'notlocalhost', 'localhost.evil.test']) {
    assert.equal(isLoopbackHost(host), false, host);
  }
});

test('the allowlist admits only the intended addresses', () => {
  const byEmail = config({ ALLOWED_EMAILS: 'Reader@Example.com, other@example.org' });
  assert.ok(emailAllowed(byEmail, 'reader@example.com'));
  assert.ok(emailAllowed(byEmail, '  READER@EXAMPLE.COM '));
  assert.ok(emailAllowed(byEmail, 'other@example.org'));
  assert.equal(emailAllowed(byEmail, 'stranger@example.com'), false);
  assert.equal(emailAllowed(byEmail, ''), false);
  assert.equal(emailAllowed(byEmail, 'reader@example.com.evil.test'), false);

  const byDomain = config({ ALLOWED_EMAILS: '', ALLOWED_DOMAIN: 'hospital.test' });
  assert.ok(emailAllowed(byDomain, 'someone@hospital.test'));
  assert.equal(emailAllowed(byDomain, 'someone@hospital.test.evil.test'), false);
  assert.equal(emailAllowed(byDomain, 'someone@nothospital.test'), false);
  assert.equal(emailAllowed(byDomain, 'hospital.test'), false);
});

test('session tokens only verify under the right key, audience and clock', async () => {
  const secret = config().sessionSecret;
  const claims = { userId: 'user-1', sessionId: 'session-1' };
  const token = await signSessionToken(secret, claims, new Date(Date.now() + 60_000));

  const verified = await verifySessionToken(secret, token);
  assert.equal(verified.userId, 'user-1');
  assert.equal(verified.sessionId, 'session-1');

  // A different key must not verify.
  const otherSecret = new TextEncoder().encode(`${SECRET}-different`);
  assert.equal(await verifySessionToken(otherSecret, token), null);

  // An unsigned token must never be accepted.
  const unsigned =
    'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.' +
    Buffer.from(
      JSON.stringify({ iss: 'pax', aud: 'pax:session', sub: 'admin', sid: 'x', exp: 9999999999 }),
    ).toString('base64url') +
    '.';
  assert.equal(await verifySessionToken(secret, unsigned), null);

  // Already expired.
  const stale = await signSessionToken(secret, claims, new Date(Date.now() - 1000));
  assert.equal(await verifySessionToken(secret, stale), null);

  // An in-flight sign-in token is a different audience and cannot be swapped in.
  const oauth = await signOAuthToken(secret, { state: 's', nonce: 'n', codeVerifier: 'v' });
  assert.equal(await verifySessionToken(secret, oauth), null);
  assert.equal(await verifyOAuthToken(secret, token), null);
  assert.deepEqual(await verifyOAuthToken(secret, oauth), {
    state: 's',
    nonce: 'n',
    codeVerifier: 'v',
  });

  assert.equal(await verifySessionToken(secret, 'nonsense'), null);
  assert.equal(await verifySessionToken(secret, ''), null);
});

test('cookies are locked down and only Secure over TLS', () => {
  const secure = serialiseCookie(SESSION_COOKIE, 'value', { maxAgeSeconds: 60, secure: true });
  assert.match(secure, /^pax_session=value/);
  assert.ok(secure.includes('HttpOnly'));
  assert.ok(secure.includes('SameSite=Lax'));
  assert.ok(secure.includes('Path=/'));
  assert.ok(secure.includes('Secure'));
  assert.ok(secure.includes('Max-Age=60'));

  const plain = serialiseCookie(SESSION_COOKIE, 'value', { maxAgeSeconds: 60, secure: false });
  assert.equal(plain.includes('Secure'), false);

  assert.ok(clearCookie(SESSION_COOKIE, true).includes('Max-Age=0'));

  assert.equal(readCookie('a=1; pax_session=abc; b=2', SESSION_COOKIE), 'abc');
  assert.equal(readCookie('pax_session=', SESSION_COOKIE), null);
  assert.equal(readCookie(undefined, SESSION_COOKIE), null);
  assert.equal(readCookie('other=1', SESSION_COOKIE), null);
  // A prefix must not be mistaken for the real cookie.
  assert.equal(readCookie('xpax_session=abc', SESSION_COOKIE), null);
});

test('authenticate requires a live session that matches the token', async () => {
  const { user, session } = signedInFixture();
  const store = fakeStore({ user, session });
  const deps = { config: config(), store };
  const cookie = await sessionCookie(
    { userId: user._id, sessionId: session._id },
    session.expiresAt,
  );

  assert.ok(await authenticate(deps, { cookie }));
  assert.equal(await authenticate(deps, { cookie: undefined }), null);

  // Revoked on the server, even though the signature is still good.
  await store.revokeSession(session._id);
  assert.equal(await authenticate(deps, { cookie }), null);

  // A token naming a session that does not exist.
  const orphan = await sessionCookie(
    { userId: user._id, sessionId: 'no-such-session' },
    new Date(Date.now() + 60_000),
  );
  assert.equal(await authenticate({ config: config(), store: fakeStore({ user }) }, { cookie: orphan }), null);

  // A token whose subject disagrees with the session's owner.
  const fresh = signedInFixture();
  const mismatched = await sessionCookie(
    { userId: 'someone-else', sessionId: fresh.session._id },
    fresh.session.expiresAt,
  );
  assert.equal(
    await authenticate(
      { config: config(), store: fakeStore({ user: fresh.user, session: fresh.session }) },
      { cookie: mismatched },
    ),
    null,
  );

  // Removed from the allowlist: access ends at the next request.
  const removed = signedInFixture({ email: 'gone@example.com' });
  const removedCookie = await sessionCookie(
    { userId: removed.user._id, sessionId: removed.session._id },
    removed.session.expiresAt,
  );
  assert.equal(
    await authenticate(
      { config: config(), store: fakeStore({ user: removed.user, session: removed.session }) },
      { cookie: removedCookie },
    ),
    null,
  );
});

test('who am I returns only public fields, and slides a half-spent session', async () => {
  const { user, session } = signedInFixture();
  const store = fakeStore({ user, session });
  const deps = { config: config(), store };
  const cookie = await sessionCookie(
    { userId: user._id, sessionId: session._id },
    session.expiresAt,
  );

  const anonymous = await handleAuthRequest(deps, request());
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.user, undefined);

  const fresh = await handleAuthRequest(deps, request({ cookie }));
  assert.equal(fresh.status, 200);
  assert.deepEqual(Object.keys(fresh.body.user).sort(), ['email', 'id', 'name']);
  assert.equal(fresh.body.user.email, 'reader@example.com');
  // A fresh session is not re-issued.
  assert.equal(fresh.headers['Set-Cookie'], undefined);
  assert.deepEqual(store.calls.touched, []);

  // More than half spent: the session slides and a new cookie is issued.
  const spent = signedInFixture({ ageMs: SESSION_TTL_MS * 0.8 });
  const spentStore = fakeStore({ user: spent.user, session: spent.session });
  const spentCookie = await sessionCookie(
    { userId: spent.user._id, sessionId: spent.session._id },
    spent.session.expiresAt,
  );
  const slid = await handleAuthRequest(
    { config: config(), store: spentStore },
    request({ cookie: spentCookie }),
  );
  assert.equal(slid.status, 200);
  assert.match(slid.headers['Set-Cookie'], /pax_session=/);
  assert.deepEqual(spentStore.calls.touched, [spent.session._id]);

  // A session close to its hard ceiling slides only as far as the ceiling.
  const nearCeiling = signedInFixture();
  const ceiling = new Date(Date.now() + 30 * 60_000);
  nearCeiling.session.absoluteExpiresAt = ceiling;
  nearCeiling.session.expiresAt = new Date(Date.now() + 10 * 60_000);
  const ceilingStore = fakeStore({ user: nearCeiling.user, session: nearCeiling.session });
  const ceilingCookie = await sessionCookie(
    { userId: nearCeiling.user._id, sessionId: nearCeiling.session._id },
    nearCeiling.session.expiresAt,
  );
  const capped = await handleAuthRequest(
    { config: config(), store: ceilingStore },
    request({ cookie: ceilingCookie }),
  );
  assert.equal(capped.status, 200);
  // It did slide, and it stopped exactly at the ceiling rather than a full term.
  assert.deepEqual(ceilingStore.calls.touched, [nearCeiling.session._id]);
  assert.equal(
    ceilingStore.sessions.get(nearCeiling.session._id).expiresAt.getTime(),
    ceiling.getTime(),
  );
});

test('sign out revokes the session and always clears the cookie', async () => {
  const { user, session } = signedInFixture();
  const store = fakeStore({ user, session });
  const deps = { config: config(), store };
  const cookie = await sessionCookie(
    { userId: user._id, sessionId: session._id },
    session.expiresAt,
  );

  const out = await handleAuthRequest(
    deps,
    request({ path: '/api/auth/logout', method: 'POST', cookie }),
  );
  assert.equal(out.status, 204);
  assert.match(out.headers['Set-Cookie'], /Max-Age=0/);
  assert.deepEqual(store.calls.revoked, [session._id]);
  assert.equal(await authenticate(deps, { cookie }), null);

  // Signing out without a session still clears whatever the browser holds.
  const anonymous = await handleAuthRequest(
    deps,
    request({ path: '/api/auth/logout', method: 'POST' }),
  );
  assert.equal(anonymous.status, 204);
  assert.match(anonymous.headers['Set-Cookie'], /Max-Age=0/);
});

test('auth routes reject the wrong method', async () => {
  const deps = { config: config(), store: fakeStore() };
  for (const [path, method, allow] of [
    ['/api/auth/me', 'POST', 'GET'],
    ['/api/auth/logout', 'GET', 'POST'],
    ['/api/auth/google/start', 'POST', 'GET'],
    ['/api/auth/google/callback', 'POST', 'GET'],
  ]) {
    const result = await handleAuthRequest(deps, request({ path, method }));
    assert.equal(result.status, 405, `${method} ${path}`);
    assert.equal(result.headers.Allow, allow);
  }
  assert.equal(await handleAuthRequest(deps, request({ path: '/api/auth/nope' })), null);
});

test('sign-in start carries PKCE and a state cookie', async () => {
  const deps = {
    config: config({
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'client-secret',
      PUBLIC_ORIGIN: 'https://pax.test',
    }),
    store: fakeStore(),
  };
  const result = await handleAuthRequest(
    deps,
    request({ path: '/api/auth/google/start' }),
  );

  assert.equal(result.status, 302);
  const location = new URL(result.headers.Location);
  assert.equal(location.origin, 'https://accounts.google.com');
  assert.equal(location.searchParams.get('client_id'), 'client-id');
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(location.searchParams.get('redirect_uri'), 'https://pax.test/api/auth/google/callback');
  assert.ok(location.searchParams.get('code_challenge'));
  assert.equal(location.searchParams.get('client_secret'), null);

  const cookie = result.headers['Set-Cookie'];
  assert.match(cookie, /^pax_oauth=/);
  assert.ok(cookie.includes('HttpOnly'));
  assert.ok(cookie.includes('SameSite=Lax'));
  assert.ok(cookie.includes('Secure'));

  // The challenge is derived from the verifier held in the cookie, not sent.
  const pending = await verifyOAuthToken(
    deps.config.sessionSecret,
    decodeURIComponent(cookie.split(';')[0].split('=')[1]),
  );
  assert.equal(pending.state, location.searchParams.get('state'));
  assert.equal(pending.nonce, location.searchParams.get('nonce'));
  assert.notEqual(pending.codeVerifier, location.searchParams.get('code_challenge'));

  // Without a Google client the route refuses instead of guessing.
  const unconfigured = await handleAuthRequest(
    { config: config(), store: fakeStore() },
    request({ path: '/api/auth/google/start' }),
  );
  assert.equal(unconfigured.headers.Location, '/?error=config');
});

test('the callback refuses anything it cannot prove, and never leaks a session', async () => {
  const googleConfig = config({
    GOOGLE_CLIENT_ID: 'client-id',
    GOOGLE_CLIENT_SECRET: 'client-secret',
    PUBLIC_ORIGIN: 'https://pax.test',
  });
  const start = await handleAuthRequest(
    { config: googleConfig, store: fakeStore() },
    request({ path: '/api/auth/google/start' }),
  );
  const pendingCookie = start.headers['Set-Cookie'].split(';')[0];
  const pending = await verifyOAuthToken(
    googleConfig.sessionSecret,
    decodeURIComponent(pendingCookie.split('=')[1]),
  );

  const callback = (query, cookie, exchange) =>
    handleAuthRequest(
      {
        config: googleConfig,
        store: fakeStore(),
        exchange: exchange ?? (async () => ({ subject: 'g-1', email: 'reader@example.com', name: 'Reader' })),
      },
      request({ path: '/api/auth/google/callback', query: new URLSearchParams(query), cookie }),
    );

  const noSession = result => {
    assert.equal(result.status, 302);
    assert.match(result.headers.Location, /^\/\?error=/);
    const cookies = [result.headers['Set-Cookie']].flat().filter(Boolean).join(' ');
    assert.equal(cookies.includes(`${SESSION_COOKIE}=ey`), false);
  };

  // Google reported a problem.
  noSession(await callback({ error: 'access_denied' }, pendingCookie));
  // No in-flight cookie, or one that cannot be verified.
  noSession(await callback({ code: 'c', state: pending.state }, undefined));
  noSession(await callback({ code: 'c', state: pending.state }, `${OAUTH_COOKIE}=forged`));
  // State does not match the cookie: a cross-site attempt.
  noSession(await callback({ code: 'c', state: 'different' }, pendingCookie));
  // Missing code.
  noSession(await callback({ state: pending.state }, pendingCookie));
  // Google verification failed.
  noSession(
    await callback({ code: 'c', state: pending.state }, pendingCookie, async () => {
      throw new Error('bad token');
    }),
  );
  // Verified, but not on the allowlist.
  noSession(
    await callback({ code: 'c', state: pending.state }, pendingCookie, async () => ({
      subject: 'g-2',
      email: 'stranger@example.com',
      name: 'Stranger',
    })),
  );
});

test('a verified, allowed account receives a locked-down session cookie', async () => {
  const googleConfig = config({
    GOOGLE_CLIENT_ID: 'client-id',
    GOOGLE_CLIENT_SECRET: 'client-secret',
    PUBLIC_ORIGIN: 'https://pax.test',
  });
  const store = fakeStore();
  const start = await handleAuthRequest(
    { config: googleConfig, store },
    request({ path: '/api/auth/google/start' }),
  );
  const pendingCookie = start.headers['Set-Cookie'].split(';')[0];
  const pending = await verifyOAuthToken(
    googleConfig.sessionSecret,
    decodeURIComponent(pendingCookie.split('=')[1]),
  );

  const result = await handleAuthRequest(
    {
      config: googleConfig,
      store,
      exchange: async (client, options) => {
        assert.equal(client.clientId, 'client-id');
        assert.equal(options.nonce, pending.nonce);
        assert.equal(options.codeVerifier, pending.codeVerifier);
        assert.equal(options.redirectUri, 'https://pax.test/api/auth/google/callback');
        return { subject: 'google-42', email: 'reader@example.com', name: 'Reader' };
      },
    },
    request({
      path: '/api/auth/google/callback',
      query: new URLSearchParams({ code: 'the-code', state: pending.state }),
      cookie: pendingCookie,
    }),
  );

  assert.equal(result.status, 302);
  assert.equal(result.headers.Location, '/');

  const cookies = [result.headers['Set-Cookie']].flat();
  const session = cookies.find(value => value.startsWith(`${SESSION_COOKIE}=`));
  assert.ok(session);
  assert.ok(session.includes('HttpOnly'));
  assert.ok(session.includes('SameSite=Lax'));
  assert.ok(session.includes('Secure'));
  // The in-flight cookie is cleared so a code cannot be replayed.
  assert.ok(cookies.some(value => value.startsWith(`${OAUTH_COOKIE}=`) && value.includes('Max-Age=0')));

  // The user was recorded and the token names the session that was created.
  const [user] = [...store.users.values()];
  assert.equal(user.googleSubject, 'google-42');
  assert.equal(user.email, 'reader@example.com');
  assert.equal(store.calls.created.length, 1);

  const token = decodeURIComponent(session.split(';')[0].split('=')[1]);
  const claims = await verifySessionToken(googleConfig.sessionSecret, token);
  assert.equal(claims.userId, user._id);
  assert.equal(claims.sessionId, store.calls.created[0]);
  // No personal detail travels in the token.
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  assert.equal(payload.email, undefined);
  assert.equal(payload.name, undefined);
});

test('the redirect URI ignores the request host entirely', async () => {
  const deps = {
    config: config({
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'client-secret',
      PUBLIC_ORIGIN: 'https://pax.example',
    }),
    store: fakeStore(),
  };

  // A forged Host must not change where Google is asked to send the code.
  for (const requestOrigin of ['https://attacker.test', 'http://127.0.0.1:5173', 'https://pax.example']) {
    const result = await handleAuthRequest(
      deps,
      request({ path: '/api/auth/google/start', requestOrigin }),
    );
    const location = new URL(result.headers.Location);
    assert.equal(
      location.searchParams.get('redirect_uri'),
      'https://pax.example/api/auth/google/callback',
      requestOrigin,
    );
  }
});

test('sign-in refuses to start when no origin is pinned', async () => {
  // Reachable only if configuration is bypassed, so it is checked defensively.
  const unpinned = { ...config(), google: { clientId: 'id', clientSecret: 'secret' } };
  const start = await handleAuthRequest(
    { config: unpinned, store: fakeStore() },
    request({ path: '/api/auth/google/start' }),
  );
  assert.equal(start.headers.Location, '/?error=config');

  const callback = await handleAuthRequest(
    { config: unpinned, store: fakeStore() },
    request({
      path: '/api/auth/google/callback',
      query: new URLSearchParams({ code: 'c', state: 's' }),
    }),
  );
  assert.equal(callback.headers.Location, '/?error=config');
});
