import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProductionServer } from '../dist-server/production.js';
import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';

const password = 'test-only-long-password-123';
const authorization = `Basic ${Buffer.from(`pax:${password}`).toString('base64')}`;
test('all pages, API and static assets require authentication', async () => {
  let calls = 0;
  const server = createProductionServer({ password, dist: resolve('dist'), store: { async query() { calls++; return { total: 1, questions: [] }; } } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const asset = `/assets/${readdirSync('dist/assets').find(f => f.endsWith('.js'))}`;
    for (const path of ['/', '/index.html', '/api/questions', asset, '/fonts/AveriaLibre-Regular.ttf', '/favicon.svg', '/.env', '/unknown']) {
      for (const method of ['GET', 'HEAD', 'POST']) {
        const response = await fetch(base + path, { method });
        assert.equal(response.status, 401, `${method} ${path}`);
        assert.match(response.headers.get('www-authenticate'), /Basic realm="Pax"/);
        assert.match(response.headers.get('cache-control'), /no-store/);
      }
    }
    assert.equal(calls, 0);
    for (const bad of ['Basic !!!', 'Bearer foo', `Basic ${Buffer.from('pax:wrong').toString('base64')}`, `Basic ${Buffer.from(`other:${password}`).toString('base64')}`]) {
      assert.equal((await fetch(base + '/', { headers: { authorization: bad } })).status, 401);
    }
    const headers = { authorization };
    const html = await fetch(base + '/', { headers });
    assert.equal(html.status, 200);
    assert.match(await html.text(), /<div id="root">/);
    assert.equal((await fetch(base + asset, { headers })).status, 200);
    assert.equal((await fetch(base + '/api/questions', { headers })).status, 200);
    assert.equal(calls, 1);
    for (const path of ['/.env', '/server/start.ts', '/data/extraction/questions.sqlite', '/%2e%2e/.env', '/api/questions?limit=100000', '/api/questions?offset=-1']) {
      assert.ok([400, 404].includes((await fetch(base + path, { headers })).status), path);
    }
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
test('missing or weak password fails closed', () => {
  for (const password of ['', 'short']) assert.throws(() => createProductionServer({ password, dist: resolve('dist'), store: { async query() { return {}; } } }), /APP_PASSWORD/);
});
