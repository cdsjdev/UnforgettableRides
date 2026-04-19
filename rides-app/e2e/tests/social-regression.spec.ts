import { expect, test } from '@playwright/test';
import { registerFreshUser } from './helpers';

test.describe('Social regression', () => {
  test('signed-in user can open Social tab and see inbox surface', async ({ page }) => {
    await registerFreshUser(page);

    await page.getByText(/^Social$/).first().click();
    await expect(page).toHaveURL(/\/social/);
    await page.getByText(/^Messages$/).first().click();
    await expect(page.getByText(/No messages yet/i)).toBeVisible();
  });

  test('guest can open Social tab and browse public content', async ({ page }) => {
    await page.goto('/');
    await page.getByText(/^Continue as Guest$/).click();

    await page.getByText(/^Social$/).first().click();
    await expect(page).toHaveURL(/\/social/);
    await expect(page.getByText(/Browse public posts as guest/i)).toBeVisible();
    await page.getByRole('button', { name: /^Meet Up$/i }).click();
    await expect(page.getByText(/Browse public meetups/i)).toBeVisible();
  });
});
