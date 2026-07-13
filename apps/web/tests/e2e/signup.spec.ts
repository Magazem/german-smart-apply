import { test, expect } from '@playwright/test';

function uniqueEmail() {
  return `e2e-signup-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

test.describe('Signup: password policy and consent gate', () => {
  test('submit stays disabled until the terms checkbox is checked', async ({ page }) => {
    await page.goto('/signup');
    await page.getByTestId('signup-email').fill(uniqueEmail());
    await page.getByTestId('signup-password').fill('Password1234');

    await expect(page.getByTestId('signup-submit')).toBeDisabled();
    await page.getByTestId('signup-accept-terms').check();
    await expect(page.getByTestId('signup-submit')).toBeEnabled();
  });

  test('rejects a weak password with a clear error before creating the account', async ({ page }) => {
    await page.goto('/signup');
    await page.getByTestId('signup-email').fill(uniqueEmail());
    await page.getByTestId('signup-password').fill('alllowercase');
    await page.getByTestId('signup-accept-terms').check();
    await page.getByTestId('signup-submit').click();

    await expect(page.locator('.error-text')).toBeVisible();
    await expect(page).toHaveURL(/\/signup/);
  });

  test('terms and privacy pages are reachable from the signup form and footer', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/en/terms');
    await expect(page.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/en/privacy');

    await page.goto('/terms');
    await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();

    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();

    await page.goto('/impressum');
    await expect(page.getByRole('heading', { name: 'Impressum' })).toBeVisible();
  });
});
