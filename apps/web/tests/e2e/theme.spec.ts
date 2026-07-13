import { test, expect } from '@playwright/test';

test.describe('Theme toggle', () => {
  test('cycles through system -> light -> dark -> terminal and persists across reload', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByTestId('theme-toggle');
    await expect(toggle).toHaveAttribute('data-current-theme', 'system');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');

    await toggle.click();
    await expect(toggle).toHaveAttribute('data-current-theme', 'light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await toggle.click();
    await expect(toggle).toHaveAttribute('data-current-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await toggle.click();
    await expect(toggle).toHaveAttribute('data-current-theme', 'terminal');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'terminal');

    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(5, 5, 5)');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'terminal');
    await expect(page.getByTestId('theme-toggle')).toHaveAttribute('data-current-theme', 'terminal');

    await toggle.click();
    await expect(toggle).toHaveAttribute('data-current-theme', 'system');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  });
});
