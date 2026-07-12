import { test, expect } from '@playwright/test';

async function loginAsDemo(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: /use demo account/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 10_000 });
}

test.describe('Application packet PDF export', () => {
  test('downloads a packet containing the job and cover letter for the seeded draft', async ({ page }) => {
    await loginAsDemo(page);

    // The seeded demo account already has a draft for this job (see application-approval.spec.ts).
    await page.goto('/jobs');
    await page.getByTestId('filter-title').fill('Senior Backend Engineer');
    await expect(page.getByTestId('job-card')).toHaveCount(1, { timeout: 10_000 });
    await page.getByTestId('job-card-title').first().click();

    await expect(page.getByTestId('download-pdf-button')).toBeVisible({ timeout: 10_000 });

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('download-pdf-button').click();
    const download = await downloadPromise;

    // Mock mode returns a text/plain stand-in (see downloadPdf in mock-client.ts) - the
    // filename must reflect that, not claim to be a .pdf it isn't.
    expect(download.suggestedFilename()).toMatch(/\.txt$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf-8');

    expect(text).toContain('Zalando');
    expect(text).toContain('Cover Letter');
    expect(text).toContain('Tailored CV');
  });
});
