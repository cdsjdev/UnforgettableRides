import { test, expect } from '@playwright/test';
import { createRoleUserViaApi, login, loginApi, loginAsAdmin, ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers';

test.describe('RBAC regression', () => {
  test('store_manager and staff see correct access boundaries', async ({ page, context }) => {
    await loginAsAdmin(page);
    const adminToken = await loginApi(ADMIN_EMAIL, ADMIN_PASSWORD);
    const suffix = String(Date.now());

    const manager = await createRoleUserViaApi(adminToken, 'store_manager', suffix);
    const staff = await createRoleUserViaApi(adminToken, 'staff', suffix);

    await page.locator('.sidebar-logout').click();
    await login(page, manager.email, manager.password);
    await expect(page.getByRole('heading', { name: 'Store Overview' })).toBeVisible();

    await expect(page.getByRole('link', { name: /Analytics/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /AI Tools/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Users/i })).toHaveCount(0);

    await page.goto('/users');
    await expect(page).toHaveURL(/\/$/);

    await page.locator('.sidebar-logout').click();
    await login(page, staff.email, staff.password);
    await expect(page.getByRole('heading', { name: 'Store Overview' })).toBeVisible();

    await expect(page.getByRole('link', { name: /Analytics/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /AI Tools/i })).toHaveCount(0);

    await page.goto('/analytics');
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/rag-demo');
    await expect(page).toHaveURL(/\/$/);

  });
});
