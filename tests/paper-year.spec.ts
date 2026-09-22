import { test, expect, type Page } from '@playwright/test';

/** The paper year filter: a sitting can be narrowed to recent papers only.
 *
 *  The year is derived from the source path of the document a question was found
 *  in, so it is a property of the paper rather than of the question text. Roughly
 *  one candidate in six sits in study material naming no year, and those are left
 *  out as soon as a year is chosen. */

const papers = (page: Page) => page.locator('.setup-field', { hasText: 'Papers' }).locator('select');

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

test('the setup offers a paper range and says how large the pool is', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Build your test.' })).toBeVisible();

  await expect(papers(page)).toHaveValue('0');
  await expect(page.locator('.setup-pace')).toContainText('including study material with no year');

  await papers(page).selectOption('2022');
  await expect(page.locator('.setup-pace')).toContainText('papers from 2022 onwards');
});

test('choosing a year narrows the draw to papers from that year onwards', async ({ page }) => {
  const draws = collectDraws(page);
  const queries: string[] = [];
  page.on('request', sent => {
    const url = new URL(sent.url());
    if (url.pathname === '/api/questions') queries.push(url.search);
  });

  await page.goto('/');
  await papers(page).selectOption('2022');
  await page.locator('.setup-field', { hasText: 'Questions' }).locator('select').selectOption('20');
  await page.getByRole('button', { name: 'Start test' }).click();
  await expect(page.locator('.question-stem')).toBeVisible();

  expect(queries.some(query => query.includes('minYear=2022'))).toBeTruthy();
  const drawn = await draws();
  expect(drawn.length).toBeGreaterThan(0);
  for (const question of drawn) {
    expect(question.paper_year, `question ${question.id} has no year`).toBeTruthy();
    expect(question.paper_year!).toBeGreaterThanOrEqual(2022);
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
  const filtered = await request.get('/api/questions?limit=25&random=true&minYear=2022');
  expect(filtered.ok()).toBeTruthy();
  const body = await filtered.json();
  expect(body.total).toBeGreaterThan(0);
  expect(body.questions.length).toBeGreaterThan(0);
  for (const question of body.questions) {
    expect(question.paper_year).toBeGreaterThanOrEqual(2022);
  }

  const everything = await (await request.get('/api/questions?limit=1')).json();
  expect(body.total).toBeLessThan(everything.total);

  for (const bad of ['minYear=1200', 'minYear=9999', 'minYear=abc', 'minYear=2022.5']) {
    const refused = await request.get(`/api/questions?limit=1&${bad}`);
    expect(refused.status(), bad).toBe(400);
  }
});

test('a sitting remembers which papers it drew from', async ({ page }) => {
  await page.goto('/');
  await papers(page).selectOption('2022');
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
  expect(JSON.parse(request.postData() ?? '{}').minYear).toBe(2022);
});
