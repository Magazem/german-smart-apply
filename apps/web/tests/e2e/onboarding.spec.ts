import { test, expect } from '@playwright/test';
import path from 'node:path';

const SAMPLE_CV_PATH = path.join(__dirname, '..', 'fixtures', 'sample-cv.txt');

function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

test.describe('Onboarding: landing -> CV upload -> 5 questions -> matches', () => {
  test('a new user can go from landing to seeing matched jobs in one flow', async ({ page }) => {
    // 1. Landing page
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /optimizes for trust, not volume/i })).toBeVisible();
    await page.getByTestId('cta-signup').click();

    // 2. Sign up
    await expect(page).toHaveURL(/\/signup/);
    await page.getByTestId('signup-email').fill(uniqueEmail());
    await page.getByTestId('signup-password').fill('Password1234');
    await page.getByTestId('signup-accept-terms').check();
    await page.getByTestId('signup-submit').click();

    // 3. Onboarding step 1: upload CV file
    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByRole('heading', { name: 'Upload your CV' })).toBeVisible();
    await page.getByTestId('cv-file-input').setInputFiles(SAMPLE_CV_PATH);
    await page.getByTestId('parse-cv-button').click();

    // Parsed preview should show up before continuing.
    await expect(page.getByText('Parsed: Jordan Schmidt')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('onboarding-continue-step2').click();

    // 4. Onboarding step 2: quick questions (name is pre-filled from the CV parse)
    await expect(page.getByRole('heading', { name: 'Quick questions' })).toBeVisible();
    await expect(page.getByTestId('onboarding-full-name')).toHaveValue('Jordan Schmidt');
    await page.getByTestId('onboarding-target-role').fill('Backend Engineer');
    await page.getByTestId('onboarding-country').selectOption('DE');
    await page.getByTestId('onboarding-language').selectOption('en');
    await page.getByTestId('onboarding-seniority').selectOption('mid');
    await page.getByTestId('onboarding-location-pref').selectOption('hybrid');
    await page.getByTestId('onboarding-see-matches').click();

    // 5. Results shown within the same onboarding flow (no separate page needed).
    await expect(page.getByTestId('onboarding-results')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/trusted, deduplicated matches/i)).toBeVisible();
    const jobCards = page.getByTestId('job-card');
    await expect(jobCards).toHaveCount(5);

    // CV improvement suggestions and an example tailored draft are both present.
    await expect(page.getByText('CV improvement suggestions')).toBeVisible();
    await expect(page.getByText(/Example tailored cover letter/i)).toBeVisible();

    // 6. Continue on to the dashboard.
    await page.getByTestId('onboarding-go-dashboard').click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: /Welcome back/i })).toBeVisible();
    await expect(page.getByText('Top matched jobs')).toBeVisible();
  });

  test('CV can also be provided by pasting text instead of uploading a file', async ({ page }) => {
    await page.goto('/signup');
    await page.getByTestId('signup-email').fill(uniqueEmail());
    await page.getByTestId('signup-password').fill('Password1234');
    await page.getByTestId('signup-accept-terms').check();
    await page.getByTestId('signup-submit').click();

    await expect(page).toHaveURL(/\/onboarding/);
    await page.getByRole('button', { name: 'Paste text instead' }).click();
    await page.getByTestId('cv-text-input').fill(
      'Taylor Muster\nSkills: Python, Django, PostgreSQL\nBackend engineer with 3 years experience.',
    );
    await page.getByTestId('parse-cv-button').click();
    await expect(page.getByText('Parsed: Taylor Muster')).toBeVisible({ timeout: 10_000 });
  });
});
