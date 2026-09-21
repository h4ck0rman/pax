import assert from 'node:assert/strict';
process.loadEnvFile('.env');
const base = process.argv[2];
if (!base || !base.startsWith('https://')) throw new Error('Supply the HTTPS deployment URL');
const headers = { authorization: `Basic ${Buffer.from(`${process.env.APP_USERNAME || 'pax'}:${process.env.APP_PASSWORD}`).toString('base64')}` };
async function get(path, authenticated = false) {
  return fetch(new URL(path, base), { headers: authenticated ? headers : {}, signal: AbortSignal.timeout(45000) });
}
for (const path of ['/', '/api/questions', '/fonts/AveriaLibre-Regular.ttf', '/favicon.svg']) {
  const response = await get(path);
  assert.equal(response.status, 401, `Anonymous ${path}`);
  assert.match(response.headers.get('www-authenticate') || '', /Basic.*Pax/);
}
const html = await get('/', true);
assert.equal(html.status, 200, 'Authenticated homepage');
const body = await html.text();
const asset = body.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1];
assert.ok(asset, 'Built frontend script');
assert.equal((await get(asset)).status, 401, 'Anonymous JS');
assert.equal((await get(asset, true)).status, 200, 'Authenticated JS');
const api = await get('/api/questions', true);
assert.equal(api.status, 200, 'Authenticated Atlas API');
const data = await api.json();
assert.equal(data.total, 5374);
assert.ok(data.questions[0].stem.length > 20);
assert.ok(data.questions[0].options.length >= 4);
console.log('Live deployment verified: anonymous pages, API, fonts and JS blocked; authenticated app and Atlas questions working.');
