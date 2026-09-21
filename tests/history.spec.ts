import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

/** Opens the section, coping with the nav collapsing on a narrow screen. */
const openPracticeTest = async (page: Page) => {
  await page.goto('/');
  // Wait for the shell, or the toggle check runs before the nav exists.
  await expect(page.locator('.app-sections')).toBeVisible();
  const toggle = page.locator('.sections-toggle');
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('button', { name: 'Practice test' }).click();
  await expect(page.getByRole('heading', { name: 'Build your test.' })).toBeVisible();
};

/** Waits for the table to finish loading, then reports how many rows it has.
 *  The table fetches after mounting, so counting straight away finds nothing. */
async function historyRows(page: Page) {
  const rows = page.locator('.history-table tbody tr');
  await expect(page.locator('.history-table, .history-note')).not.toHaveCount(0);
  await page.waitForFunction(
    () => !document.querySelector('.history-note[role="status"]'),
    undefined,
    { timeout: 10_000 },
  );
  return { rows, count: await rows.count() };
}

/** Sits a whole paper, answering every question, and finishes it. */
async function sitTest(page: Page, questions: string) {
  await page.locator('.setup-field', { hasText: 'Questions' }).locator('select').selectOption(questions);
  await page.getByRole('button', { name: 'Start test' }).click();
  await expect(page.locator('.test-bar')).toBeVisible();

  const count = Number(questions);
  for (let position = 1; position <= count; position += 1) {
    await page.locator('.option').first().click();
    if (position < count) await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Finish test' }).click();
  await expect(page.getByRole('heading', { name: 'Test complete.' })).toBeVisible();
}

test('past tests sit under the start control, after a divider', async ({ page }) => {
  await openPracticeTest(page);

  const history = page.locator('.history');
  await expect(history).toBeVisible();
  await expect(history.getByRole('heading', { name: 'Past tests' })).toBeVisible();

  // Below the start control, not above it.
  const geometry = await page.evaluate(() => ({
    start: document.querySelector('.nav-commit')!.getBoundingClientRect().bottom,
    history: document.querySelector('.history')!.getBoundingClientRect().top,
    border: getComputedStyle(document.querySelector('.history')!).borderTopWidth,
  }));
  expect(geometry.history).toBeGreaterThanOrEqual(geometry.start);
  expect(geometry.border).not.toBe('0px');

  // The replaced note is gone from the setup screen.
  await expect(page.locator('.question-box')).not.toContainText('so Pax does not score a test');
});

test('a finished test is kept and appears in the table', async ({ page }) => {
  await openPracticeTest(page);
  await sitTest(page, '5');

  // Back to setup, where the sitting should now be listed.
  await page.getByRole('button', { name: 'New test' }).click();
  await expect(page.getByRole('heading', { name: 'Build your test.' })).toBeVisible();

  const { rows, count } = await historyRows(page);
  expect(count).toBeGreaterThan(0);
  const newest = rows.first();
  await expect(newest).toContainText('5');
  await expect(page.locator('.history')).not.toContainText('Nothing yet');
});

test('opening a past test shows every option with the chosen one marked', async ({ page }) => {
  await openPracticeTest(page);
  await sitTest(page, '5');
  await page.getByRole('button', { name: 'New test' }).click();

  const newest = page.locator('.history-table tbody tr').first();
  const questionCount = Number((await newest.locator('.history-number').first().textContent()) ?? '0');
  await newest.locator('.history-open').click();

  // Every question, every option, and exactly one chosen per question.
  await expect(page.locator('.review-item')).toHaveCount(questionCount);
  const options = page.locator('.review-option');
  expect(await options.count()).toBeGreaterThan(questionCount);
  await expect(page.locator('.review-option.is-chosen')).toHaveCount(questionCount);
  await expect(page.locator('.review-option-mark').first()).toContainText('Your answer');

  // Unselected options are shown, and nothing claims to be correct.
  expect(await page.locator('.review-option:not(.is-chosen)').count()).toBeGreaterThan(0);
  await expect(page.locator('.question-source-line')).toContainText('Nothing above is marked correct');

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Build your test.' })).toBeVisible();
});

test('a past test can be copied and exported like a fresh one', async ({ page }) => {
  await openPracticeTest(page);
  await sitTest(page, '5');
  await page.getByRole('button', { name: 'New test' }).click();
  await page.locator('.history-table tbody tr').first().locator('.history-open').click();
  await expect(page.locator('.review-item').first()).toBeVisible();

  await page.getByRole('button', { name: 'Copy for LLM' }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('# Pax practice test');
  expect(copied).toContain('## Grading request');
  expect(copied.match(/^### Question \d+$/gm)).toHaveLength(5);
  expect(copied.match(/^Candidate answer: [A-E]$/gm)).toHaveLength(5);

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export test' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^pax-practice-test-[\dTZ-]+\.md$/);
  const contents = await readFile(await download.path(), 'utf8');
  expect(contents).toContain('# Pax practice test');
});

test('an unanswered question is kept as unanswered', async ({ page }) => {
  await openPracticeTest(page);
  await page.locator('.setup-field', { hasText: 'Questions' }).locator('select').selectOption('5');
  await page.getByRole('button', { name: 'Start test' }).click();
  await expect(page.locator('.test-bar')).toBeVisible();

  // Answer only the first, then stop.
  await page.locator('.option').first().click();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('heading', { name: 'Test complete.' })).toBeVisible();

  await page.getByRole('button', { name: 'New test' }).click();
  await page.locator('.history-table tbody tr').first().locator('.history-open').click();

  await expect(page.locator('.review-option.is-chosen')).toHaveCount(1);
  await expect(page.locator('.review-blank')).toHaveCount(4);
});

test('the table is readable on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await openPracticeTest(page);

  const { rows, count } = await historyRows(page);
  expect(count, 'seed a sitting first').toBeGreaterThan(0);

  // Column headings are hidden, the chevron is dropped, and nothing overflows.
  await expect(page.locator('.history-table thead')).toBeHidden();
  await expect(page.locator('.history-chevron').first()).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  // The figures read as a phrase rather than as stranded label and value pairs.
  const label = await rows
    .first()
    .locator('.history-number')
    .first()
    .evaluate(node => getComputedStyle(node, '::after').content);
  expect(label).toContain('questions');
});

test('the table bands alternate rows', async ({ page }) => {
  await openPracticeTest(page);
  const { rows, count } = await historyRows(page);
  expect(count, 'needs at least two sittings').toBeGreaterThanOrEqual(2);

  const shades = await rows.evaluateAll(nodes =>
    nodes.slice(0, 2).map(node => getComputedStyle(node).backgroundColor),
  );
  expect(shades[0]).not.toBe(shades[1]);
});
