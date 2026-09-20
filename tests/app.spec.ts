import { test, expect } from '@playwright/test';

test('practice, save a flashcard, finish and persist progress', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Make yourself at home.' })).toBeVisible();
  await page.getByRole('button', { name: 'Settle into practice' }).click();
  await expect(page.getByRole('button', { name: 'Check answer' })).toBeDisabled();
  await page.getByRole('button', { name: 'B Active recall' }).click();
  await page.getByRole('button', { name: 'Check answer' }).click();
  await expect(page.getByText('Nicely done.')).toBeVisible();
  await page.getByRole('button', { name: 'Save as flashcard' }).click();
  await page.getByRole('button', { name: 'Next question' }).click();
  await page.getByRole('button', { name: 'C The time between reviews' }).click();
  await page.getByRole('button', { name: 'Check answer' }).click();
  await page.getByRole('button', { name: 'Next question' }).click();
  await page.getByRole('button', { name: 'A Reviewing missed questions and their explanations' }).click();
  await page.getByRole('button', { name: 'Check answer' }).click();
  await page.getByRole('button', { name: 'Finish session' }).click();
  await expect(page.getByText('You answered 3 of 3 demo questions correctly.')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Your progress', exact: true }).click();
  await expect(page.getByText('3 / 3 correct')).toBeVisible();
  await page.getByRole('button', { name: /Flashcards/ }).click();
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show question' })).toContainText('Active recall means');
});

test('timed session can be configured and expires', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: /Create a practice exam/ }).click();
  await page.getByLabel('Number of questions').selectOption('1');
  await page.getByLabel('Time to settle in').selectOption('1');
  await page.getByRole('button', { name: 'Begin session' }).click();
  await page.clock.fastForward(61000);
  await expect(page.getByText('You answered 0 of 1 demo questions correctly.')).toBeVisible();
});

test('mobile navigation and layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/pax-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.getByRole('button', { name: 'Question bank', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Room for discovery.' })).toBeVisible();
  await page.getByRole('searchbox').fill('card');
  await expect(page.getByRole('heading', { name: 'Cardiology' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Neurology' })).toHaveCount(0);
});

test('desktop overview renders', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto('/');
  await page.screenshot({ path: 'test-results/pax-desktop.png', fullPage: true });
});
