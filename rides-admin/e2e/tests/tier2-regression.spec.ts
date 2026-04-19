import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test.describe('Tier-2 regression (auth guards + appointment cancellation)', () => {
  test('protected routes redirect to login when unauthenticated', async ({ page }) => {
    await page.goto('/orders');
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/analytics');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('admin can create and cancel an appointment end-to-end', async ({ page }) => {
    await loginAsAdmin(page);

    const stamp = Date.now();
    const dogName = `E2E Cancel Dog ${stamp}`;

    await page.getByRole('link', { name: /Appointments/i }).click();
    await expect(page).toHaveURL(/\/appointments$/);

    await page.getByRole('button', { name: /\+ New Appointment/i }).click();
    await page.getByLabel('Dog Name').fill(dogName);
    await page.getByLabel('Customer Name').fill('E2E Owner');
    await page.getByLabel('Phone').fill('555-1400');
    await page.getByLabel('Service').selectOption('wash');
    await page.getByLabel('Notes').fill('Tier-2 cancel path');
    await page.getByRole('button', { name: 'Book Appointment' }).click();

    const row = page.locator('tr', { hasText: dogName }).first();
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'Cancel' }).click();

    await expect(row.getByText('Cancelled')).toBeVisible();
  });
});
