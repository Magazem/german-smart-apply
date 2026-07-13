import { test, expect } from '@playwright/test';

async function loginAsDemo(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: /use demo account/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 10_000 });
}

test.describe('Auth state reflected outside the authenticated app shell', () => {
  test('landing page shows a dashboard link instead of Login/Sign up once authenticated', async ({ page }) => {
    await loginAsDemo(page);

    await page.goto('/');
    await expect(page.getByTestId('cta-dashboard')).toBeVisible();
    await expect(page.getByTestId('cta-signup')).not.toBeVisible();

    await page.getByTestId('cta-dashboard').click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('an authenticated visitor hitting /login is redirected away, not re-prompted for credentials', async ({
    page,
  }) => {
    await loginAsDemo(page);

    await page.goto('/login');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('an authenticated visitor hitting /signup is redirected away', async ({ page }) => {
    await loginAsDemo(page);

    await page.goto('/signup');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
