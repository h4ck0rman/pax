import { test, expect, type Page } from '@playwright/test';

/** The paper year filter: a sitting can be narrowed to chosen paper years.
 *
 *  The year is derived from the source path of the document a question was found
 *  in, so it is a property of the paper rather than of the question text. Roughly
 *  one candidate in six sits in study material naming no year, and those are left
 *  out as soon as any year is chosen. Years are added from a dropdown and shown
 *  as removable tags. */

const addYear = (page: Page, year: number) =>
  page.locator('.setup-papers select').selectOption(String(year));

type Drawn = { id: string; paper_year?: number | null };

/** Every question the server handed back during this page's life.
 *
 *  Reading a body is asynchronous, so the reads are collected as promises and
 *  settled by `draws()`. Pushing from inside the listener instead would race the
 *  assertions, which is how this arrived: the array was still empty when read. */
function collectDraws(page: Page) {
  const pending: Promise<Drawn[]>[] = [];
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname !== '/api/questions' || !response.ok()) return;
    pending.push(response.json().then(body => body?.questions ?? []).catch(() => []));
  });
  return async () => (await Promise.all(pending)).flat();
}

test('the setup adds years as tags and says how large the pool is', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Build your test.' })).toBeVisible();

  await expect(page.locator('.setup-pace')).toContainText('including study material with no year');

  await addYear(page, 2022);
  await expect(page.locator('.year-tag', { hasText: '2022' })).toBeVisible();
  await expect(page.locator('.setup-pace')).toContainText('across 1 year');

  // The tag's remove control takes the year back off.
  await page.locator('.year-tag', { hasText: '2022' }).getByRole('button').click();
  await expect(page.locator('.year-tag')).toHaveCount(0);
  await expect(page.locator('.setup-pace')).toContainText('including study material with no year');
});

test('choosing years narrows the draw to those exact years', async ({ page }) => {
  const draws = collectDraws(page);
  const queries: string[] = [];
  page.on('request', sent => {
    const url = new URL(sent.url());
    if (url.pathname === '/api/questions') queries.push(url.search);
  });

  await page.goto('/');
  await addYear(page, 2022);
  await page.locator('.setup-field', { hasText: 'Questions' }).locator('select').selectOption('20');
  await page.getByRole('button', { name: 'Start test' }).click();
  await expect(page.locator('.question-stem')).toBeVisible();

  expect(queries.some(query => query.includes('years=2022'))).toBeTruthy();
  const drawn = await draws();
  expect(drawn.length).toBeGreaterThan(0);
  for (const question of drawn) {
    expect(question.paper_year, `question ${question.id} has no year`).toBe(2022);
  }
});

test('any year draws from the whole bank, undated material included', async ({ page }) => {
  const draws = collectDraws(page);

  await page.goto('/');
  await page.locator('.setup-field', { hasText: 'Questions' }).locator('select').selectOption('50');
  await page.getByRole('button', { name: 'Start test' }).click();
  await expect(page.locator('.question-stem')).toBeVisible();

  const drawn = await draws();
  expect(drawn.length).toBeGreaterThan(0);
  // A draw of fifty from a bank where about one in six is undated all but
  // certainly includes at least one of each, but only the range is asserted.
  const years = drawn.map(question => question.paper_year ?? null);
  expect(years.some(year => year === null || (year && year < 2022))).toBeTruthy();
});

test('the questions endpoint filters by year and refuses a nonsense one', async ({ request }) => {
  const filtered = await request.get('/api/questions?limit=25&random=true&years=2022');
  expect(filtered.ok()).toBeTruthy();
  const body = await filtered.json();
  expect(body.total).toBeGreaterThan(0);
  expect(body.questions.length).toBeGreaterThan(0);
  for (const question of body.questions) {
    expect(question.paper_year).toBe(2022);
  }

  const everything = await (await request.get('/api/questions?limit=1')).json();
  expect(body.total).toBeLessThan(everything.total);

  for (const bad of [
    'years=1200',
    'years=9999',
    'years=abc',
    'years=2022.5',
    'years=2020,abc',
    'minYear=1200',
    'minYear=abc',
  ]) {
    const refused = await request.get(`/api/questions?limit=1&${bad}`);
    expect(refused.status(), bad).toBe(400);
  }
});

test('a sitting remembers which papers it drew from', async ({ page }) => {
  await page.goto('/');
  await addYear(page, 2022);
  await page.locator('.setup-field', { hasText: 'Questions' }).locator('select').selectOption('5');
  await page.getByRole('button', { name: 'Start test' }).click();
  await expect(page.locator('.question-stem')).toBeVisible();

  const saved = page.waitForResponse(
    response => new URL(response.url()).pathname === '/api/tests' && response.request().method() === 'POST',
  );
  for (let position = 1; position <= 5; position += 1) {
    await page.locator('.option').first().click();
    if (position < 5) await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Finish test' }).click();
  await expect(page.getByRole('heading', { name: 'Test complete.' })).toBeVisible();

  const request = (await saved).request();
  expect(JSON.parse(request.postData() ?? '{}').years).toEqual([2022]);
});
