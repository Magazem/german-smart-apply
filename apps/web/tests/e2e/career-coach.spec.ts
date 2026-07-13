import { test, expect } from '@playwright/test';

async function loginAsDemo(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: /use demo account/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 10_000 });
}

test.describe('Career coach', () => {
  test('runs a role gap analysis and shows matching/missing skills', async ({ page }) => {
    await loginAsDemo(page);

    await page.goto('/career-coach');

    // Prefilled from the demo profile's targetRole.
    await expect(page.getByTestId('career-coach-target-role')).toHaveValue('Backend Engineer');

    await page.getByTestId('career-coach-analyze').click();

    const result = page.getByTestId('career-coach-result');
    await expect(result).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('readiness-gauge')).toBeVisible();

    // Demo profile has AWS/Java/PostgreSQL/Docker - the Backend Engineer
    // fixtures include those plus Kotlin/Kafka/Microservices/Go, which the
    // demo profile does not list.
    await expect(result).toContainText(/AWS|Java|PostgreSQL|Docker/i);
  });

  test('lists past analyses and can switch between them', async ({ page }) => {
    await loginAsDemo(page);
    await page.goto('/career-coach');

    await page.getByTestId('career-coach-analyze').click();
    await expect(page.getByTestId('career-coach-result')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('career-coach-target-role').fill('Frontend Engineer');
    await page.getByTestId('career-coach-analyze').click();
    await expect(page.getByTestId('career-coach-result')).toContainText('Frontend Engineer', { timeout: 10_000 });

    const historyItems = page.getByTestId('career-coach-history-item');
    await expect(historyItems).toHaveCount(2);

    await historyItems.last().click();
    await expect(page.getByTestId('career-coach-result')).toContainText('Backend Engineer');
  });
});
