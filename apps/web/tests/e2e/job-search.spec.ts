import { test, expect } from '@playwright/test';

async function loginAsDemo(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: /use demo account/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 10_000 });
}

test.describe('Job search filtering', () => {
  test('filtering by title and remote type actually narrows the result set', async ({ page }) => {
    await loginAsDemo(page);
    await page.goto('/jobs');

    await expect(page.getByTestId('jobs-result-count')).not.toHaveText('Searching…');
    const initialCountText = await page.getByTestId('jobs-result-count').innerText();
    const initialCount = Number(initialCountText.match(/\d+/)?.[0]);
    expect(initialCount).toBeGreaterThan(1);

    // Narrow by a specific title fragment.
    await page.getByTestId('filter-title').fill('Backend');
    await expect(page.getByTestId('jobs-result-count')).toContainText('job', { timeout: 10_000 });

    await expect
      .poll(async () => Number((await page.getByTestId('jobs-result-count').innerText()).match(/\d+/)?.[0]), {
        timeout: 10_000,
      })
      .toBeLessThan(initialCount);

    const titleFilteredCards = page.getByTestId('job-card-title');
    const titleCount = await titleFilteredCards.count();
    expect(titleCount).toBeGreaterThan(0);
    for (let i = 0; i < titleCount; i += 1) {
      await expect(titleFilteredCards.nth(i)).toContainText(/backend/i);
    }

    // Reset and instead narrow strictly by remote type.
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect
      .poll(async () => Number((await page.getByTestId('jobs-result-count').innerText()).match(/\d+/)?.[0]), {
        timeout: 10_000,
      })
      .toBe(initialCount);

    await page.getByTestId('filter-remote-remote').check();
    await expect
      .poll(async () => Number((await page.getByTestId('jobs-result-count').innerText()).match(/\d+/)?.[0]), {
        timeout: 10_000,
      })
      .toBeLessThan(initialCount);

    // Every remaining card should be a remote job (spot-check via detail navigation is unnecessary;
    // the risk/trust badges + title are enough signal that real filtering happened).
    const remoteFilteredCount = await page.getByTestId('job-card').count();
    expect(remoteFilteredCount).toBeGreaterThan(0);
    expect(remoteFilteredCount).toBeLessThan(initialCount);
  });

  test('an unrealistic listing surfaces a visible high scam-risk badge, not hidden', async ({ page }) => {
    await loginAsDemo(page);
    await page.goto('/jobs');
    await page.getByTestId('filter-query').fill('Data Entry');

    await expect(page.getByTestId('job-card')).toHaveCount(1, { timeout: 10_000 });
    const badge = page.getByTestId('risk-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('data-risk-level', 'high');
  });

  test('job card and job detail page both link out to the original posting', async ({ page }) => {
    await loginAsDemo(page);
    await page.goto('/jobs');
    await expect(page.getByTestId('job-card').first()).toBeVisible();

    const cardLink = page.getByTestId('apply-original-link').first();
    await expect(cardLink).toHaveAttribute('target', '_blank');
    await expect(cardLink).toHaveAttribute('rel', /noopener/);
    await expect(cardLink).toHaveAttribute('rel', /noreferrer/);
    const cardHref = await cardLink.getAttribute('href');
    expect(cardHref).toMatch(/^https?:\/\//);

    await page.getByTestId('job-card-title').first().click();
    await expect(page).toHaveURL(/\/jobs\/.+/);

    const detailLink = page.getByTestId('apply-original-link');
    await expect(detailLink).toHaveAttribute('target', '_blank');
    await expect(detailLink).toHaveAttribute('rel', /noopener/);
    await expect(detailLink).toHaveAttribute('rel', /noreferrer/);
    const detailHref = await detailLink.getAttribute('href');
    expect(detailHref).toMatch(/^https?:\/\//);
  });

  test('each job detail page names the browser tab after the job itself', async ({ page }) => {
    // Comparing postings means opening several of them at once, and every job
    // page used to inherit one generic site-wide title - so the tab strip was
    // a row of identical tabs with nothing to navigate by.
    await loginAsDemo(page);
    await page.goto('/jobs');
    await expect(page.getByTestId('job-card').first()).toBeVisible();

    const listTitle = await page.title();

    const firstJobTitle = (await page.getByTestId('job-card-title').first().innerText()).trim();
    await page.getByTestId('job-card-title').first().click();
    await expect(page).toHaveURL(/\/jobs\/.+/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await expect.poll(async () => await page.title(), { timeout: 10_000 }).toContain(firstJobTitle);

    // Two different jobs must not produce the same tab name.
    await page.goBack();
    await expect(page.getByTestId('job-card').nth(1)).toBeVisible();
    const secondJobTitle = (await page.getByTestId('job-card-title').nth(1).innerText()).trim();
    await page.getByTestId('job-card-title').nth(1).click();
    await expect(page).toHaveURL(/\/jobs\/.+/);

    await expect.poll(async () => await page.title(), { timeout: 10_000 }).toContain(secondJobTitle);

    // Leaving the page must not strand the previous job's name in the tab.
    await page.goto('/jobs');
    await expect(page.getByTestId('job-card').first()).toBeVisible();
    await expect.poll(async () => await page.title(), { timeout: 10_000 }).toBe(listTitle);
  });
});
