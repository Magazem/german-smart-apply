import { test, expect } from '@playwright/test';

async function loginAsDemo(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: /use demo account/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 10_000 });
}

test.describe('Interview prep', () => {
  test('generates questions and talking points for a job with no prior application activity', async ({ page }) => {
    await loginAsDemo(page);

    // "Data Scientist" has no seeded application in the demo data - opening
    // its detail page creates a fresh application, which only reaches
    // "viewed" (not "applied"/"interview"). Generating interview prep here
    // still works, unlike follow-up emails, which require applied/interview.
    await page.goto('/jobs');
    await page.getByTestId('filter-title').fill('Data Scientist');
    await expect(page.getByTestId('job-card')).toHaveCount(1, { timeout: 10_000 });
    await page.getByTestId('job-card-title').first().click();

    await expect(page.getByTestId('generate-interview-prep-button')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('generate-interview-prep-button').click();

    const content = page.getByTestId('interview-prep-content');
    await expect(content).toBeVisible({ timeout: 10_000 });
    await expect(content).toContainText('data scientist');
  });
});
