import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test.describe('RAG demo regression', () => {
  test('ingest, retrieve, and ask flow has stable UX', async ({ page }) => {
    await loginAsAdmin(page);

    await page.getByRole('link', { name: /AI Tools/i }).click();
    await expect(page).toHaveURL(/\/rag-demo$/);

    await page.getByRole('button', { name: 'Load Sample Doc' }).click();
    await expect(page.locator('input[placeholder="Grooming SOP v1"]')).not.toHaveValue('');
    await expect(page.locator('textarea[placeholder="Paste your knowledge content..."]')).not.toHaveValue('');

    await page.getByRole('button', { name: 'Ingest' }).click();
    await expect(page.getByText(/Ingested/i)).toBeVisible();
    await expect(page.locator('.rag-status-item').filter({ hasText: 'Active docs' })).toBeVisible();

    await page.getByRole('button', { name: 'Sample Q1' }).click();
    await page.getByRole('button', { name: 'Retrieve' }).click();
    await expect(page.locator('.rag-result-item').filter({ hasText: 'Hits' })).toBeVisible();

    await page.locator('input[placeholder="Paste provider key here"]').fill('');
    const askButton = page.getByRole('button', { name: 'Ask' });
    await askButton.click();
    await expect.poll(async () => {
      const disabled = await askButton.isDisabled();
      const hasError = await page.locator('.alert.alert-error').isVisible();
      const hasAnswer = await page.locator('.rag-answer-card').isVisible();
      return disabled || hasError || hasAnswer;
    }).toBeTruthy();
    await expect(page.getByRole('button', { name: /Ask|Waiting/i })).toBeEnabled({ timeout: 20_000 });

    const hasError = await page.locator('.alert.alert-error').isVisible();
    const hasAnswer = await page.locator('.rag-answer-card').isVisible();
    expect(hasError || hasAnswer).toBeTruthy();

    await page.getByText('Show raw JSON').click();
    await expect(page.locator('.rag-output')).toBeVisible();
  });
});
