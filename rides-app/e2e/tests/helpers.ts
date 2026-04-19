import { expect, Page } from '@playwright/test';

export async function registerFreshUser(
  page: Page,
  options?: { name?: string; emailPrefix?: string },
): Promise<{ email: string; password: string }> {
  const now = Date.now();
  const emailPrefix = options?.emailPrefix || 'e2e';
  const email = `${emailPrefix}_${now}@petcare.test`;
  const password = 'Petcare123!';
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

export async function openSocialMeetupTab(page: Page): Promise<void> {
  await page.goto('/social');
  await expect(page).toHaveURL(/\/social/);
  await page.getByRole('button', { name: /^Meet Up$/i }).click();
  await expect(page.getByText(/^Discover meetups$/i).first()).toBeVisible();
}

export async function createMeetupFromDiscover(
  page: Page,
  input: { title: string; locationName: string; description?: string },
): Promise<void> {
  await page.getByRole('button', { name: /^Create meetup$/i }).click();
  await expect(page.getByText(/^Create meetup$/i).first()).toBeVisible();

  await page.getByLabel(/^Title$/i).fill(input.title);
  await page.getByLabel(/^Location name$/i).fill(input.locationName);
  if (input.description) {
    await page.getByLabel(/^Description$/i).fill(input.description);
  }

  await page.getByRole('button', { name: /^Create$/i }).first().click();
  await expect(page.getByText(input.title)).toBeVisible();
  await expect(page.getByText(/^Host$/i).first()).toBeVisible();
}

export async function backToDiscoverFromDetail(page: Page): Promise<void> {
  await openSocialMeetupTab(page);
}

export function meetupCardByTitle(page: Page, title: string) {
  const titleNode = page.getByText(title, { exact: true }).first();
  return titleNode.locator('xpath=ancestor::*[self::div or self::a][1]');
}
