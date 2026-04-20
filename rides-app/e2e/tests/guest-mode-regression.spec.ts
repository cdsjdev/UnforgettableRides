import { expect, test } from '@playwright/test';

test.describe('Public browse regression', () => {
  test('guest can browse home and cars, then sees auth prompt in profile', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/Premium Classic Car Hire/i)).toBeVisible();
    await expect(page.getByText(/^Browse Cars$/i)).toBeVisible();

    await page.getByText(/^Cars$/i).first().click();
    await expect(page).toHaveURL(/\/cars/);

    await page.getByText(/^Profile$/i).first().click();
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.getByText(/^Sign In$/i)).toBeVisible();
    await expect(page.getByText(/^Create Account$/i)).toBeVisible();
  });
});
