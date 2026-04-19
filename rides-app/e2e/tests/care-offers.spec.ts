import { expect, test } from '@playwright/test';
import { registerFreshUser } from './helpers';

test.describe('Care/Offers navigation regression', () => {
  test('Care tab always lands on Care dashboard, not Offers', async ({ page }) => {
    const creds = await registerFreshUser(page);
    const loginRes = await page.request.post('http://127.0.0.1:3100/api/v1/auth/login', {
      data: { email: creds.email, password: creds.password },
    });
    expect(loginRes.ok()).toBeTruthy();
    const loginPayload = await loginRes.json();
    const token = loginPayload?.data?.token;
    expect(token).toBeTruthy();
    const createDogRes = await page.request.post('http://127.0.0.1:3100/api/v1/dogs', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: 'E2E Dog', birthday: '2020-01-01' },
    });
    expect(createDogRes.ok()).toBeTruthy();

    await page.goto('/care');
    await expect(page).toHaveURL(/\/care$/);
    await expect(page.getByTestId('care-offers-button')).toBeVisible();

    await page.getByTestId('care-offers-button').click();
    await expect(page.getByText(/My Coupons|我的优惠券/i).first()).toBeVisible();

    await page.getByText(/^Home$/).first().click();
    await expect(page).toHaveURL(/\/$/);

    await page.getByText(/^Care$/).first().click();
    await expect(page).toHaveURL(/\/care$/);
    await expect(page.getByText(/Today's Tasks|今日任务/i).last()).toBeVisible();
  });
});
