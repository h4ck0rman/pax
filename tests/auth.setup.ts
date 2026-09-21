import { test as setup, expect } from '@playwright/test';
import { SESSION_STATE } from '../playwright.config';

/** Signs in through the development shim in vite.config.ts, which mints a real
 *  session without Google, and saves the cookie for the signed-in project. */
setup('mint a session', async ({ page }) => {
  // page.request shares the browser context's cookie jar, so the session cookie
  // is captured by storageState below.
  const response = await page.request.post('/api/auth/dev-sign-in');
  expect(
    response.status(),
    'dev sign-in is unavailable: set DEV_AUTH_EMAIL in .env and list it in ALLOWED_EMAILS',
  ).toBe(200);

  const body = await response.json();
  expect(body.user.email).toBeTruthy();

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

  await page.context().storageState({ path: SESSION_STATE });
});
