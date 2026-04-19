import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  backToDiscoverFromDetail,
  createMeetupFromDiscover,
  openSocialMeetupTab,
  registerFreshUser,
} from './helpers';

async function loginForToken(api: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await api.post('http://127.0.0.1:3100/api/v1/auth/login', {
    data: { email, password },
  });
  expect(res.ok()).toBeTruthy();
  const payload = await res.json();
  const token = payload?.data?.token;
  expect(typeof token).toBe('string');
  return token as string;
}

async function cancelMeetupByTitle(
  api: APIRequestContext,
  token: string,
  meetupTitle: string,
): Promise<string> {
  const listRes = await api.get('http://127.0.0.1:3100/api/v1/social/meetups/me?limit=100', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(listRes.ok()).toBeTruthy();
  const listPayload = await listRes.json();
  const rows = Array.isArray(listPayload?.data?.items)
    ? listPayload.data.items
    : Array.isArray(listPayload?.data?.meetups)
      ? listPayload.data.meetups
      : [];
  const target = rows.find((row: any) => String(row?.title || '') === meetupTitle);
  expect(target?.id).toBeTruthy();

  const cancelRes = await api.post(`http://127.0.0.1:3100/api/v1/social/meetups/${target.id}/cancel`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(cancelRes.ok()).toBeTruthy();
  return String(target.id);
}

async function titleY(page: Page, title: string): Promise<number> {
  const node = page.getByText(title, { exact: true }).first();
  await expect(node).toBeVisible();
  const box = await node.boundingBox();
  expect(box).toBeTruthy();
  return Number(box?.y ?? Number.POSITIVE_INFINITY);
}

test.describe('Meetup regression', () => {
  test('host and attendee lifecycle keeps labels/actions consistent across create/join/cancel/leave', async ({ browser, page, request }) => {
    const runId = Date.now();
    const meetupTitle = `E2E Meetup ${runId}`;

    const hostAuth = await registerFreshUser(page, { name: 'Host User', emailPrefix: `host_${runId}` });
    await openSocialMeetupTab(page);
    await createMeetupFromDiscover(page, {
      title: meetupTitle,
      locationName: 'Central Park',
      description: 'Regression meetup flow',
    });

    await backToDiscoverFromDetail(page);
    await expect(page.getByText(meetupTitle, { exact: true })).toBeVisible();
    await expect(page.getByText(/^Hosting$/i)).toHaveCount(1);

    const attendeeContext = await browser.newContext();
    const attendeePage = await attendeeContext.newPage();

    try {
      await registerFreshUser(attendeePage, { name: 'Attendee User', emailPrefix: `attendee_${runId}` });
      await openSocialMeetupTab(attendeePage);
      await expect(attendeePage.getByText(meetupTitle, { exact: true })).toBeVisible();
      await attendeePage.getByRole('button', { name: /^Join$/i }).first().click();
      await expect(attendeePage.getByRole('button', { name: /^Leave$/i }).first()).toBeVisible();
      await expect(attendeePage.getByText(/^Joined$/i)).toBeVisible();

      const hostToken = await loginForToken(request, hostAuth.email, hostAuth.password);
      await cancelMeetupByTitle(request, hostToken, meetupTitle);
      await openSocialMeetupTab(page);
      await expect(page.getByText(/^Cancelled$/i)).toBeVisible();

      await openSocialMeetupTab(attendeePage);
      await expect(attendeePage.getByText(meetupTitle, { exact: true })).toBeVisible();
      await expect(attendeePage.getByText(/^Cancelled$/i)).toBeVisible();
      await expect(attendeePage.getByRole('button', { name: /^Leave$/i }).first()).toBeVisible();
      await attendeePage.getByRole('button', { name: /^Leave$/i }).first().click();
      await expect(attendeePage.getByRole('button', { name: /^Leave$/i })).toHaveCount(0);
      await expect(attendeePage.getByText(meetupTitle, { exact: true })).toHaveCount(0);

      await backToDiscoverFromDetail(page);
      await expect(page.getByText(meetupTitle, { exact: true })).toBeVisible();
      await expect(page.getByText(/^Cancelled$/i)).toBeVisible();
      await expect(page.getByText(/^Hosting$/i)).toHaveCount(0);
    } finally {
      await attendeeContext.close();
    }
  });

  test('cancelled meetup is hidden from uninvolved users but still visible to host', async ({ browser, page, request }) => {
    const runId = Date.now();
    const meetupTitle = `E2E Cancel Visibility ${runId}`;

    const hostAuth = await registerFreshUser(page, { name: 'Host Visible', emailPrefix: `host_vis_${runId}` });
    await openSocialMeetupTab(page);
    await createMeetupFromDiscover(page, {
      title: meetupTitle,
      locationName: 'Golden Gate Park',
      description: 'Cancelled visibility policy',
    });

    const hostToken = await loginForToken(request, hostAuth.email, hostAuth.password);
    await cancelMeetupByTitle(request, hostToken, meetupTitle);

    await openSocialMeetupTab(page);
    await expect(page.getByText(meetupTitle, { exact: true })).toBeVisible();
    await expect(page.getByText(/^Cancelled$/i)).toBeVisible();

    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    try {
      await registerFreshUser(otherPage, { name: 'Uninvolved User', emailPrefix: `uninvolved_${runId}` });
      await openSocialMeetupTab(otherPage);
      await expect(otherPage.getByText(meetupTitle, { exact: true })).toHaveCount(0);
    } finally {
      await otherContext.close();
    }
  });

  test('discover list orders cancelled meetups below active meetups', async ({ page, request }) => {
    const runId = Date.now();
    const cancelledTitle = `E2E Cancelled Order ${runId}`;
    const activeTitle = `E2E Active Order ${runId}`;

    const hostAuth = await registerFreshUser(page, { name: 'Host Order', emailPrefix: `host_order_${runId}` });
    await openSocialMeetupTab(page);

    await createMeetupFromDiscover(page, {
      title: cancelledTitle,
      locationName: 'City Park',
      description: 'Should end up below active',
    });
    await backToDiscoverFromDetail(page);

    await createMeetupFromDiscover(page, {
      title: activeTitle,
      locationName: 'City Park',
      description: 'Should remain above cancelled',
    });

    const hostToken = await loginForToken(request, hostAuth.email, hostAuth.password);
    await cancelMeetupByTitle(request, hostToken, cancelledTitle);

    await openSocialMeetupTab(page);
    await expect(page.getByText(cancelledTitle, { exact: true })).toBeVisible();
    await expect(page.getByText(activeTitle, { exact: true })).toBeVisible();

    const activeY = await titleY(page, activeTitle);
    const cancelledY = await titleY(page, cancelledTitle);
    expect(activeY).toBeLessThan(cancelledY);
  });

  test('my meetups leave button acts in place (no card tap hijack) and removes the meetup row', async ({ browser, page }) => {
    const runId = Date.now();
    const meetupTitle = `E2E MyMeetups Leave ${runId}`;

    await registerFreshUser(page, { name: 'Host Leave', emailPrefix: `host_leave_${runId}` });
    await openSocialMeetupTab(page);
    await createMeetupFromDiscover(page, {
      title: meetupTitle,
      locationName: 'Dolores Park',
      description: 'Join and leave from My meetups',
    });

    const attendeeContext = await browser.newContext();
    const attendeePage = await attendeeContext.newPage();

    try {
      await registerFreshUser(attendeePage, { name: 'Attendee Leave', emailPrefix: `attendee_leave_${runId}` });
      await openSocialMeetupTab(attendeePage);
      await expect(attendeePage.getByText(meetupTitle, { exact: true })).toBeVisible();
      await attendeePage.getByRole('button', { name: /^Join$/i }).first().click();
      await expect(attendeePage.getByRole('button', { name: /^Leave$/i }).first()).toBeVisible();

      await attendeePage.getByRole('button', { name: /^My meetups$/i }).click();
      await expect(attendeePage).toHaveURL(/\/social/);

      const leaveButtons = attendeePage.getByRole('button', { name: /^Leave$/i });
      const beforeLeaveCount = await leaveButtons.count();
      expect(beforeLeaveCount).toBeGreaterThan(0);

      await leaveButtons.first().click();
      await expect(attendeePage).not.toHaveURL(/\/social\/meetup\//i);
      await expect(attendeePage.getByRole('button', { name: /^Leave$/i })).toHaveCount(beforeLeaveCount - 1);
    } finally {
      await attendeeContext.close();
    }
  });
});
