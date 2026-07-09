import { test, expect } from '@playwright/test';

async function loginAsDemo(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: /use demo account/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 10_000 });
}

test.describe('Application queue: approval-first pipeline', () => {
  test('moving an application to "applied" requires opening the approval modal and explicitly confirming', async ({
    page,
  }) => {
    await loginAsDemo(page);
    await page.goto('/applications');

    // The seeded demo account has exactly one application "awaiting your approval".
    const row = page.getByTestId('application-row').filter({ has: page.getByText('Senior Backend Engineer') });
    await expect(row).toBeVisible();
    await expect(row.getByTestId('status-badge')).toHaveAttribute('data-status', 'awaiting_approval');

    // Opening the review action must show a real confirm dialog, not silently apply.
    await row.getByTestId('review-approve-button').click();
    const modal = page.getByTestId('approve-application-modal');
    await expect(modal).toBeVisible();

    // The draft content must actually be shown for review.
    await expect(modal.getByTestId('approve-modal-draft-content')).toContainText(/Zalando/i);

    // The confirm button must not be clickable until the reviewer explicitly checks the box —
    // this is the mechanism that makes "applied" impossible to reach silently.
    const confirmButton = modal.getByTestId('confirm-approve-button');
    await expect(confirmButton).toBeDisabled();

    // Cancelling must leave the application exactly where it was — opening the modal is not itself a mutation.
    await modal.getByRole('button', { name: 'Cancel' }).click();
    await expect(modal).not.toBeVisible();
    await expect(row.getByTestId('status-badge')).toHaveAttribute('data-status', 'awaiting_approval');

    // Re-open, and this time actually go through the explicit approval step.
    await row.getByTestId('review-approve-button').click();
    await expect(page.getByTestId('approve-application-modal')).toBeVisible();
    const checkbox = page.getByTestId('approve-confirm-checkbox');
    await expect(checkbox).not.toBeChecked();
    await expect(page.getByTestId('confirm-approve-button')).toBeDisabled();

    await checkbox.check();
    await expect(page.getByTestId('confirm-approve-button')).toBeEnabled();
    await page.getByTestId('confirm-approve-button').click();

    // Once approved, the modal closes and the application — and only that application — is now "Applied".
    await expect(page.getByTestId('approve-application-modal')).not.toBeVisible();
    await expect(row.getByTestId('status-badge')).toHaveAttribute('data-status', 'applied', { timeout: 10_000 });
    await expect(row.getByText('Applied')).toBeVisible();

    // No "awaiting your approval" row is left dangling in an inconsistent state.
    await expect(page.locator('[data-status="awaiting_approval"]')).toHaveCount(0);
  });

  test('a fresh draft-ready application cannot skip straight to applied — it must be submitted for approval first', async ({
    page,
  }) => {
    await loginAsDemo(page);

    // Drive the full path from job detail: save -> request tailored draft -> submit for approval.
    await page.goto('/jobs');
    await page.getByTestId('filter-title').fill('Frontend Engineer');
    await expect(page.getByTestId('job-card')).toHaveCount(1, { timeout: 10_000 });
    await page.getByTestId('job-card-title').first().click();

    await expect(page.getByRole('heading', { name: 'Frontend Engineer' })).toBeVisible();
    // This job was already "saved" in the seed data, so the save button may not show — request the draft directly.
    await page.getByTestId('request-draft-button').click();
    await expect(page.getByTestId('submit-for-approval-button')).toBeVisible({ timeout: 10_000 });

    // Before submission, there is no control on this page that jumps to "applied".
    await expect(page.getByRole('link', { name: /review.*approve in queue/i })).toHaveCount(0);

    await page.getByTestId('submit-for-approval-button').click();
    await expect(page).toHaveURL(/\/applications/);

    const row = page.getByTestId('application-row').filter({ has: page.getByText('Frontend Engineer') });
    await expect(row.getByTestId('status-badge')).toHaveAttribute('data-status', 'awaiting_approval');

    // Even here, "applied" is only reachable via the explicit modal + checkbox, never a direct toggle.
    await row.getByTestId('review-approve-button').click();
    await page.getByTestId('approve-confirm-checkbox').check();
    await page.getByTestId('confirm-approve-button').click();
    await expect(row.getByTestId('status-badge')).toHaveAttribute('data-status', 'applied', { timeout: 10_000 });
  });
});
