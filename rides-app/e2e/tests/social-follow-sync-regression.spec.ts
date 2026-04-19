import { expect, test } from '@playwright/test';
import { registerFreshUser } from './helpers';

function rowByName(page: any, name: string) {
  const nameButton = page.getByRole('button', { name: new RegExp(`^${name}$`, 'i') }).first();
  return nameButton.locator('xpath=ancestor::div[1]');
}

async function openFindPeople(page: any) {
  await page.getByText(/^Social$/).first().click();
  await expect(page).toHaveURL(/\/social/);
  await page.getByText(/^Messages$/).first().click();
  await page.getByText(/^Find people$/i).last().click();
}

test.describe('Social follow sync regression', () => {
  test('discover row exposes both profile action and follow action', async ({ page }) => {
    await registerFreshUser(page, { emailPrefix: 'e2e_social_discover_actions' });

    await openFindPeople(page);

    // The row should expose an explicit extra action plus Follow action.
    await expect(page.getByRole('button', { name: /follow/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /view profile/i }).first()).toBeVisible();
  });

  test('follow cooldown is per-user (429 on one row does not block all rows)', async ({ page }) => {
    await registerFreshUser(page, { emailPrefix: 'e2e_social_cooldown' });

    const users = [
      { userId: 'u-actor', displayName: 'Dot Actor', followersCount: 0, followStatus: 'none' },
      { userId: 'u-viewer', displayName: 'Dot Viewer', followersCount: 0, followStatus: 'none' },
    ];

    await page.route('**/api/v1/social/me/suggested-contacts**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { items: users, nextCursor: null } }),
      });
    });
    await page.route('**/api/v1/social/me/follow-requests**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { items: [], nextCursor: null } }),
      });
    });
    await page.route('**/api/v1/social/follows/u-actor', async (route) => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: {
            code: 'SPAM_DETECTED',
            message: 'Follow/unfollow churn detected. Please wait before changing this relationship again.',
            retry_after_seconds: 250,
          },
        }),
      });
    });
    await page.route('**/api/v1/social/follows/u-viewer', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { status: 'active' } }),
      });
    });

    await openFindPeople(page);

    const actorRow = rowByName(page, 'Dot Actor');
    const viewerRow = rowByName(page, 'Dot Viewer');

    await actorRow.getByRole('button', { name: /follow/i }).click();
    await expect(actorRow.getByText(/250s/i)).toBeVisible();

    // Second row should remain available and not show cooldown.
    await expect(viewerRow.getByText(/250s/i)).toHaveCount(0);
    await viewerRow.getByRole('button', { name: /follow/i }).click();
    await expect(viewerRow.getByText(/following/i)).toBeVisible();
  });

  test('profile follow toggle syncs back to discover list on return', async ({ page }) => {
    await registerFreshUser(page, { emailPrefix: 'e2e_social_profile_sync' });

    let followStatus: 'none' | 'active' | 'requested' = 'none';

    await page.route('**/api/v1/social/me/suggested-contacts**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            items: [{
              userId: 'u-sync',
              displayName: 'Sync User',
              followersCount: 3,
              followingCount: 2,
              followStatus,
              isBlockedByMe: false,
            }],
            nextCursor: null,
          },
        }),
      });
    });
    await page.route('**/api/v1/social/me/follow-requests**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { items: [], nextCursor: null } }),
      });
    });
    await page.route('**/api/v1/social/users/u-sync/profile', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            userId: 'u-sync',
            displayName: 'Sync User',
            followersCount: 3,
            followingCount: 2,
            followStatus,
            isBlockedByMe: false,
          },
        }),
      });
    });
    await page.route('**/api/v1/social/users/u-sync/posts**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { items: [], nextCursor: null } }),
      });
    });
    await page.route('**/api/v1/social/follows/u-sync', async (route, request) => {
      if (request.method() === 'POST') {
        followStatus = 'active';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { status: 'active' } }),
        });
        return;
      }
      if (request.method() === 'DELETE') {
        followStatus = 'none';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
        return;
      }
      await route.continue();
    });

    await openFindPeople(page);
    const row = rowByName(page, 'Sync User');
    await expect(row.getByRole('button', { name: /follow/i })).toBeVisible();

    await row.getByRole('button', { name: /view profile/i }).click();
    await page.getByRole('button', { name: /^Follow$/i }).click();
    await expect(page.getByRole('button', { name: /^Following$/i })).toBeVisible();

    await page.goBack();
    const rowAfter = rowByName(page, 'Sync User');
    await expect(rowAfter.getByText(/following/i)).toBeVisible();
  });
});
