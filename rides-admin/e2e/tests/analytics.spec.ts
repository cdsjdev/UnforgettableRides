import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test.describe('Analytics camera panel regression', () => {
  test('camera tools are collapsed by default and can be toggled', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/analytics');
    await expect(page).toHaveURL(/\/analytics$/);

    await expect(page.getByText('Camera settings and live preview are collapsed by default.')).toBeVisible();

    const toggleButton = page.getByRole('button', { name: 'Show Tools' });
    await expect(toggleButton).toBeVisible();
    await toggleButton.click();

    await expect(page.getByRole('button', { name: 'Hide Tools' })).toBeVisible();
    await expect(page.getByLabel(/Camera URL/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Camera' })).toBeVisible();

    await page.getByRole('button', { name: 'Hide Tools' }).click();
    await expect(page.getByText('Camera settings and live preview are collapsed by default.')).toBeVisible();
  });
});
