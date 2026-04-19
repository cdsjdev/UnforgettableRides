import { expect, test } from '@playwright/test';
import { registerFreshUser } from './helpers';

type MockState = {
  appointments: any[];
  promotions: any[];
  coupons: any[];
  memberships: any[];
};

function isoDateParts(offsetMinutes: number) {
  const d = new Date(Date.now() + offsetMinutes * 60_000);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${min}` };
}

function upcomingAppointment(params?: { withDog?: boolean; status?: string; dogId?: string; dogName?: string }) {
  const withDog = params?.withDog ?? true;
  const status = params?.status ?? 'confirmed';
  const dogId = params?.dogId ?? 'dog-1';
  const dogName = params?.dogName ?? 'Badge Dog';
  const { date, time } = isoDateParts(120);
  const nowIso = new Date().toISOString();
  return {
    id: `appt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    dog_id: withDog ? dogId : null,
    dog_name: withDog ? dogName : 'Guest Dog',
    customer_name: 'Badge User',
    customer_phone: '5551234567',
    customer_email: 'badge_user@petcare.test',
    service_type: 'wash',
    date,
    time,
    duration_minutes: 60,
    status,
    notes: null,
    booked_via: 'form',
    store_id: 'store-1',
    created_at: nowIso,
    updated_at: nowIso,
  };
}

function oldPastAppointment() {
  const { date, time } = isoDateParts(-24 * 60);
  const oldIso = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  return {
    id: `appt-old-${Date.now()}`,
    dog_id: 'dog-1',
    dog_name: 'Old Dog',
    customer_name: 'Badge User',
    customer_phone: '5551234567',
    customer_email: 'badge_user@petcare.test',
    service_type: 'wash',
    date,
    time,
    duration_minutes: 60,
    status: 'completed',
    notes: null,
    booked_via: 'form',
    store_id: 'store-1',
    created_at: oldIso,
    updated_at: oldIso,
  };
}

async function installActivityMocks(page: any, state: MockState) {
  await page.route('**/api/v1/stores', async (route: any) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: [{ id: 'store-1', name: '1st Street' }],
      }),
    });
  });

  await page.route('**/api/v1/appointments**', async (route: any) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: state.appointments }),
    });
  });

  await page.route('**/api/v1/stores/*/promotions**', async (route: any) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: state.promotions }),
    });
  });

  await page.route('**/api/v1/coupons/me**', async (route: any) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: state.coupons }),
    });
  });

  await page.route('**/api/v1/memberships/me**', async (route: any) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: state.memberships }),
    });
  });
}

async function createDogForFreshUser(page: any, creds: { email: string; password: string }): Promise<{ userId: string; dogId: string }> {
  const loginRes = await page.request.post('http://127.0.0.1:3100/api/v1/auth/login', {
    data: { email: creds.email, password: creds.password },
  });
  expect(loginRes.ok()).toBeTruthy();
  const loginPayload = await loginRes.json();
  const token = loginPayload?.data?.token;
  const userId = loginPayload?.data?.user?.id;
  expect(token).toBeTruthy();
  expect(userId).toBeTruthy();

  const createDogRes = await page.request.post('http://127.0.0.1:3100/api/v1/dogs', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: `Badge Dog ${Date.now()}`,
      breed_info: { user_confirmed_breed: 'Beagle', predictions: [{ breed_name: 'Beagle', confidence: 0.92 }] },
      traits: { size_class: 'M', coat_texture: 'smooth', coat_length: 'short' },
      photo_urls: [],
    },
  });
  expect(createDogRes.ok()).toBeTruthy();
  const createDogPayload = await createDogRes.json();
  const dogId = createDogPayload?.data?.id;
  expect(dogId).toBeTruthy();
  return { userId: userId as string, dogId: dogId as string };
}

async function goCare(page: any) {
  await page.getByRole('tab', { name: /^Care$/i }).first().click();
}

function tabDot(page: any, name: 'care' | 'dogs' | 'social') {
  return page.locator(`[data-testid="tab-dot-${name}"], #tab-dot-${name}`);
}

async function setOldSeenTimestamps(page: any, userId: string) {
  const oldTs = String(Date.now() - 24 * 60 * 60_000);
  await page.evaluate(({ uid, ts }) => {
    localStorage.setItem(`@petcare_new_seen_care:${uid}`, ts);
  }, { uid: userId, ts: oldTs });
}

test.describe('Activity badges regression', () => {
  test('dots appear for new activity, surface in-screen reason, and clear when user opens the new item', async ({ page }) => {
    const creds = await registerFreshUser(page, { emailPrefix: 'e2e_activity_badges' });
    const { userId, dogId } = await createDogForFreshUser(page, creds);

    const state: MockState = {
      appointments: [],
      promotions: [],
      coupons: [],
      memberships: [],
    };
    await installActivityMocks(page, state);

    await page.reload();
    await expect(tabDot(page, 'care')).toHaveCount(0);

    state.appointments = [upcomingAppointment({ withDog: true, status: 'confirmed', dogId })];
    await setOldSeenTimestamps(page, userId);
    await page.reload();

    await expect(tabDot(page, 'care')).toBeVisible();

    await goCare(page);
    await expect(page.getByTestId('care-appointments-new-pill')).toBeVisible();
    await expect(tabDot(page, 'care')).toBeVisible();
    await page.getByTestId('care-appointments-button').click();
    await expect(tabDot(page, 'care')).toHaveCount(0);
  });

  test('past/cancelled activity does not raise dogs/care dots', async ({ page }) => {
    const creds = await registerFreshUser(page, { emailPrefix: 'e2e_activity_no_false_positive' });
    const { dogId } = await createDogForFreshUser(page, creds);

    const state: MockState = {
      appointments: [
        { ...oldPastAppointment(), dog_id: dogId, dog_name: 'Old Dog' },
        { ...upcomingAppointment({ withDog: true, status: 'cancelled', dogId }) },
      ],
      promotions: [],
      coupons: [],
      memberships: [],
    };
    await installActivityMocks(page, state);

    await page.reload();
    await expect(tabDot(page, 'care')).toHaveCount(0);
  });

  test('offer-only activity raises care dot and in-screen offer new indicator', async ({ page }) => {
    const creds = await registerFreshUser(page, { emailPrefix: 'e2e_activity_offer_dot' });
    const { userId } = await createDogForFreshUser(page, creds);

    const nowIso = new Date().toISOString();
    const state: MockState = {
      appointments: [],
      promotions: [{
        id: 'promo-new',
        title: 'New care promo',
        is_active: true,
        valid_from: new Date(Date.now() - 5 * 60_000).toISOString(),
        valid_until: null,
        created_at: nowIso,
        updated_at: nowIso,
      }],
      coupons: [],
      memberships: [],
    };
    await installActivityMocks(page, state);

    await setOldSeenTimestamps(page, userId);
    await page.reload();
    await expect(tabDot(page, 'care')).toBeVisible();

    await goCare(page);
    await expect(page.getByTestId('care-offers-new-pill')).toBeVisible();
    await expect(tabDot(page, 'care')).toBeVisible();
    await page.getByTestId('care-offers-button').click();
    await expect(tabDot(page, 'care')).toHaveCount(0);
  });

  test('offers new pill does not immediately reappear after opening deals', async ({ page }) => {
    const creds = await registerFreshUser(page, { emailPrefix: 'e2e_activity_offer_stable' });
    const { userId } = await createDogForFreshUser(page, creds);

    const nowIso = new Date().toISOString();
    const state: MockState = {
      appointments: [],
      promotions: [],
      coupons: [{
        id: 'coupon-new',
        user_id: userId,
        promotion_id: 'promo-ref',
        store_id: 'store-1',
        coupon_code: 'SAVE10',
        claimed_at: nowIso,
        used_at: null,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
        status: 'available',
      }],
      memberships: [],
    };
    await installActivityMocks(page, state);

    await setOldSeenTimestamps(page, userId);
    await page.reload();
    await expect(tabDot(page, 'care')).toBeVisible();

    await goCare(page);
    await expect(page.getByTestId('care-offers-new-pill')).toBeVisible();
    await page.getByTestId('care-offers-button').click();
    await expect(tabDot(page, 'care')).toHaveCount(0);

    await goCare(page);
    await expect(page.getByTestId('care-offers-new-pill')).toHaveCount(0);
    await expect(tabDot(page, 'care')).toHaveCount(0);
  });

});
