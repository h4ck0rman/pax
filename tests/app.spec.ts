import { test, expect } from '@playwright/test';

test('shell renders without console or page errors', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', error => problems.push(error.message));

  await page.goto('/');

  await expect(page.getByRole('link', { name: 'Pax home' })).toBeVisible();
  await expect(page.locator('main.app-main')).toBeVisible();
  await expect(page.locator('footer.app-footer')).toBeVisible();
  // The level 1 heading names the section on screen, for assistive technology.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Practice test');
  expect(problems).toEqual([]);
});

test('shell applies the palette and loads Averia Libre', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);

  expect(await page.evaluate(() => document.fonts.check('700 48px "Averia Libre"'))).toBeTruthy();

  const palette = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      ground: getComputedStyle(document.body).backgroundColor,
      ink: getComputedStyle(document.body).color,
      cream: root.getPropertyValue('--cream').trim(),
      green: root.getPropertyValue('--green').trim(),
      white: root.getPropertyValue('--white').trim(),
    };
  });
  expect(palette.ground).toBe('rgb(240, 235, 214)');
  expect(palette.ink).toBe('rgb(33, 69, 57)');
  expect([palette.cream, palette.green, palette.white]).toEqual(['#f0ebd6', '#214539', '#ffffff']);
});

test('shell fits a mobile viewport without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.locator('main.app-main')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
