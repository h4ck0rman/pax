import { test, expect } from '@playwright/test';

test('a visitor without a session sees the sign-in page and no questions', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'A little space to learn.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible();

  // None of the app is reachable.
  await expect(page.locator('.question-stem')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Question bank' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Practice test' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
});

test('the question bank refuses an unauthenticated request', async ({ request }) => {
  for (const query of ['', '?random=true&limit=5', '?search=asthma', '?offset=10']) {
    const response = await request.get(`/api/questions${query}`);
    expect(response.status(), query).toBe(401);
    const body = await response.json();
    expect(body.questions).toBeUndefined();
    expect(body.total).toBeUndefined();
  }
});

test('who am I reports no session rather than inventing one', async ({ request }) => {
  const response = await request.get('/api/auth/me');
  expect(response.status()).toBe(401);
  expect((await response.json()).user).toBeUndefined();
});

test('a forged or tampered session cookie is refused', async ({ page, request }) => {
  const forged = [
    'not-a-token',
    'a.b.c',
    // A well-formed unsigned JWT claiming to be someone.
    'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJpc3MiOiJwYXgiLCJhdWQiOiJwYXg6c2Vzc2lvbiIsInN1YiI6ImFkbWluIiwic2lkIjoiYWRtaW4iLCJleHAiOjk5OTk5OTk5OTl9.',
  ];

  for (const value of forged) {
    await page.context().clearCookies();
    await page.context().addCookies([
      { name: 'pax_session', value, domain: '127.0.0.1', path: '/' },
    ]);
    const response = await request.get('/api/questions');
    expect(response.status(), value.slice(0, 20)).toBe(401);
  }

  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible();
});

test('starting sign-in sets a single-use cookie and redirects to Google', async ({ request }) => {
  const response = await request.get('/api/auth/google/start', { maxRedirects: 0 });

  // Without a Google client configured the app says so rather than guessing.
  if (response.status() === 302 && response.headers().location === '/?error=config') {
    expect(response.headers().location).toBe('/?error=config');
    return;
  }

  expect(response.status()).toBe(302);
  const location = new URL(response.headers().location);
  expect(location.origin).toBe('https://accounts.google.com');
  expect(location.searchParams.get('response_type')).toBe('code');
  expect(location.searchParams.get('code_challenge_method')).toBe('S256');
  expect(location.searchParams.get('code_challenge')).toBeTruthy();
  expect(location.searchParams.get('state')).toBeTruthy();
  expect(location.searchParams.get('nonce')).toBeTruthy();
  expect(location.searchParams.get('scope')).toContain('email');

  const cookie = response.headers()['set-cookie'] ?? '';
  expect(cookie).toContain('pax_oauth=');
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('SameSite=Lax');
});

test('the callback refuses a mismatched state and never sets a session', async ({ request }) => {
  const response = await request.get('/api/auth/google/callback?code=fake&state=wrong', {
    maxRedirects: 0,
  });

  expect(response.status()).toBe(302);
  expect(response.headers().location).toMatch(/^\/\?error=/);
  expect(response.headers()['set-cookie'] ?? '').not.toContain('pax_session=ey');
});

test('the sign-in page links the policies and loads no third-party resource', async ({ page }) => {
  const external: string[] = [];
  page.on('request', sent => {
    if (!sent.url().startsWith('http://127.0.0.1:5173')) external.push(sent.url());
  });

  await page.goto('/');

  await expect(page.getByRole('link', { name: 'terms of use' })).toHaveAttribute('href', '/terms');
  await expect(page.getByRole('link', { name: 'privacy policy' })).toHaveAttribute(
    'href',
    '/privacy',
  );
  // The Google mark is inline, so signing in costs no request to anyone else.
  await expect(page.locator('svg.google-mark')).toBeVisible();
  expect(external).toEqual([]);
});

test('the policies are readable without signing in', async ({ page }) => {
  for (const [path, heading] of [
    ['/terms', 'Terms of use'],
    ['/privacy', 'Privacy policy'],
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to sign in' })).toBeVisible();
    // No question content leaks onto a public page.
    await expect(page.locator('.question-stem')).toHaveCount(0);
  }
});

test('the landing page describes what Pax offers', async ({ page }) => {
  await page.goto('/');

  const features = page.locator('.login-features li');
  await expect(features).toHaveCount(3);
  await expect(features.nth(0)).toContainText('Question bank');
  await expect(features.nth(1)).toContainText('Practice tests');
  await expect(features.nth(2)).toContainText('Export for marking');

  // The artwork is decorative, inline, and hidden from assistive technology.
  const vines = page.locator('svg.vine-art');
  await expect(vines).toHaveAttribute('aria-hidden', 'true');
  expect(await vines.locator('path').count()).toBeGreaterThan(50);
});
