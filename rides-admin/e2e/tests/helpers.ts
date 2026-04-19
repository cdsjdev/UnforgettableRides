import { expect, Page, request as playwrightRequest } from '@playwright/test';

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@petcare.com';
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin123';

const rawApiBase = (process.env.PW_API_BASE_URL || 'http://127.0.0.1:3000/api/v1/').trim();
export const API_BASE = rawApiBase.endsWith('/') ? rawApiBase : `${rawApiBase}/`;
let _resolvedAdmin: { email: string; password: string } | null = null;

export async function login(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/$/);
}

export async function loginAsAdmin(page: Page) {
  if (!_resolvedAdmin) {
    const candidates = [
      { email: process.env.E2E_ADMIN_EMAIL || '', password: process.env.E2E_ADMIN_PASSWORD || '' },
      { email: process.env.ADMIN_EMAIL || '', password: process.env.ADMIN_PASSWORD || '' },
      { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      { email: 'petcare.verify@gmail.com', password: 'petcare123!' },
      { email: 'admin@petcare.com', password: 'admin123' },
    ].filter((c) => c.email && c.password);

    const req = await playwrightRequest.newContext({ baseURL: API_BASE });
    for (const candidate of candidates) {
      const resp = await req.post('auth/login', {
        data: { email: candidate.email, password: candidate.password },
      });
      if (resp.ok()) {
        _resolvedAdmin = candidate;
        break;
      }
    }
    await req.dispose();
    if (!_resolvedAdmin) {
      throw new Error('Could not resolve valid admin credentials for E2E login');
    }
  }

  await login(page, _resolvedAdmin.email, _resolvedAdmin.password);
  await expect(page.getByRole('heading', { name: 'Store Overview' })).toBeVisible();
}

export async function getAuthToken(page: Page): Promise<string> {
  await page.waitForFunction(() => !!localStorage.getItem('petcare_token'));
  const token = await page.evaluate(() => localStorage.getItem('petcare_token'));
  if (!token) {
    throw new Error('No auth token found in localStorage after login');
  }
  return token;
}

export async function createOrderViaApi(token: string, productId: string, quantity = 1, storeId?: string | null) {
  const req = await playwrightRequest.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: {
      Authorization: `Bearer ${token}`,
    },
  });

  const resp = await req.post('orders', {
    data: {
      customer_name: 'E2E Customer',
      customer_phone: '555-1200',
      notes: 'E2E order',
      payment_method: 'in_store',
      store_id: storeId || undefined,
      items: [{ product_id: productId, quantity }],
    },
  });
  const json = await resp.json();
  await req.dispose();
  return {
    ok: resp.ok(),
    status: resp.status(),
    json,
    data: json?.data,
  };
}

export async function createRoleUserViaApi(
  adminToken: string,
  role: 'store_manager' | 'staff',
  suffix: string,
  storeId?: string | null
) {
  const req = await playwrightRequest.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: {
      Authorization: `Bearer ${adminToken}`,
    },
  });
  let resolvedStoreId = storeId || null;
  if (!resolvedStoreId) {
    const storesResp = await req.get('stores');
    const storesJson = await storesResp.json();
    resolvedStoreId = storesJson?.data?.[0]?.id || null;
  }
  const email = `e2e-${role}-${suffix}@petcare.test`;
  const password = 'Test123!';
  const registerResp = await req.post('auth/register', {
    data: {
      email,
      password,
      name: `E2E ${role} ${suffix}`,
      role,
      store_id: resolvedStoreId || undefined,
    },
  });
  const registerJson = await registerResp.json();
  await req.dispose();
  expect(registerResp.ok(), `failed to create ${role}: ${JSON.stringify(registerJson)}`).toBeTruthy();
  return { email, password, storeId: resolvedStoreId };
}

export async function loginApi(email: string, password: string) {
  const req = await playwrightRequest.newContext({
    baseURL: API_BASE,
  });
  const candidates = [
    { email, password },
    { email: process.env.E2E_ADMIN_EMAIL || '', password: process.env.E2E_ADMIN_PASSWORD || '' },
    { email: process.env.ADMIN_EMAIL || '', password: process.env.ADMIN_PASSWORD || '' },
    { email: 'petcare.verify@gmail.com', password: 'petcare123!' },
    { email: 'admin@petcare.com', password: 'admin123' },
  ].filter((c) => c.email && c.password);

  let lastJson: any = null;
  for (const candidate of candidates) {
    const resp = await req.post('auth/login', {
      data: { email: candidate.email, password: candidate.password },
    });
    const json = await resp.json();
    if (resp.ok() && json?.data?.token) {
      await req.dispose();
      return json.data.token as string;
    }
    lastJson = json;
  }

  await req.dispose();
  throw new Error(`login api failed: ${JSON.stringify(lastJson)}`);
}
