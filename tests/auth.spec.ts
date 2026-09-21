import { test, expect } from '@playwright/test';
/** Sign out is behind the account bubble now, so it takes two steps. */
async function signOut(page: import('@playwright/test').Page) {
  await page.locator('.account-bubble').click();
  await page.getByRole('button', { name: 'Sign out' }).click();
}


test('a signed-in reader sees their account and the app', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Question bank' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Practice test' })).toBeVisible();
  await expect(page.locator('.account-bubble')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue with Google' })).toHaveCount(0);
  await expect(page.locator('.question-stem')).toBeVisible();
});

test('who am I returns the signed-in account and no secrets', async ({ request }) => {
  const response = await request.get('/api/auth/me');
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.user.email).toContain('@');
  expect(body.user.id).toBeTruthy();
  // Only what the interface needs, never internals.
  expect(Object.keys(body.user).sort()).toEqual(['email', 'id', 'name']);
  expect(JSON.stringify(body)).not.toContain('googleSubject');
});

test('the session survives a reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.question-stem')).toBeVisible();

  await page.reload();
  await expect(page.locator('.account-bubble')).toBeVisible();
  await expect(page.locator('.question-stem')).toBeVisible();
});

/** Signing out revokes a session record, so these tests mint their own rather
 *  than revoking the one shared by every other signed-in spec. */
async function ownSession(page: import('@playwright/test').Page) {
  const response = await page.request.post('/api/auth/dev-sign-in');
  expect(response.status()).toBe(200);
  await page.goto('/');
  await expect(page.locator('.account-bubble')).toBeVisible();
}

test('signing out ends the session for the API as well as the page', async ({ page }) => {
  await ownSession(page);
  await expect(page.locator('.question-stem')).toBeVisible();
  expect((await page.request.get('/api/questions')).status()).toBe(200);

  await signOut(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Good Luck Harpreet' })).toBeVisible();

  expect((await page.request.get('/api/questions')).status()).toBe(401);
  expect((await page.request.get('/api/auth/me')).status()).toBe(401);

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Good Luck Harpreet' })).toBeVisible();
});

test('a revoked session cannot be replayed with the original cookie', async ({ page }) => {
  await ownSession(page);

  const session = (await page.context().cookies()).find(cookie => cookie.name === 'pax_session');
  expect(session).toBeTruthy();

  await signOut(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Good Luck Harpreet' })).toBeVisible();

  // Put the original cookie back. Its signature is still valid, so only the
  // server-side session record stands between a stolen cookie and the data.
  await page.context().addCookies([session!]);
  expect((await page.request.get('/api/questions')).status()).toBe(401);
  expect((await page.request.get('/api/auth/me')).status()).toBe(401);
});

test('the session cookie is not readable by scripts', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.question-stem')).toBeVisible();

  const visible = await page.evaluate(() => document.cookie);
  expect(visible).not.toContain('pax_session');

  const cookies = await page.context().cookies();
  const session = cookies.find(cookie => cookie.name === 'pax_session');
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe('Lax');
});

test('the practice test still works for a signed-in reader', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Practice test' }).click();
  await expect(page.getByRole('heading', { name: 'Build your test.' })).toBeVisible();

  await page.locator('.setup-field', { hasText: 'Questions' }).locator('select').selectOption('5');
  await page.getByRole('button', { name: 'Start test' }).click();

  await expect(page.locator('.test-bar')).toBeVisible();
  await expect(page.locator('.question-stem')).toBeVisible();
});

test('the account bubble opens onto who is signed in', async ({ page }) => {
  await page.goto('/');

  const bubble = page.locator('.account-bubble');
  await expect(bubble).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeHidden();

  await bubble.click();

  await expect(bubble).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.account-email')).toContainText('@');
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

  // Escape closes it, as a menu should.
  await page.keyboard.press('Escape');
  await expect(bubble).toHaveAttribute('aria-expanded', 'false');
});
