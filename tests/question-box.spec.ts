import { test, expect, type Page } from '@playwright/test';

/** QuestionBox is shared: the practice test is the one feature that renders it,
 *  so these drive a real sitting rather than a browse mode. */

/** Mirrors src/questions/text.ts: source line wraps collapse, blank lines stay. */
const collapse = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map(block => block.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');

type Drawn = { id: string; stem: string; options: { label: string; text: string }[] };

/** Starts a sitting and hands back the questions the server actually drew, so an
 *  assertion can be made against real database content without guessing which
 *  random questions came back. */
async function startTest(page: Page, questions = '5'): Promise<Drawn[]> {
  const drawn: Drawn[] = [];
  page.on('response', async response => {
    const url = new URL(response.url());
    if (url.pathname !== '/api/questions' || !response.ok()) return;
    const body = await response.json().catch(() => null);
    if (body?.questions) drawn.push(...body.questions);
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Build your test.' })).toBeVisible();
  await page.locator('.setup-field', { hasText: 'Questions' }).locator('select').selectOption(questions);
  await page.getByRole('button', { name: 'Start test' }).click();
  await expect(page.locator('.question-stem')).toBeVisible();
  return drawn;
}

test('renders a real question from the database with its options', async ({ page }) => {
  const drawn = await startTest(page);
  expect(drawn.length).toBeGreaterThan(0);
  const first = drawn[0];

  await expect(page.locator('.question-stem')).toHaveText(collapse(first.stem));
  await expect(page.locator('.option')).toHaveCount(first.options.length);
  expect(first.options.length).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.option-text').first()).toHaveText(collapse(first.options[0].text));
});

test('labels the question with its number and the length of the paper', async ({ page }) => {
  await startTest(page, '5');

  await expect(page.locator('.question-meta .eyebrow')).toHaveText('Question 1');
  await expect(page.locator('.question-count')).toHaveText('of 5');
});

test('collapses source line wraps so the stem reflows', async ({ page }) => {
  await startTest(page);

  const stem = await page.locator('.question-stem').evaluate(node => node.textContent ?? '');
  expect(stem).not.toMatch(/\n/);
});

test('records one selection at a time and never marks an answer correct', async ({ page }) => {
  await startTest(page);
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

  // Stems legitimately contain "score" and "incorrect", so assert on Pax's own
  // copy and on the absence of marking, never on the whole card.
  await expect(page.locator('.question-box')).not.toContainText(/correct answer/i);
  await expect(page.locator('.option-mark svg')).toHaveCount(0);
});

test('names the source and marks the question unreviewed', async ({ page }) => {
  await startTest(page);
  await expect(page.locator('.question-source')).toContainText('Extracted, not yet reviewed');
});

test('the card sits on cream and the question sits on white', async ({ page }) => {
  await startTest(page);

  const colours = await page.evaluate(() => ({
    body: getComputedStyle(document.body).backgroundColor,
    card: getComputedStyle(document.querySelector('.question-box')!).backgroundColor,
  }));
  expect(colours.body).toBe('rgb(240, 235, 214)');
  expect(colours.card).toBe('rgb(255, 255, 255)');
});

test('a failed draw is reported on the setup screen and recovers on retry', async ({ page }) => {
  // A flag, not a call counter: StrictMode runs effects twice in development.
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
  await page.getByRole('button', { name: 'Start test' }).click();
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable');

  failing = false;
  await page.getByRole('button', { name: 'Start test' }).click();
  await expect(page.locator('.question-stem')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('the question box fits a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startTest(page);

  await expect(page.locator('.question-stem')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
