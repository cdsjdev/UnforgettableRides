import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test.describe('Dashboard auth + navigation regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('web_lang');
    });
  });

  test('login/logout and critical navigation paths', async ({ page }) => {
    await loginAsAdmin(page);

    await page.getByRole('link', { name: /Analytics/i }).click();
    await expect(page).toHaveURL(/\/analytics$/);
    await expect(page.getByRole('button', { name: 'Show Tools' })).toBeVisible();

    await page.getByRole('link', { name: /AI Tools/i }).click();
    await expect(page).toHaveURL(/\/rag-demo$/);
    await expect(page.getByRole('heading', { name: /RAG Demo/i })).toBeVisible();

    await page.getByRole('link', { name: /Products/i }).click();
    await expect(page).toHaveURL(/\/products$/);
    await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();

    await page.getByRole('link', { name: /Orders/i }).click();
    await expect(page).toHaveURL(/\/orders$/);
    await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible();

    await page.getByRole('link', { name: /Appointments/i }).click();
    await expect(page).toHaveURL(/\/appointments$/);
    await expect(page.getByRole('heading', { name: 'Appointments' })).toBeVisible();

    await page.getByRole('button', { name: 'Help' }).click();
    await expect(page).toHaveURL(/\/help$/);
    await expect(page.getByRole('heading', { name: /Dashboard Help/i })).toBeVisible();
    await expect(page.getByText(/Version/i)).toBeVisible();

    await page.locator('.sidebar-lang-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('lang', /zh/i);
    await expect(page.getByRole('heading', { name: '后台帮助' })).toBeVisible();
    await page.locator('.sidebar-lang-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('lang', /en/i);
    await expect(page.getByRole('heading', { name: /Dashboard Help/i })).toBeVisible();

    await page.locator('.sidebar-logout').click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });
});
