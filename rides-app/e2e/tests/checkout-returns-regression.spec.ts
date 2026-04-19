import { expect, test } from '@playwright/test';
import { registerFreshUser } from './helpers';

test.describe('Checkout + returns regression', () => {
  test('checkout loads shipping policy once on first open', async ({ page }) => {
    await registerFreshUser(page);

    const productsResp = await page.request.get('http://127.0.0.1:3100/api/v1/products');
    expect(productsResp.ok()).toBeTruthy();
    const productsPayload = await productsResp.json();
    const firstProductName: string = productsPayload?.data?.[0]?.name || '';
    expect(firstProductName.length).toBeGreaterThan(0);

    let shippingConfigCalls = 0;
    await page.route('**/api/v1/orders/shipping-config**', async (route) => {
      shippingConfigCalls += 1;
      await route.continue();
    });

    await page.getByText(/^Shop$/).first().click();
    const search = page.getByPlaceholder(/search products/i);
    await expect(search).toBeVisible();
    await search.fill(firstProductName);
    await page.keyboard.press('Enter');
    await page.getByText(new RegExp(firstProductName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')).first().click();
    await page.getByText(/Add to Cart/i).click();

    await page.goto('/shop/cart');
    await page.getByText(/Proceed to Checkout/i).click();
    await expect(page).toHaveURL(/\/shop\/checkout/);

    await expect.poll(() => shippingConfigCalls, { timeout: 10000 }).toBe(1);
    await page.waitForTimeout(1200);
    expect(shippingConfigCalls).toBe(1);
  });

  test('order history shows return entry in Chinese after language switch', async ({ page }) => {
    const creds = await registerFreshUser(page, { emailPrefix: 'e2e-return-zh' });

    const loginRes = await page.request.post('http://127.0.0.1:3100/api/v1/auth/login', {
      data: { email: creds.email, password: creds.password },
    });
    expect(loginRes.ok()).toBeTruthy();
    const loginPayload = await loginRes.json();
    const token = loginPayload?.data?.token;
    expect(token).toBeTruthy();

    const productsResp = await page.request.get('http://127.0.0.1:3100/api/v1/products');
    expect(productsResp.ok()).toBeTruthy();
    const productsPayload = await productsResp.json();
    const firstProductId: string = productsPayload?.data?.[0]?.id || '';
    expect(firstProductId.length).toBeGreaterThan(0);

    const createOrderRes = await page.request.post('http://127.0.0.1:3100/api/v1/orders', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        customer_name: 'E2E Return User',
        payment_method: 'in_store',
        items: [{ product_id: firstProductId, quantity: 1 }],
      },
    });
    expect(createOrderRes.ok()).toBeTruthy();

    // Force zh locale through persisted storage to avoid flaky language-toggle click matching.
    await page.addInitScript(() => {
      window.localStorage.setItem('@petcare_lang', 'zh');
    });
    await page.evaluate(() => {
      window.localStorage.setItem('@petcare_lang', 'zh');
    });

    await page.goto('/shop/orders');

    await expect(page.getByText('申请退货').first()).toBeVisible();

    // In zh mode, English fallback labels should not be shown.
    await expect(page.getByText('Request Return')).toHaveCount(0);
    await expect(page.getByText('Choose return reason')).toHaveCount(0);
  });
});
