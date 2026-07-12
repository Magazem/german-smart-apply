import { test, expect } from '@playwright/test';

async function loginAsDemo(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: /use demo account/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 10_000 });
}

test.describe('Follow-up email drafts', () => {
  test('drafts a follow-up email for an application already in "interview" status', async ({ page }) => {
    await loginAsDemo(page);
    await page.goto('/applications');

    // The seeded demo account has a DevOps Engineer application in "interview".
    const row = page.getByTestId('application-row').filter({ has: page.getByText('DevOps Engineer') });
    await expect(row).toBeVisible();
    await expect(row.getByTestId('status-badge')).toHaveAttribute('data-status', 'interview');

    await row.getByTestId('draft-follow-up-button').click();

    const draft = row.getByTestId('follow-up-draft').first();
    await expect(draft).toBeVisible({ timeout: 10_000 });
    await expect(draft).toContainText('DevOps Engineer');
    await expect(draft).toContainText('Delivery Hero');
    await expect(draft).toContainText('review and send this yourself');
  });

  test('does not offer a follow-up button for an application still awaiting approval', async ({ page }) => {
    await loginAsDemo(page);
    await page.goto('/applications');

    const row = page.getByTestId('application-row').filter({ has: page.getByText('Senior Backend Engineer') });
    await expect(row).toBeVisible();
    await expect(row.getByTestId('status-badge')).toHaveAttribute('data-status', 'awaiting_approval');
    await expect(row.getByTestId('draft-follow-up-button')).toHaveCount(0);
  });
});
