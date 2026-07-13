import { test, expect } from '@playwright/test';

test.describe('Theme toggle', () => {
  test('defaults new visitors to terminal, shows a dismissible hint, and cycles/persists correctly', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByTestId('theme-toggle');
    await expect(toggle).toHaveAttribute('data-current-theme', 'terminal');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'terminal');

    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(5, 5, 5)');

    const hint = page.getByTestId('theme-hint-dismiss');
    await expect(hint).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute('data-current-theme', 'system');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    // Using the toggle at all counts as "found it" - the hint shouldn't linger.
    await expect(hint).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute('data-current-theme', 'light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await toggle.click();
    await expect(toggle).toHaveAttribute('data-current-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await toggle.click();
    await expect(toggle).toHaveAttribute('data-current-theme', 'terminal');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'terminal');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'terminal');
    await expect(page.getByTestId('theme-toggle')).toHaveAttribute('data-current-theme', 'terminal');
    // Already dismissed (persisted across reload) - shouldn't reappear.
    await expect(page.getByTestId('theme-hint-dismiss')).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute('data-current-theme', 'system');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  });

  test('dismissing the hint directly hides it and it stays hidden across reload', async ({ page }) => {
    await page.goto('/');
    const hint = page.getByTestId('theme-hint-dismiss');
    await expect(hint).toBeVisible();

    await hint.click();
    await expect(hint).toBeHidden();

    await page.reload();
    await expect(page.getByTestId('theme-hint-dismiss')).toBeHidden();
    // Dismissing the hint is not the same as choosing a theme - still terminal.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'terminal');
  });
});
