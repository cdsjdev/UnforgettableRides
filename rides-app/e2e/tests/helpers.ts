import { expect, Page } from '@playwright/test';

export async function registerFreshUser(
  page: Page,
  options?: { name?: string; emailPrefix?: string },
): Promise<{ email: string; password: string }> {
  const now = Date.now();
  const emailPrefix = options?.emailPrefix || 'e2e';
  const email = `${emailPrefix}_${now}@unforgettablerides.test`;
  const password = 'UnforgettableRides123!';
  const name = options?.name || 'E2E User';

  await page.goto('/');
  await expect(page.getByText(/^Sign In$/)).toBeVisible();

  await page.getByText(/^Sign Up$/).click();
  await expect(page.getByText(/^Create Account$/)).toBeVisible();

  await page.getByPlaceholder(/your full name/i).fill(name);
  await page.getByPlaceholder(/your@email.com/i).fill(email);
  await page.getByPlaceholder(/at least 6 characters/i).fill(password);
  await page.getByPlaceholder(/re-enter your password/i).fill(password);
  await page.getByText(/^Create Account$/).click();

  await expect(page.getByText(/^Home$/)).toBeVisible();
  return { email, password };
}
