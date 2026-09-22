import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const bar = (page: Page) => page.locator('.test-bar');
const clock = (page: Page) => page.getByRole('timer');

/** The time alone. The timer element also carries the paused flag. */
async function clockTime(page: Page) {
  const text = (await clock(page).textContent()) ?? '';
  return text.match(/\d+:\d\d/)?.[0] ?? '';
}
const stem = (page: Page) => page.locator('.question-stem');
const next = (page: Page) => page.getByRole('button', { name: 'Next', exact: true });
const back = (page: Page) => page.getByRole('button', { name: 'Back', exact: true });

/** Open the setup screen on a page with a frozen, controllable clock.
 *
 *  The practice test is the only section and the one the app opens on, so this
 *  waits for the setup rather than navigating to it. Clicking the nav here used
 *  to be necessary and now is not: on a narrow screen the section list is behind
 *  a toggle, so the click had to open the menu first for no gain. */
async function openSetup(page: Page) {
  await page.clock.install();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Build your test.' })).toBeVisible();
}

async function startTest(page: Page, questions: string, minutes: string) {
  await page.locator('.setup-field', { hasText: 'Questions' }).locator('select').selectOption(questions);
  await page.locator('.setup-field', { hasText: 'Minutes' }).locator('select').selectOption(minutes);
  await page.getByRole('button', { name: 'Start test' }).click();
  await expect(bar(page)).toBeVisible();
  await expect(stem(page)).toBeVisible();
}

/** Answer every question by choosing its first option, then finish. */
async function answerAll(page: Page, count: number) {
  for (let position = 1; position <= count; position += 1) {
    await expect(page.locator('.test-progress-text')).toContainText(
      `Question ${position} of ${count}`,
    );
    await page.locator('.option').first().click();
    if (position < count) await next(page).click();
  }
  await page.getByRole('button', { name: 'Finish test' }).click();
  await expect(page.getByRole('heading', { name: 'Test complete.' })).toBeVisible();
}

test('the practice test section offers a curated setup', async ({ page }) => {
  await openSetup(page);

  await expect(page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Practice test' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Practice test');
  await expect(page.locator('.setup-pace')).toContainText('10 questions in 15 minutes');

  await page.locator('.setup-field', { hasText: 'Questions' }).locator('select').selectOption('20');
  await page.locator('.setup-field', { hasText: 'Minutes' }).locator('select').selectOption('30');
  await expect(page.locator('.setup-pace')).toContainText('20 questions in 30 minutes');
});

test('starting a test draws the chosen number of questions at random', async ({ page }) => {
  const queries: string[] = [];
  page.on('request', sent => {
    const url = new URL(sent.url());
    if (url.pathname === '/api/questions') queries.push(url.search);
  });

  await openSetup(page);
  await startTest(page, '5', '15');

  const draw = queries.find(query => query.includes('random=true'));
  expect(draw).toBeTruthy();
  expect(draw).toContain('limit=5');
  await expect(page.locator('.test-progress-text')).toContainText('Question 1 of 5');
  await expect(page.locator('.question-count')).toHaveText('of 5');
});

test('the command bar counts down and tracks progress', async ({ page }) => {
  await openSetup(page);
  await startTest(page, '5', '15');

  await expect(clock(page)).toContainText('15:00');
  await expect(bar(page)).toContainText('0 answered');

  await page.clock.fastForward('00:30');
  await expect(clock(page)).toContainText('14:30');

  await page.locator('.option').first().click();
  await expect(bar(page)).toContainText('1 answered');
  const track = page.getByRole('progressbar');
  await expect(track).toHaveAttribute('aria-valuenow', '1');
  await expect(track).toHaveAttribute('aria-valuemax', '5');
});

test('back and next move through the paper, and finish appears only at the end', async ({
  page,
}) => {
  await openSetup(page);
  await startTest(page, '5', '15');

  await expect(back(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Finish test' })).toHaveCount(0);

  const first = await stem(page).textContent();
  await next(page).click();
  await expect(page.locator('.test-progress-text')).toContainText('Question 2 of 5');
  expect(await stem(page).textContent()).not.toBe(first);

  await back(page).click();
  await expect(page.locator('.test-progress-text')).toContainText('Question 1 of 5');
  expect(await stem(page).textContent()).toBe(first);

  for (let step = 0; step < 4; step += 1) await next(page).click();
  await expect(page.locator('.test-progress-text')).toContainText('Question 5 of 5');
  await expect(next(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Finish test' })).toBeVisible();
});

test('answers are kept when moving back and forth', async ({ page }) => {
  await openSetup(page);
  await startTest(page, '5', '15');

  await page.locator('.option').nth(1).click();
  await next(page).click();
  await expect(page.locator('.option[aria-pressed="true"]')).toHaveCount(0);

  await back(page).click();
  await expect(page.locator('.option').nth(1)).toHaveAttribute('aria-pressed', 'true');
});

test('pause stops the clock and hides the question until resumed', async ({ page }) => {
  await openSetup(page);
  await startTest(page, '5', '15');
  await page.clock.fastForward('00:20');

  const before = await clockTime(page);
  await page.getByRole('button', { name: 'Pause' }).click();

  await expect(page.getByRole('heading', { name: 'Paused.' })).toBeVisible();
  await expect(stem(page)).toHaveCount(0);
  await expect(bar(page)).toContainText('Paused');

  // Time passing while paused must not count against the candidate.
  await page.clock.fastForward('02:00');
  expect(await clockTime(page)).toBe(before);

  await page.getByRole('button', { name: 'Resume test' }).click();
  await expect(stem(page)).toBeVisible();
  await page.clock.fastForward('00:10');
  await expect(clock(page)).toContainText('14:30');
});

test('stop ends the sitting and keeps the answers given so far', async ({ page }) => {
  await openSetup(page);
  await startTest(page, '5', '15');

  await page.locator('.option').first().click();
  await page.getByRole('button', { name: 'Stop' }).click();

  await expect(page.getByRole('heading', { name: 'Test complete.' })).toBeVisible();
  await expect(page.locator('.setup-lead')).toContainText('You answered 1 of 5 questions');
  await expect(page.locator('.review-item')).toHaveCount(5);
  await expect(page.locator('.review-blank')).toHaveCount(4);
});

test('running out of time ends the sitting automatically', async ({ page }) => {
  await openSetup(page);
  await startTest(page, '5', '5');

  await page.clock.fastForward('05:00');

  await expect(page.getByRole('heading', { name: 'Time is up.' })).toBeVisible();
  await expect(page.locator('.question-count')).toContainText('Time ran out');
  await expect(bar(page)).toHaveCount(0);
});

test('copy for LLM puts the paper and the answers on the clipboard', async ({ page }) => {
  await openSetup(page);
  await startTest(page, '5', '15');
  await answerAll(page, 5);

  await page.getByRole('button', { name: 'Copy for LLM' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();

  const copied = await page.evaluate(() => navigator.clipboard.readText());

  expect(copied).toContain('# Pax practice test');
  expect(copied).toContain('## Grading request');
  expect(copied).toContain('- Questions: 5');
  expect(copied).toContain('- Time limit: 15 minutes');
  expect(copied).toContain('- Answered: 5 of 5');
  expect(copied.match(/^### Question \d+$/gm)).toHaveLength(5);
  expect(copied.match(/^Candidate answer: /gm)).toHaveLength(5);
  expect(copied).toContain('Source: ');
  // The document asks the grader for the answer rather than asserting one.
  expect(copied).toContain('please give the correct option');
  expect(copied).toContain('no verified answer key');

  const onScreen = await stem(page).count();
  expect(onScreen).toBe(0);

  // Every option of the first question should be listed for the grader.
  const firstStem = (await page.locator('.review-stem').first().textContent()) ?? '';
  expect(copied).toContain(firstStem.replace(/^\s*1\s*/, '').trim().slice(0, 60));
});

test('export test downloads the same document as a Markdown file', async ({ page }) => {
  await openSetup(page);
  await startTest(page, '5', '15');
  await answerAll(page, 5);

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export test' }).click();
  const download = await downloading;

  expect(download.suggestedFilename()).toMatch(/^pax-practice-test-[\dTZ-]+\.md$/);

  const path = await download.path();
  const contents = await readFile(path, 'utf8');
  expect(contents).toContain('# Pax practice test');
  expect(contents).toContain('## Grading request');
  expect(contents.match(/^### Question \d+$/gm)).toHaveLength(5);
  expect(contents.match(/^Candidate answer: [A-E]$/gm)).toHaveLength(5);
});

test('an unanswered question is exported as not answered', async ({ page }) => {
  await openSetup(page);
  await startTest(page, '5', '15');
  await page.locator('.option').first().click();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('heading', { name: 'Test complete.' })).toBeVisible();

  await page.getByRole('button', { name: 'Copy for LLM' }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());

  expect(copied).toContain('- Answered: 1 of 5');
  expect(copied.match(/^Candidate answer: not answered$/gm)).toHaveLength(4);
});

test('new test returns to the setup screen', async ({ page }) => {
  await openSetup(page);
  await startTest(page, '5', '15');
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('heading', { name: 'Test complete.' })).toBeVisible();

  await page.getByRole('button', { name: 'New test' }).click();

  await expect(page.getByRole('heading', { name: 'Build your test.' })).toBeVisible();
  await expect(bar(page)).toHaveCount(0);
});

test('the sitting never claims an answer is correct or gives a score', async ({ page }) => {
  await openSetup(page);
  await startTest(page, '5', '15');
  await answerAll(page, 5);

  await expect(page.locator('.setup-lead')).toContainText('does not mark the paper');
  await expect(page.locator('.setup-lead')).toContainText('no verified answer keys');
  await expect(page.locator('.question-source-line')).toContainText(
    'Nothing above is marked correct',
  );
  // No question carries a correctness marker of any kind.
  await expect(page.locator('[class*="correct"], [data-correct], [aria-invalid]')).toHaveCount(0);
  await expect(page.locator('.review-item')).toHaveCount(5);
});

test('the command bar holds together on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSetup(page);
  await startTest(page, '5', '15');

  await expect(bar(page)).toBeVisible();
  await expect(clock(page)).toContainText('15:00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
