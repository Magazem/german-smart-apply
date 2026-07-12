import { test, expect } from '@playwright/test';

async function loginAsDemo(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: /use demo account/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 10_000 });
}

test.describe('Admin analytics dashboard', () => {
  test('shows real counts derived from the seeded demo data, not fixture placeholders', async ({ page }) => {
    await loginAsDemo(page);
    await page.goto('/admin');

    const analytics = page.getByTestId('admin-analytics');
    await expect(analytics).toBeVisible({ timeout: 10_000 });

    // The seeded demo account is the only mock user and is Pro.
    await expect(analytics).toContainText('1 pro · 0 free');

    // The seeded demo applications: 1 viewed, 1 saved, 1 awaiting_approval, 1 interview.
    await expect(page.getByTestId('funnel-viewed')).toContainText('Viewed: 1');
    await expect(page.getByTestId('funnel-saved')).toContainText('Saved: 1');
    await expect(page.getByTestId('funnel-awaiting_approval')).toContainText('Awaiting approval: 1');
    await expect(page.getByTestId('funnel-interview')).toContainText('Interview: 1');
    await expect(page.getByTestId('funnel-applied')).toContainText('Applied: 0');
  });
});
