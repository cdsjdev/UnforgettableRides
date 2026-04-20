import { expect, test } from '@playwright/test';
import { registerFreshUser } from './helpers';

test.describe('App auth + navigation regression', () => {
  test('forgot password flow is available from login', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/^Forgot password\?$/i)).toBeVisible();
    await page.getByText(/^Forgot password\?$/i).click();

    await expect(page.getByText(/^Forgot Password$/i)).toBeVisible();
    await page.getByPlaceholder(/your@email.com/i).fill(`e2e-forgot-${Date.now()}@unforgettablerides.test`);
    await page.getByText(/^Send Reset Link$/i).click();
    await expect(page.getByText(/password reset link has been sent/i)).toBeVisible();

    await page.getByText(/^Back to Sign In$/i).click();
    await expect(page.getByText(/^Sign In$/)).toBeVisible();
  });

  test('register, navigate rides tabs, and sign out', async ({ page }) => {
    await registerFreshUser(page);

    const tabs = [
      { label: 'Cars', path: /\/cars/ },
      { label: 'Messages', path: /\/messages/ },
      { label: 'Profile', path: /\/profile/ },
      { label: 'Home', path: /\/$/ },
    ];

    for (const tab of tabs) {
      await page.getByText(new RegExp(`^${tab.label}$`, 'i')).first().click();
      await expect(page).toHaveURL(tab.path);
    }

    await page.goto('/profile');
    await expect(page.getByText(/^Sign Out$/)).toBeVisible();
    await page.getByText(/^Sign Out$/).click();
    await expect(page.getByText(/Are you sure you want to sign out\?/i)).toBeVisible();
    await page.locator('text=/^Sign Out$/').last().click();
    await expect(page.getByText(/^Sign In$/)).toBeVisible();
  });
});
