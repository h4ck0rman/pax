import { test, expect } from '@playwright/test';

test('reads database questions, retains selections and searches', async ({ page, request }) => {
  const response = await request.get('/api/questions');
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(data.total).toBeGreaterThan(0);
  await page.goto('/');
  await expect(page.locator('.question h2')).toHaveText(data.questions[0].stem);
  await expect(page.locator('nav button')).toHaveCount(2);
  await page.locator('.option').first().click();
  await expect(page.locator('.option').first()).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Next question' }).click();
  await expect(page.locator('.question-tag')).toHaveText('QUESTION 2');
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(page.locator('.option').first()).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Search questions').fill('zzzz_no_question_match');
  await expect(page.getByRole('heading', { name: 'No matching questions.' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.locator('.question h2')).toHaveText(data.questions[0].stem);
});

test('real timed exam records selections without fabricated scores', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Practice exams' }).click();
  await page.getByRole('combobox', { name: /^Questions/ }).selectOption('5');
  await page.getByRole('button', { name: 'Start practice' }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  for (let i = 0; i < 5; i++) {
    await expect(page.locator('.question-tag')).toHaveText(`QUESTION ${i + 1}`);
    await page.locator('.option').first().click();
    await page.getByRole('button', { name: i === 4 ? 'Finish' : 'Next question', exact: true }).click();
  }
  await expect(page.getByText('You answered 5 of 5 questions.')).toBeVisible();
  await expect(page.getByText('No score is calculated:', { exact: false })).toBeVisible();
});

test('timer expires and layout stays within mobile viewport', async ({ page }) => {
  await page.clock.install();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.question h2')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/pax-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Practice exams' }).click();
  await page.getByLabel('Minutes').selectOption('5');
  await page.getByRole('button', { name: 'Start practice' }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  await page.clock.fastForward(301000);
  await expect(page.getByRole('heading', { name: 'Session complete.' })).toBeVisible();
});

test('desktop fonts load and database failures are visible', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('.question h2')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('700 48px "Averia Libre"'))).toBeTruthy();
  await page.screenshot({ path: 'test-results/pax-desktop.png', fullPage: true, animations: 'disabled' });
  await page.route('**/api/questions*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Database unavailable' }) }));
  await page.getByRole('button', { name: 'Next question' }).click();
  await expect(page.getByRole('alert')).toContainText('Database unavailable');
});
