import { expect, test } from '@playwright/test';

test.describe('Portal regression', () => {
  test('mobile navbar links remain reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const nav = page.getByRole('navigation');
    const browseCars = nav.getByRole('link', { name: 'Browse Cars' });
    await browseCars.scrollIntoViewIfNeeded();
    await browseCars.click();
    await expect(page).toHaveURL(/\/cars$/);

    const howItWorks = nav.getByRole('link', { name: 'How It Works' });
    await howItWorks.scrollIntoViewIfNeeded();
    await howItWorks.click();
    await expect(page).toHaveURL(/\/how-it-works$/);

    const about = nav.getByRole('link', { name: 'About' });
    await about.scrollIntoViewIfNeeded();
    await about.click();
    await expect(page).toHaveURL(/\/about$/);
  });

  test('public browse and password reset entrypoints work', async ({ page }) => {
    await page.goto('/cars');
    await expect(page.getByRole('heading', { name: /Classic Cars for Hire/i })).toBeVisible();

    const cardCount = await page.locator('.car-card').count();
    if (cardCount > 0) {
      await page.locator('.car-card').first().click();
      await expect(page).toHaveURL(/\/cars\/.+/);
      await expect(page.getByRole('link', { name: /Sign In to Book/i })).toBeVisible();
    } else {
      await expect(page.getByText(/No cars match your filters/i)).toBeVisible();
    }

    await page.goto('/login');
    await page.getByRole('link', { name: /Forgot password\?/i }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await page.locator('input[type="email"]').fill(`portal-forgot-${Date.now()}@unforgettablerides.test`);
    await page.getByRole('button', { name: /Send Reset Link/i }).click();
    await expect(page.getByText(/password reset link has been sent/i)).toBeVisible();
  });
});
