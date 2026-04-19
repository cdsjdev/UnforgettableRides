import { expect, test } from '@playwright/test';

test.describe('Guest mode regression', () => {
  test('guest can enter demo and reach booking demo flow', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/^Continue as Guest$/)).toBeVisible();
    await page.getByText(/^Continue as Guest$/).click();

    await expect(page.getByText(/OPENING DAY DEMO/i)).toBeVisible();
    await expect(page.getByText(/^Try These Features$/)).toBeVisible();
    await expect(page.getByText(/^Adding Your Dog$/)).toBeVisible();
    const appointmentCard = page.getByText(/^Appointment$/).first();
    await expect(appointmentCard).toBeVisible();
    await appointmentCard.click();
    await expect(page.getByText(/^Try Booking Demo$/)).toBeVisible();
    await page.getByText(/^Try Booking$/).click();

    await expect(page).toHaveURL(/\/care\/book/);
    await page.getByText(/^Book Appointment$/).last().click();
    await expect(page.getByText(/Please select a dog or enter your dog's name\./i)).toBeVisible();
  });

  test('guest can browse social public content and reach guest checkout with email', async ({ page }) => {
    const signupRes = await page.request.post('http://127.0.0.1:3100/api/v1/auth/signup', {
      data: {
        name: `Guest Feed Seeder ${Date.now()}`,
        email: `guest_feed_seed_${Date.now()}@unforgettablerides.test`,
        password: 'UnforgettableRides123!',
      },
    });
    expect(signupRes.ok()).toBeTruthy();
    const signupPayload = await signupRes.json();
    const token = signupPayload?.data?.token;
    expect(token).toBeTruthy();
    const createPostRes = await page.request.post('http://127.0.0.1:3100/api/v1/social/posts', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        content: 'Guest can open this public post detail',
        visibility: 'public',
      },
    });
    expect(createPostRes.ok()).toBeTruthy();

    await page.goto('/');
    await page.getByText(/^Continue as Guest$/).click();

    await page.getByText(/^Social$/).first().click();
    await expect(page.getByText(/Browse public posts as guest/i)).toBeVisible();
    await page.getByText(/Guest can open this public post detail/i).first().click();
    await expect(page.getByText(/Sign in to interact with posts/i)).toBeVisible();
    await page.goBack();
    await page.getByRole('button', { name: /^Meet Up$/i }).click();
    await expect(page.getByText(/Browse public meetups/i)).toBeVisible();

    const productsResp = await page.request.get('http://127.0.0.1:3100/api/v1/products');
    expect(productsResp.ok()).toBeTruthy();
    const payload = await productsResp.json();
    const firstProductName: string = payload?.data?.[0]?.name || '';
    expect(firstProductName.length).toBeGreaterThan(0);

    await page.getByText(/^Shop$/).first().click();
    const search = page.getByPlaceholder(/search products/i);
    await expect(search).toBeVisible();
    await search.fill(firstProductName);
    await page.keyboard.press('Enter');

    await page.getByText(new RegExp(firstProductName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')).first().click();
    await expect(page.getByText(/Add to Cart/i)).toBeVisible();
    await page.getByText(/Add to Cart/i).click();

    await page.getByTestId('shop-cart-button').click();
    await page.getByText(/Proceed to Checkout/i).click();
    await expect(page).toHaveURL(/\/shop\/checkout/);
    await expect(page.getByPlaceholder(/your@email.com/i)).toBeVisible();
  });
});

