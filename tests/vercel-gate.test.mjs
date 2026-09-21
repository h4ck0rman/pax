import { test } from 'node:test';
import assert from 'node:assert/strict';

import middleware, { config } from '../.tools/vercel-tests/middleware.js';
import { SESSION_COOKIE, signSessionToken } from '../.tools/vercel-tests/server/auth/tokens.js';

const SECRET = 'a-test-only-session-secret-of-sufficient-length';
const secret = new TextEncoder().encode(SECRET);

const PUBLIC_PATHS = ['/', '/index.html', '/terms', '/privacy', '/assets/app.js', '/favicon.svg', '/unknown'];
const PROTECTED_PATHS = ['/api/questions', '/api/questions?random=true', '/api/anything-new'];
const SIGN_IN_PATHS = ['/api/auth/me', '/api/auth/logout', '/api/auth/google/start', '/api/auth/google/callback'];

const call = (path, headers = {}) =>
  middleware(new Request(`https://pax.test${path}`, { headers }));

const passedThrough = response => response.headers.get('x-middleware-next') === '1';

async function validCookie() {
  const token = await signSessionToken(
    secret,
    { userId: 'user-1', sessionId: 'session-1' },
    new Date(Date.now() + 60_000),
  );
  return { cookie: `${SESSION_COOKIE}=${token}` };
}

test('the matcher covers every path', () => {
  assert.equal(config.matcher, '/:path*');
  assert.equal(config.runtime, 'nodejs');
});

test('the shell and the sign-in routes are public', async () => {
  process.env.SESSION_SECRET = SECRET;
  for (const path of [...PUBLIC_PATHS, ...SIGN_IN_PATHS]) {
    const response = await call(path);
    assert.ok(passedThrough(response), `${path} should pass through`);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal(response.headers.get('vary'), 'Cookie');
  }
});

test('other API paths are closed without a usable token', async () => {
  process.env.SESSION_SECRET = SECRET;
  const forged = [
    undefined,
    'nonsense',
    'a.b.c',
    // Unsigned token claiming a session.
    'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.' +
      Buffer.from(
        JSON.stringify({ iss: 'pax', aud: 'pax:session', sub: 'admin', sid: 'x', exp: 9999999999 }),
      ).toString('base64url') +
      '.',
  ];

  for (const path of PROTECTED_PATHS) {
    for (const value of forged) {
      const headers = value === undefined ? {} : { cookie: `${SESSION_COOKIE}=${value}` };
      const response = await call(path, headers);
      assert.equal(response.status, 401, `${path} with ${String(value).slice(0, 12)}`);
      assert.equal(passedThrough(response), false);
      const body = await response.json();
      assert.equal(body.questions, undefined);
    }
  }
});

test('a token signed with another key is refused', async () => {
  process.env.SESSION_SECRET = SECRET;
  const other = await signSessionToken(
    new TextEncoder().encode(`${SECRET}-different`),
    { userId: 'user-1', sessionId: 'session-1' },
    new Date(Date.now() + 60_000),
  );
  const response = await call('/api/questions', { cookie: `${SESSION_COOKIE}=${other}` });
  assert.equal(response.status, 401);
});

test('an expired token is refused', async () => {
  process.env.SESSION_SECRET = SECRET;
  const stale = await signSessionToken(
    secret,
    { userId: 'user-1', sessionId: 'session-1' },
    new Date(Date.now() - 1000),
  );
  const response = await call('/api/questions', { cookie: `${SESSION_COOKIE}=${stale}` });
  assert.equal(response.status, 401);
});

test('a properly signed token reaches the function', async () => {
  process.env.SESSION_SECRET = SECRET;
  const response = await call('/api/questions', await validCookie());
  assert.ok(passedThrough(response));
});

test('a missing or weak secret fails closed', async () => {
  const headers = await validCookie();
  for (const value of [undefined, '', 'too-short']) {
    if (value === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = value;

    const response = await call('/api/questions', headers);
    assert.equal(response.status, 503, `secret: ${String(value)}`);
    assert.equal(passedThrough(response), false);
  }
  process.env.SESSION_SECRET = SECRET;
});

test('the question function authorises independently of the middleware', async () => {
  const previous = { ...process.env };
  process.env.SESSION_SECRET = SECRET;
  process.env.MONGODB_URI = 'mongodb://localhost/pax';
  process.env.ALLOWED_EMAILS = 'reader@example.com';

  const { default: handler } = await import('../.tools/vercel-tests/api/questions.js');

  let status;
  let body;
  const res = {
    setHeader() {},
    status(code) {
      status = code;
      return this;
    },
    json(data) {
      body = data;
    },
  };
  await handler({ headers: {}, method: 'GET', url: '/api/questions' }, res);

  assert.equal(status, 401);
  assert.equal(body.questions, undefined);
  assert.match(body.error, /Sign in/);

  Object.assign(process.env, previous);
});

test('the auth function refuses to run when it is not configured', async () => {
  const previous = { ...process.env };
  delete process.env.SESSION_SECRET;
  delete process.env.ALLOWED_EMAILS;
  delete process.env.ALLOWED_DOMAIN;

  const { default: handler } = await import('../.tools/vercel-tests/api/auth/me.js');

  let status;
  let body;
  const res = {
    setHeader() {},
    status(code) {
      status = code;
      return this;
    },
    json(data) {
      body = data;
    },
    end() {},
  };
  await handler({ headers: { host: 'pax.test' }, method: 'GET', url: '/api/auth/me' }, res);

  assert.equal(status, 503);
  // The browser is never told which setting is missing.
  assert.equal(body.error, 'Sign-in is not configured.');

  Object.assign(process.env, previous);
});

test('the auth function does not let a request header downgrade a cookie', async () => {
  const { toAuthRequest } = await import('../.tools/vercel-tests/server/auth/vercel.js');
  const { readAuthConfig } = await import('../.tools/vercel-tests/server/auth/config.js');

  const httpsConfig = readAuthConfig({
    SESSION_SECRET: SECRET,
    MONGODB_URI: 'mongodb://localhost/pax',
    ALLOWED_EMAILS: 'reader@example.com',
    PUBLIC_ORIGIN: 'https://pax.test',
  });

  const req = (headers) => ({ headers: { host: 'pax.test', ...headers }, method: 'GET', url: '/api/auth/me' });

  // Configuration wins, so a forged header cannot drop Secure.
  for (const proto of ['http', 'http,https', 'https,http', undefined]) {
    const headers = proto === undefined ? {} : { 'x-forwarded-proto': proto };
    assert.equal(toAuthRequest(req(headers), httpsConfig).secure, true, String(proto));
  }

  // With nothing pinned, the LAST forwarded value is used: proxies append, so
  // the last entry is the nearest proxy's and the first is the client's.
  const unpinned = readAuthConfig({
    SESSION_SECRET: SECRET,
    MONGODB_URI: 'mongodb://localhost/pax',
    ALLOWED_EMAILS: 'reader@example.com',
  });
  assert.equal(toAuthRequest(req({ 'x-forwarded-proto': 'http,https' }), unpinned).secure, true);
  assert.equal(toAuthRequest(req({ 'x-forwarded-proto': 'https,http' }), unpinned).secure, false);

  // A loopback host is insecure whatever port it carries; anything else is not.
  assert.equal(toAuthRequest({ headers: { host: 'localhost:3000' }, method: 'GET', url: '/' }, unpinned).secure, false);
  assert.equal(toAuthRequest({ headers: { host: '127.0.0.1:5173' }, method: 'GET', url: '/' }, unpinned).secure, false);
  assert.equal(toAuthRequest({ headers: { host: 'pax.test' }, method: 'GET', url: '/' }, unpinned).secure, true);
});

test('every auth route file resolves to the shared adapter', async () => {
  const shared = (await import('../.tools/vercel-tests/server/auth/vercel.js')).default;
  for (const route of ['auth/me', 'auth/logout', 'auth/google/start', 'auth/google/callback']) {
    const { default: handler } = await import(`../.tools/vercel-tests/api/${route}.js`);
    assert.equal(handler, shared, route);
  }
});
