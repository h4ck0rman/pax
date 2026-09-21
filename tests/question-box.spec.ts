import { test, expect } from '@playwright/test';

/** Mirrors src/questions/text.ts: source line wraps collapse, blank lines stay. */
const collapse = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map(block => block.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');

test('renders a real question from the database with its options', async ({ page, request }) => {
  const response = await request.get('/api/questions');
  expect(response.ok()).toBeTruthy();
  const firstPage = await response.json();
  expect(firstPage.total).toBeGreaterThan(0);
  const expected = firstPage.questions[0];

  await page.goto('/');

  await expect(page.locator('.question-stem')).toHaveText(collapse(expected.stem));
  await expect(page.locator('.option')).toHaveCount(expected.options.length);
  expect(expected.options.length).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.option-text').first()).toHaveText(collapse(expected.options[0].text));
});

test('labels the question with its number and the size of the bank', async ({ page, request }) => {
  const firstPage = await (await request.get('/api/questions')).json();

  await page.goto('/');

  await expect(page.locator('.question-meta .eyebrow')).toHaveText('Question 1');
  await expect(page.locator('.question-count')).toHaveText(
    `${firstPage.total.toLocaleString('en-US')} in the bank`,
  );
});

test('collapses source line wraps so the stem reflows', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.question-stem')).toBeVisible();

  const stem = await page.locator('.question-stem').evaluate(node => node.textContent ?? '');
  expect(stem).not.toMatch(/\n/);
});

test('records one selection at a time and never marks an answer correct', async ({ page }) => {
  await page.goto('/');
  const options = page.locator('.option');
  await expect(options.first()).toBeVisible();

  for (const option of await options.all()) {
    await expect(option).toHaveAttribute('aria-pressed', 'false');
  }

  await options.first().click();
  await expect(options.first()).toHaveAttribute('aria-pressed', 'true');

  await options.nth(1).click();
  await expect(options.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(options.first()).toHaveAttribute('aria-pressed', 'false');

  await options.nth(1).click();
  await expect(options.nth(1)).toHaveAttribute('aria-pressed', 'false');

  await expect(page.locator('.question-box')).not.toContainText(/correct answer/i);
  await expect(page.locator('.question-box')).not.toContainText(/score/i);
});

test('names the source and marks the question unreviewed', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.question-stem')).toBeVisible();
  await expect(page.locator('.question-source')).toContainText('Extracted, not yet reviewed');
});

test('the card sits on cream and the question sits on white', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.question-box')).toBeVisible();

  const colours = await page.evaluate(() => ({
    body: getComputedStyle(document.body).backgroundColor,
    card: getComputedStyle(document.querySelector('.question-box')!).backgroundColor,
  }));
  expect(colours.body).toBe('rgb(240, 235, 214)');
  expect(colours.card).toBe('rgb(255, 255, 255)');
});

test('a database failure shows an alert and recovers on retry', async ({ page }) => {
  // A flag, not a call counter: StrictMode runs the effect twice in development.
  let failing = true;
  await page.route('**/api/questions*', async route => {
    if (failing) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'The question database is temporarily unavailable.' }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable');

  failing = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.question-stem')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('the question box fits a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.locator('.question-stem')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
