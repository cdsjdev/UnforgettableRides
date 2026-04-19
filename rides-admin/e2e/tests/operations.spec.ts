import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test.describe('Operations regression (products/appointments)', () => {
  test('can create/edit/remove product and run appointment lifecycle', async ({ page }) => {
    await loginAsAdmin(page);

    const stamp = Date.now();
    const productName = `E2E Product ${stamp}`;
    const updatedProductName = `E2E Product Updated ${stamp}`;

    await page.getByRole('link', { name: /Products/i }).click();
    await expect(page).toHaveURL(/\/products$/);

    await page.getByRole('button', { name: /\+ Add Product/i }).click();
    await page.getByLabel('Name').fill(productName);
    await page.getByLabel('Category').selectOption('treats');
    await page.getByLabel('Price').fill('19.99');
    await page.getByLabel('Stock Qty').fill('20');
    await page.getByLabel('Description').fill('E2E smoke product');
    await page.getByRole('button', { name: 'Create Product' }).click();

    await expect(page.getByText(productName)).toBeVisible();

    const row = page.locator('tr', { hasText: productName }).first();
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Name').fill(updatedProductName);
    await page.getByRole('button', { name: 'Update Product' }).click();
    await expect(page.getByText(updatedProductName)).toBeVisible();

    const updatedRow = page.locator('tr', { hasText: updatedProductName }).first();
    await updatedRow.getByRole('button', { name: 'Remove' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(updatedRow.getByText('Inactive')).toBeVisible();

    const dogName = `E2E Dog ${stamp}`;
    await page.getByRole('link', { name: /Appointments/i }).click();
    await expect(page).toHaveURL(/\/appointments$/);
    await page.getByRole('button', { name: /\+ New Appointment/i }).click();

    await page.getByLabel('Dog Name').fill(dogName);
    await page.getByLabel('Customer Name').fill('E2E Owner');
    await page.getByLabel('Phone').fill('555-1300');
    await page.getByLabel('Service').selectOption('wash');
    await page.getByLabel('Notes').fill('E2E appointment');
    await page.getByRole('button', { name: 'Book Appointment' }).click();

    const apptRow = page.locator('tr', { hasText: dogName }).first();
    await expect(apptRow).toBeVisible();
    await apptRow.getByRole('button', { name: 'Confirm' }).click();
    await expect(apptRow.getByText('Confirmed')).toBeVisible();
    await apptRow.getByRole('button', { name: 'Start' }).click();
    await expect(apptRow.getByText('In Progress')).toBeVisible();
    await apptRow.getByRole('button', { name: 'Complete' }).click();
    await expect(apptRow.getByText('Completed')).toBeVisible();
  });
});
