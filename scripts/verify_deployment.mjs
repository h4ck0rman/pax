// Checks a live deployment against the security posture Pax claims: the shell
// and the policies are public, every question path needs a session, and the
// sign-in redirect is correctly formed. Reads no secrets and signs nobody in.
import assert from 'node:assert/strict';

const base = process.argv[2];
if (!base || !base.startsWith('https://')) {
  console.error('Usage: node scripts/verify_deployment.mjs https://your-deployment');
  process.exit(1);
}

const origin = base.replace(/\/$/, '');
const get = (path, init = {}) =>
  fetch(new URL(path, origin), { redirect: 'manual', signal: AbortSignal.timeout(45000), ...init });

const checks = [];
const check = (name, run) => checks.push({ name, run });

check('the shell is public', async () => {
  const response = await get('/');
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<div id="root">/);
  return html;
});

check('the built assets are public and load', async () => {
  const html = await (await get('/')).text();
  const script = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  const style = html.match(/href="(\/assets\/[^"]+\.css)"/)?.[1];
  assert.ok(script, 'no built script in the shell');
  assert.ok(style, 'no stylesheet in the shell');
  assert.equal((await get(script)).status, 200);
  assert.equal((await get(style)).status, 200);
});

check('the public pages are readable without signing in', async () => {
  for (const path of ['/login', '/terms', '/privacy']) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), /<div id="root">/);
  }
});

check('question data is closed to anyone without a session', async () => {
  for (const path of [
    '/api/questions',
    '/api/questions?random=true&limit=50',
    '/api/questions?search=asthma',
  ]) {
    const response = await get(path);
    assert.equal(response.status, 401, `${path} -> ${response.status}`);
    const body = await response.json().catch(() => ({}));
    assert.equal(body.questions, undefined, 'questions leaked in an unauthenticated response');
    assert.equal(body.total, undefined, 'a count leaked in an unauthenticated response');
  }
});

check('a forged session cookie is refused', async () => {
  const unsigned =
    'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.' +
    Buffer.from(
      JSON.stringify({ iss: 'pax', aud: 'pax:session', sub: 'admin', sid: 'x', exp: 9999999999 }),
    ).toString('base64url') +
    '.';

  for (const value of ['nonsense', 'a.b.c', unsigned]) {
    const response = await get('/api/questions', { headers: { cookie: `pax_session=${value}` } });
    assert.equal(response.status, 401, value.slice(0, 16));
  }
});

check('who am I reports no session', async () => {
  const response = await get('/api/auth/me');
  assert.equal(response.status, 401);
  assert.equal((await response.json()).user, undefined);
});

check('sign-in redirects to Google with PKCE and a state cookie', async () => {
  const response = await get('/api/auth/google/start');
  assert.equal(response.status, 302);

  const location = response.headers.get('location') ?? '';
  if (location === '/login?error=config') {
    throw new Error('Google sign-in is not configured on this deployment');
  }

  const url = new URL(location);
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(url.searchParams.get('state'), 'no state');
  assert.ok(url.searchParams.get('nonce'), 'no nonce');

  // The redirect URI must be this deployment, not whatever host was requested.
  assert.equal(url.searchParams.get('redirect_uri'), `${origin}/api/auth/google/callback`);

  const cookie = response.headers.get('set-cookie') ?? '';
  assert.match(cookie, /pax_oauth=/);
  for (const flag of ['HttpOnly', 'SameSite=Lax', 'Secure']) {
    assert.ok(cookie.includes(flag), `the in-flight cookie is missing ${flag}`);
  }
});

check('the callback refuses a mismatched state', async () => {
  const response = await get('/api/auth/google/callback?code=fake&state=wrong');
  assert.equal(response.status, 302);
  // A failed sign-in goes back to the page that holds the button.
  assert.match(response.headers.get('location') ?? '', /^\/login\?error=/);
  assert.equal((response.headers.get('set-cookie') ?? '').includes('pax_session=ey'), false);
});

check('responses are private and carry the security headers', async () => {
  const response = await get('/');
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'none'/);
});

let failed = 0;
for (const { name, run } of checks) {
  try {
    await run();
    console.log(`  pass  ${name}`);
  } catch (cause) {
    failed += 1;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${cause instanceof Error ? cause.message.split('\n')[0] : cause}`);
  }
}

console.log();
if (failed) {
  console.error(`${failed} of ${checks.length} checks failed against ${origin}.`);
  process.exit(1);
}
console.log(`All ${checks.length} checks passed against ${origin}.`);
console.log('Signing in with an allowlisted Google account still needs a browser.');
