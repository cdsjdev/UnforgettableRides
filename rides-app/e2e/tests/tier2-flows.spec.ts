import { expect, test } from '@playwright/test';
import { registerFreshUser } from './helpers';

test.describe('Tier-2 app flows (cart/checkout/payment)', () => {
  test('user can add product, reach payment screen, and see order in history', async ({ page }) => {
    await registerFreshUser(page);

    const productsResp = await page.request.get('http://127.0.0.1:3100/api/v1/products');
    expect(productsResp.ok()).toBeTruthy();
    const productsPayload = await productsResp.json();
    const firstProductName: string = productsPayload?.data?.[0]?.name || '';
    expect(firstProductName.length).toBeGreaterThan(0);

    await page.getByText(/^Shop$/).first().click();
    const search = page.getByPlaceholder(/search products/i);
    await expect(search).toBeVisible();
    await search.fill(firstProductName);
    await page.keyboard.press('Enter');

    await page.getByText(new RegExp(firstProductName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')).first().click();
    await expect(page.getByText(/Add to Cart/i)).toBeVisible();
    await page.getByText(/Add to Cart/i).click();

    await page.goto('/shop/cart');
    await expect(page.getByText(/Proceed to Checkout/i)).toBeVisible();
    await page.getByText(/Proceed to Checkout/i).click();
    await expect(page).toHaveURL(/\/shop\/checkout/);

    // Fill required shipping fields so checkout can create order and navigate to payment.
    await page.getByPlaceholder(/Your name|您的姓名/i).fill('E2E Buyer');
    await page.getByPlaceholder(/123 Main Street|街道地址/i).fill('123 Main Street');
    await page.getByPlaceholder(/New York|城市名称/i).fill('Seattle');
    await page.getByPlaceholder(/^CA$/i).fill('WA');
    await page.getByPlaceholder(/10001|邮编/i).fill('98101');
    await page.getByPlaceholder(/^US$/i).fill('US');

    await expect(page.getByText(/Proceed to Payment/i)).toBeVisible();
    await page.getByText(/Proceed to Payment/i).click();

    await expect(page).toHaveURL(/\/shop\/payment/i);

    await page.goto('/shop/orders');
    await expect(page).toHaveURL(/\/shop\/orders/);
    await expect(page.getByText(/No orders yet/i)).toHaveCount(0);
  });
});

