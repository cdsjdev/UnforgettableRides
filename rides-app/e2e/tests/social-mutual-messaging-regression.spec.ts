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

async function mockDiscoverLists(page: any, input: {
  suggested: any[];
  following?: any[];
  requests?: any[];
}) {
  await page.route('**/api/v1/social/me/suggested-contacts**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { items: input.suggested || [], nextCursor: null } }),
    });
  });
  await page.route('**/api/v1/social/me/follow-requests**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { items: input.requests || [], nextCursor: null } }),
    });
  });
  await page.route('**/api/v1/social/users/*/following**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { items: input.following || [], nextCursor: null } }),
    });
  });
}

async function mockProfile(page: any, profile: any) {
  await page.route(`**/api/v1/social/users/${profile.userId}/profile`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: profile }),
    });
  });
  await page.route(`**/api/v1/social/users/${profile.userId}/posts**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { items: [], nextCursor: null } }),
    });
  });
}

test.describe('Social mutual messaging regression', () => {
  test('discover shows both followed users and suggested users with separate actions', async ({ page }) => {
    await registerFreshUser(page, { emailPrefix: 'e2e_social_mutual_discover' });

    await mockDiscoverLists(page, {
      following: [{
        userId: 'u-following',
        displayName: 'Claire',
        followersCount: 12,
        followingCount: 8,
        followStatus: 'active',
        isBlockedByMe: false,
        isMutualFollow: true,
      }],
      suggested: [{
        userId: 'u-suggested',
        displayName: 'Leo',
        followersCount: 2,
        followingCount: 1,
        followStatus: 'none',
        isBlockedByMe: false,
        isMutualFollow: false,
      }],
    });

    await openFindPeople(page);
    await expect(page.getByText(/people you follow/i)).toBeVisible();
    await expect(page.getByText('Claire', { exact: true })).toBeVisible();
    await expect(page.getByText('Leo', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /view profile/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /following/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^follow$/i }).first()).toBeVisible();
  });

  test('non-mutual profile clearly blocks message action', async ({ page }) => {
    await registerFreshUser(page, { emailPrefix: 'e2e_social_mutual_blocked' });

    await mockDiscoverLists(page, {
      suggested: [{
        userId: 'u-non-mutual',
        displayName: 'Not Mutual',
        followersCount: 3,
        followingCount: 4,
        followStatus: 'requested',
        isBlockedByMe: false,
        isMutualFollow: false,
      }],
    });
    await mockProfile(page, {
      userId: 'u-non-mutual',
      displayName: 'Not Mutual',
      avatarUrl: null,
      bio: null,
      followersCount: 3,
      followingCount: 4,
      followStatus: 'requested',
      isBlockedByMe: false,
      isMutualFollow: false,
    });

    let directThreadCalls = 0;
    await page.route('**/api/v1/social/threads/direct', async (route) => {
      directThreadCalls += 1;
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Mutual follow is required to message this user' },
        }),
      });
    });

    await openFindPeople(page);
    await rowByName(page, 'Not Mutual').getByRole('button', { name: /view profile/i }).click();

    await expect(page.getByText(/follow each other/i)).toBeVisible();
    const messageBtn = page.getByRole('button', { name: /^Message$/i });
    await expect(messageBtn).toHaveAttribute('aria-disabled', 'true');
    expect(directThreadCalls).toBe(0);
  });

  test('mutual-follow profile can start direct thread successfully', async ({ page }) => {
    await registerFreshUser(page, { emailPrefix: 'e2e_social_mutual_success' });

    await mockDiscoverLists(page, {
      suggested: [{
        userId: 'u-mutual',
        displayName: 'Mutual User',
        followersCount: 5,
        followingCount: 5,
        followStatus: 'active',
        isBlockedByMe: false,
        isMutualFollow: true,
      }],
    });
    await mockProfile(page, {
      userId: 'u-mutual',
      displayName: 'Mutual User',
      avatarUrl: null,
      bio: null,
      followersCount: 5,
      followingCount: 5,
      followStatus: 'active',
      isBlockedByMe: false,
      isMutualFollow: true,
    });

    await page.route('**/api/v1/social/threads/direct', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { threadId: 'thread-mutual', created: true } }),
      });
    });
    await page.route('**/api/v1/social/threads/thread-mutual/messages**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { items: [], nextCursor: null } }),
        });
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'm-1',
            threadId: 'thread-mutual',
            senderUserId: 'self',
            messageType: 'text',
            body: 'hello',
            mediaUrl: null,
            clientMsgId: null,
            createdAt: new Date().toISOString(),
            editedAt: null,
            deletedAt: null,
          },
        }),
      });
    });
    await page.route('**/api/v1/social/threads/thread-mutual/typing', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { items: [] } }),
      });
    });

    await openFindPeople(page);
    await rowByName(page, 'Mutual User').getByRole('button', { name: /view profile/i }).click();
    await page.getByRole('button', { name: /^Message$/i }).click();
    await expect(page.getByPlaceholder(/message/i)).toBeVisible();
  });

  test('if relationship changes, profile shows server denial cleanly', async ({ page }) => {
    await registerFreshUser(page, { emailPrefix: 'e2e_social_mutual_race' });

    await mockDiscoverLists(page, {
      suggested: [{
        userId: 'u-race',
        displayName: 'Race User',
        followersCount: 1,
        followingCount: 1,
        followStatus: 'active',
        isBlockedByMe: false,
        isMutualFollow: true,
      }],
    });
    await mockProfile(page, {
      userId: 'u-race',
      displayName: 'Race User',
      avatarUrl: null,
      bio: null,
      followersCount: 1,
      followingCount: 1,
      followStatus: 'active',
      isBlockedByMe: false,
      isMutualFollow: true,
    });
    let directThreadCalls = 0;
    await page.route('**/api/v1/social/threads/direct', async (route) => {
      directThreadCalls += 1;
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Mutual follow is required to message this user' },
        }),
      });
    });

    await openFindPeople(page);
    await rowByName(page, 'Race User').getByRole('button', { name: /view profile/i }).click();
    await page.getByRole('button', { name: /^Message$/i }).click();
    await expect.poll(() => directThreadCalls).toBe(1);
    await expect(page.getByPlaceholder(/message/i)).toHaveCount(0);
  });
});
