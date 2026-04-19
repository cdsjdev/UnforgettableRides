import { expect, test } from '@playwright/test';
import { registerFreshUser } from './helpers';

test.describe('App feature buttons regression', () => {
  test('shop, appointments, and advisor screens keep critical actions clickable', async ({ page }) => {
    await registerFreshUser(page);

    await page.getByText(/^Shop$/).first().click();
    await expect(page.getByPlaceholder(/search products/i)).toBeVisible();
    await page.getByPlaceholder(/search products/i).fill('shampoo');
    await page.keyboard.press('Enter');

    await page.getByText(/^Care$/).first().click();
    await page.goto('/care/appointments');
    await expect(page.getByText(/^Book Appointment$/)).toBeVisible();
    await page.getByText(/^Book Appointment$/).click();
    await expect(page).toHaveURL(/\/care\/book/);

    // Overflow menu is available on root-tab screens, not deep stack screens.
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);

    // Navigate to Advisor via the real 3-dot overflow menu path.
    await page.getByLabel(/more options/i).first().click();
    await page.getByText(/advisor/i).first().click();
    const noProvider = page.getByText(/no ai providers configured/i);
    if (await noProvider.isVisible()) {
      await expect(noProvider).toBeVisible();
    } else {
      const input = page.getByPlaceholder(/ask me anything about classic car/i);
      await expect(input).toBeVisible();
      await input.fill('How often should I groom a short-haired dog?');
      await expect(input).toHaveValue(/How often/i);
    }
  });
});

