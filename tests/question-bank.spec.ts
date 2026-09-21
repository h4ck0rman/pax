import { test, expect, type Page } from '@playwright/test';

const collapse = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map(block => block.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');

const label = (page: Page) => page.locator('.question-meta .eyebrow');
const stem = (page: Page) => page.locator('.question-stem');
const next = (page: Page) => page.getByRole('button', { name: 'Next', exact: true });
const back = (page: Page) => page.getByRole('button', { name: 'Back', exact: true });
const submit = (page: Page) => page.getByRole('button', { name: 'Submit answer' });

test('opens on the first question in the bank', async ({ page, request }) => {
  const firstPage = await (await request.get('/api/questions')).json();

  await page.goto('/');

  await expect(label(page)).toHaveText('Question 1');
  await expect(stem(page)).toHaveText(collapse(firstPage.questions[0].stem));
});

test('the first request is the top of the bank, later ones are random', async ({ page }) => {
  const queries: string[] = [];
  page.on('request', sent => {
    const url = new URL(sent.url());
    if (url.pathname === '/api/questions') queries.push(url.search);
  });

  await page.goto('/');
  await expect(stem(page)).toBeVisible();
  const opening = queries.filter(query => query.includes('offset=0'));
  expect(opening.length).toBeGreaterThan(0);
  expect(opening.every(query => !query.includes('random=true'))).toBeTruthy();

  await next(page).click();
  await expect(label(page)).toHaveText('Question 2');
  expect(queries.some(query => query.includes('random=true'))).toBeTruthy();
});

test('next advances the counter and eventually shows a different question', async ({ page }) => {
  await page.goto('/');
  const opening = await stem(page).textContent();

  let changed = false;
  for (let draw = 2; draw <= 4; draw += 1) {
    await next(page).click();
    await expect(label(page)).toHaveText(`Question ${draw}`);
    if ((await stem(page).textContent()) !== opening) changed = true;
  }
  expect(changed).toBeTruthy();
});

test('a selection does not carry over to the next question', async ({ page }) => {
  await page.goto('/');
  const opening = await stem(page).textContent();

  await page.locator('.option').first().click();
  await expect(page.locator('.option').first()).toHaveAttribute('aria-pressed', 'true');

  // Random draws can repeat a question, and a selection is keyed to the
  // question, so keep drawing until a different one arrives.
  for (let draw = 0; draw < 4; draw += 1) {
    await next(page).click();
    await expect(stem(page)).toBeVisible();
    if ((await stem(page).textContent()) !== opening) break;
  }
  expect(await stem(page).textContent()).not.toBe(opening);
  await expect(page.locator('.option[aria-pressed="true"]')).toHaveCount(0);
});

test('the Question bank nav entry restarts at question 1', async ({ page, request }) => {
  const firstPage = await (await request.get('/api/questions')).json();

  await page.goto('/');
  await next(page).click();
  await expect(label(page)).toHaveText('Question 2');

  await page.getByRole('button', { name: 'Question bank' }).click();

  await expect(label(page)).toHaveText('Question 1');
  await expect(stem(page)).toHaveText(collapse(firstPage.questions[0].stem));
});

test('the nav marks the question bank as the current section', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Question bank' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('a failed draw keeps the question on screen and reports the problem', async ({ page }) => {
  await page.goto('/');
  await expect(stem(page)).toBeVisible();
  const opening = await stem(page).textContent();

  await page.route('**/api/questions*', route =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'The question database is temporarily unavailable.' }),
    }),
  );
  await next(page).click();

  await expect(page.getByRole('alert')).toContainText('temporarily unavailable');
  expect(await stem(page).textContent()).toBe(opening);
  await expect(label(page)).toHaveText('Question 1');

  await page.unroute('**/api/questions*');
  await next(page).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(label(page)).toHaveText('Question 2');
});

test('back is unavailable on the first question', async ({ page }) => {
  await page.goto('/');
  await expect(stem(page)).toBeVisible();
  await expect(back(page)).toBeDisabled();
});

test('back returns to the question already drawn, with its selection', async ({ page }) => {
  await page.goto('/');
  const opening = await stem(page).textContent();
  await page.locator('.option').first().click();
  await expect(page.locator('.option').first()).toHaveAttribute('aria-pressed', 'true');

  await next(page).click();
  await expect(label(page)).toHaveText('Question 2');
  await expect(back(page)).toBeEnabled();

  await back(page).click();

  await expect(label(page)).toHaveText('Question 1');
  expect(await stem(page).textContent()).toBe(opening);
  await expect(page.locator('.option').first()).toHaveAttribute('aria-pressed', 'true');
});

test('going back then forward reuses the draw instead of fetching again', async ({ page }) => {
  let draws = 0;
  page.on('request', sent => {
    if (new URL(sent.url()).searchParams.get('random') === 'true') draws += 1;
  });

  await page.goto('/');
  await next(page).click();
  await expect(label(page)).toHaveText('Question 2');
  const second = await stem(page).textContent();
  const afterFirstDraw = draws;

  await back(page).click();
  await expect(label(page)).toHaveText('Question 1');
  await next(page).click();

  await expect(label(page)).toHaveText('Question 2');
  expect(await stem(page).textContent()).toBe(second);
  expect(draws).toBe(afterFirstDraw);
});

test('submit is unavailable until an option is chosen', async ({ page }) => {
  await page.goto('/');
  await expect(stem(page)).toBeVisible();
  await expect(submit(page)).toBeDisabled();

  await page.locator('.option').first().click();
  await expect(submit(page)).toBeEnabled();

  await page.locator('.option').first().click();
  await expect(submit(page)).toBeDisabled();
});

test('submitting records the answer and locks the options', async ({ page }) => {
  await page.goto('/');
  await page.locator('.option').nth(1).click();
  await submit(page).click();

  await expect(page.getByText('Answer recorded')).toBeVisible();
  await expect(submit(page)).toHaveCount(0);

  const options = page.locator('.option');
  for (const option of await options.all()) {
    await expect(option).toHaveAttribute('aria-disabled', 'true');
  }

  // Playwright refuses to click an aria-disabled control, so dispatch the event
  // directly to prove the handler itself ignores it and the choice cannot move.
  await options.first().dispatchEvent('click');
  await expect(options.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(options.first()).toHaveAttribute('aria-pressed', 'false');
});

test('a recorded answer survives navigating away and back', async ({ page }) => {
  await page.goto('/');
  await page.locator('.option').first().click();
  await submit(page).click();
  await expect(page.getByText('Answer recorded')).toBeVisible();

  await next(page).click();
  await expect(label(page)).toHaveText('Question 2');
  await expect(page.getByText('Answer recorded')).toHaveCount(0);
  await expect(submit(page)).toBeDisabled();

  await back(page).click();

  await expect(label(page)).toHaveText('Question 1');
  await expect(page.getByText('Answer recorded')).toBeVisible();
  await expect(page.locator('.option').first()).toHaveAttribute('aria-pressed', 'true');
});

test('the action sits above the two steps, which share one line', async ({ page }) => {
  const geometry = () =>
    page.evaluate(() => {
      const box = (selector: string) => {
        const node = document.querySelector(selector);
        return node ? node.getBoundingClientRect() : null;
      };
      const steps = [...document.querySelectorAll('.nav-steps > *')].map(node => {
        const rect = node.getBoundingClientRect();
        return rect.top + rect.height / 2;
      });
      const commit = box('.nav-commit') ?? box('.question-submitted');
      return { commitBottom: commit?.bottom ?? null, stepsTop: box('.nav-steps')?.top ?? null, steps };
    });

  for (const width of [1440, 768, 390, 360, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(stem(page)).toBeVisible();

    const before = await geometry();
    expect(before.steps.length, `steps at ${width}px`).toBe(2);
    expect(Math.max(...before.steps) - Math.min(...before.steps)).toBeLessThanOrEqual(1);
    expect(before.commitBottom!, `action above steps at ${width}px`).toBeLessThanOrEqual(
      before.stepsTop! + 1,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );

    // The confirmation replaces the action, so check that arrangement too.
    await page.locator('.option').first().click();
    await submit(page).click();
    await expect(page.getByText('Answer recorded')).toBeVisible();

    const after = await geometry();
    expect(Math.max(...after.steps) - Math.min(...after.steps)).toBeLessThanOrEqual(1);
    expect(after.commitBottom!, `confirmation above steps at ${width}px`).toBeLessThanOrEqual(
      after.stepsTop! + 1,
    );
  }
});
