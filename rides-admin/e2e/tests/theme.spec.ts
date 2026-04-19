import { test, expect } from '@playwright/test';

test.describe('Theme regression', () => {
  test('forgot password respects localStorage dark theme', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('theme', 'dark');
    });

    await page.goto('/forgot-password');
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('heading', { name: /Forgot Password|忘记密码/ })).toBeVisible();
  });
});

