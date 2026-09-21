import { test } from 'node:test';
import assert from 'node:assert/strict';
import middleware, { config } from '../.tools/vercel-tests/middleware.js';
import handler from '../.tools/vercel-tests/api/questions.js';

test('Vercel middleware gates every path and fails closed without a password', () => {
  process.env.APP_PASSWORD = 'test-only-password-long-enough';
  process.env.APP_USERNAME = 'pax';
  assert.equal(config.matcher, '/:path*');
  const auth = `Basic ${Buffer.from(`pax:${process.env.APP_PASSWORD}`).toString('base64')}`;
  for (const path of ['/', '/api/questions', '/assets/app.js', '/fonts/AveriaLibre-Regular.ttf', '/favicon.svg', '/unknown']) {
    for (const method of ['GET', 'HEAD', 'POST']) {
      const denied = middleware(new Request('https://pax.test'+path, { method }));
      assert.equal(denied.status, 401);
      assert.match(denied.headers.get('www-authenticate'), /Basic/);
      const allowed = middleware(new Request('https://pax.test'+path, { method, headers: { authorization: auth } }));
      assert.equal(allowed.headers.get('x-middleware-next'), '1');
      assert.match(allowed.headers.get('cache-control'), /no-store/);
    }
  }
  for (const authorization of ['Basic !!!', 'Bearer abc', `Basic ${Buffer.from('pax:wrong').toString('base64')}`]) assert.equal(middleware(new Request('https://pax.test', { headers: { authorization } })).status,401);
  delete process.env.APP_PASSWORD;
  assert.equal(middleware(new Request('https://pax.test')).status, 503);
});
test('API independently denies unauthenticated requests without touching Atlas', async () => {
  delete process.env.APP_PASSWORD;
  let status; let body;
  const res = { setHeader() {}, status(code) { status = code; return this; }, json(data) { body = data; } };
  await handler({ headers: {}, method: 'GET', url: '/api/questions' }, res);
  assert.equal(status, 401);
  assert.equal(body.error, 'Password required.');
});
