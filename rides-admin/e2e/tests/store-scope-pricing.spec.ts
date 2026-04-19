import { test, expect, request as playwrightRequest } from '@playwright/test';
import { API_BASE, ADMIN_EMAIL, ADMIN_PASSWORD, createRoleUserViaApi, login, loginApi, loginAsAdmin } from './helpers';

test.describe('Store scope + per-store pricing regression', () => {
  test('admin can choose All Stores in sidebar scope selector', async ({ page }) => {
    await loginAsAdmin(page);

    const scopeSelect = page.locator('.sidebar-store-scope select').first();
    await expect(scopeSelect).toBeVisible();
    await expect(scopeSelect.locator('option', { hasText: 'All Stores' })).toHaveCount(1);

    await scopeSelect.selectOption('');
    await expect(scopeSelect).toHaveValue('');
  });

  test('store manager cannot choose All Stores', async ({ page }) => {
    await loginAsAdmin(page);
    const adminToken = await loginApi(ADMIN_EMAIL, ADMIN_PASSWORD);
    const suffix = String(Date.now());
    const manager = await createRoleUserViaApi(adminToken, 'store_manager', suffix);

    await page.locator('.sidebar-logout').click();
    await login(page, manager.email, manager.password);
    await expect(page.getByRole('heading', { name: 'Store Overview' })).toBeVisible();

    const scopeSelect = page.locator('.sidebar-store-scope select').first();
    await expect(scopeSelect).toBeVisible();
    await expect(scopeSelect.locator('option', { hasText: 'All Stores' })).toHaveCount(0);
  });

  test('appointment charge uses per-store service price settings', async ({ page }) => {
    await loginAsAdmin(page);
    const adminToken = await loginApi(ADMIN_EMAIL, ADMIN_PASSWORD);
    const req = await playwrightRequest.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` },
    });

    const stamp = Date.now();
    const slugA = `e2e-scope-a-${stamp}`.toLowerCase();
    const slugB = `e2e-scope-b-${stamp}`.toLowerCase();

    const storeAResp = await req.post('stores', {
      data: {
        name: `E2E Scope A ${stamp}`,
        slug: slugA,
        service_price_wash: 701,
      },
    });
    const storeAJson = await storeAResp.json();
    expect(storeAResp.ok(), `create store A failed: ${JSON.stringify(storeAJson)}`).toBeTruthy();
    const storeAId = storeAJson?.data?.id as string;

    const storeBResp = await req.post('stores', {
      data: {
        name: `E2E Scope B ${stamp}`,
        slug: slugB,
        service_price_wash: 902,
      },
    });
    const storeBJson = await storeBResp.json();
    expect(storeBResp.ok(), `create store B failed: ${JSON.stringify(storeBJson)}`).toBeTruthy();
    const storeBId = storeBJson?.data?.id as string;

    const date = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('en-CA');

    const apptAResp = await req.post('appointments', {
      data: {
        store_id: storeAId,
        dog_name: `E2E Price Dog A ${stamp}`,
        service_type: 'wash',
        date,
        time: '10:00',
        duration_minutes: 60,
      },
    });
    const apptAJson = await apptAResp.json();
    expect(apptAResp.ok(), `create appt A failed: ${JSON.stringify(apptAJson)}`).toBeTruthy();
    const apptAId = apptAJson?.data?.id as string;

    const apptBResp = await req.post('appointments', {
      data: {
        store_id: storeBId,
        dog_name: `E2E Price Dog B ${stamp}`,
        service_type: 'wash',
        date,
        time: '10:00',
        duration_minutes: 60,
      },
    });
    const apptBJson = await apptBResp.json();
    expect(apptBResp.ok(), `create appt B failed: ${JSON.stringify(apptBJson)}`).toBeTruthy();
    const apptBId = apptBJson?.data?.id as string;

    const chargeAResp = await req.post(`appointments/${apptAId}/charge`, { data: {} });
    const chargeAJson = await chargeAResp.json();
    expect(chargeAResp.ok(), `charge A failed: ${JSON.stringify(chargeAJson)}`).toBeTruthy();
    expect(Number(chargeAJson?.data?.base_price)).toBe(701);
    expect(Number(chargeAJson?.data?.final_price)).toBe(701);

    const chargeBResp = await req.post(`appointments/${apptBId}/charge`, { data: {} });
    const chargeBJson = await chargeBResp.json();
    expect(chargeBResp.ok(), `charge B failed: ${JSON.stringify(chargeBJson)}`).toBeTruthy();
    expect(Number(chargeBJson?.data?.base_price)).toBe(902);
    expect(Number(chargeBJson?.data?.final_price)).toBe(902);

    await req.dispose();
  });

  test('store service capacity settings persist after save and reload', async ({ page }) => {
    await loginAsAdmin(page);
    const adminToken = await loginApi(ADMIN_EMAIL, ADMIN_PASSWORD);
    const req = await playwrightRequest.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` },
    });

    const stamp = Date.now();
    const storeName = `E2E Service Config ${stamp}`;
    const storeSlug = `e2e-service-config-${stamp}`.toLowerCase();

    const createStoreResp = await req.post('stores', {
      data: {
        name: storeName,
        slug: storeSlug,
      },
    });
    const createStoreJson = await createStoreResp.json();
    expect(createStoreResp.ok(), `create store failed: ${JSON.stringify(createStoreJson)}`).toBeTruthy();
    const storeId = createStoreJson?.data?.id as string;

    await page.getByRole('link', { name: /Stores|门店/i }).click();
    await expect(page).toHaveURL(/\/stores$/);

    const search = page.getByPlaceholder(/Search by name\/slug\/address|按门店名\/标识\/地址搜索/i);
    await search.fill(storeName);

    const targetRow = page.locator('tr', { hasText: storeName }).first();
    await expect(targetRow).toBeVisible();
    await targetRow.getByRole('button', { name: /Edit|编辑/i }).click();

    const washEnabled = page.locator('#svc-enabled-wash');
    const washMax = page.locator('#svc-max-wash');
    const groomEnabled = page.locator('#svc-enabled-groom');
    const groomMax = page.locator('#svc-max-groom');
    const otherEnabled = page.locator('#svc-enabled-other');
    const otherMax = page.locator('#svc-max-other');

    await expect(washEnabled).toBeVisible();
    await expect(washMax).toBeVisible();

    await washEnabled.check();
    await washMax.fill('7');
    await groomEnabled.check();
    await groomMax.fill('4');
    await otherEnabled.uncheck();
    await expect(otherMax).toBeDisabled();

    await page.getByRole('button', { name: /Update|更新/i }).click();
    await expect(page.getByRole('button', { name: /\+ Add Store|\+ 新建门店/i })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/stores$/);
    await search.fill(storeName);
    const updatedRow = page.locator('tr', { hasText: storeName }).first();
    await expect(updatedRow).toBeVisible();
    await updatedRow.getByRole('button', { name: /Edit|编辑/i }).click();

    await expect(page.locator('#svc-enabled-wash')).toBeChecked();
    await expect(page.locator('#svc-max-wash')).toHaveValue('7');
    await expect(page.locator('#svc-enabled-groom')).toBeChecked();
    await expect(page.locator('#svc-max-groom')).toHaveValue('4');
    await expect(page.locator('#svc-enabled-other')).not.toBeChecked();
    await expect(page.locator('#svc-max-other')).toBeDisabled();

    const verifyResp = await req.get(`stores?include_inactive=true&store_id=${encodeURIComponent(storeId)}`);
    const verifyJson = await verifyResp.json();
    expect(verifyResp.ok(), `verify store failed: ${JSON.stringify(verifyJson)}`).toBeTruthy();
    const store = verifyJson?.data?.[0];
    expect(String(store?.appointment_service_enabled_wash)).toBe('1');
    expect(String(store?.appointment_service_max_concurrent_wash)).toBe('7');
    expect(String(store?.appointment_service_enabled_groom)).toBe('1');
    expect(String(store?.appointment_service_max_concurrent_groom)).toBe('4');
    expect(String(store?.appointment_service_enabled_other)).toBe('0');

    await req.delete(`stores/${storeId}`);
    await req.dispose();
  });

  test('stores edit layout stays usable on narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await loginAsAdmin(page);

    const adminToken = await loginApi(ADMIN_EMAIL, ADMIN_PASSWORD);
    const req = await playwrightRequest.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` },
    });

    const stamp = Date.now();
    const storeName = `E2E Narrow Layout ${stamp}`;
    const storeSlug = `e2e-narrow-layout-${stamp}`.toLowerCase();
    let storeId: string | null = null;

    try {
      const createStoreResp = await req.post('stores', {
        data: {
          name: storeName,
          slug: storeSlug,
        },
      });
      const createStoreJson = await createStoreResp.json();
      expect(createStoreResp.ok(), `create store failed: ${JSON.stringify(createStoreJson)}`).toBeTruthy();
      storeId = createStoreJson?.data?.id as string;

      await page.goto('/stores');
      await expect(page).toHaveURL(/\/stores$/);

      const search = page.getByPlaceholder(/Search by name\/slug\/address|æŒ‰é—¨åº—å\/æ ‡è¯†\/åœ°å€æœç´¢/i);
      await search.fill(storeName);
      const row = page.locator('tr', { hasText: storeName }).first();
      await expect(row).toBeVisible();
      await row.getByRole('button', { name: /Edit|ç¼–è¾‘/i }).click();

      await expect(page.locator('#svc-enabled-wash')).toBeVisible();
      await expect(page.locator('#svc-max-wash')).toBeVisible();
      await expect(page.locator('#svc-enabled-groom')).toBeVisible();
      await expect(page.locator('#svc-max-groom')).toBeVisible();
      await expect(page.locator('#svc-enabled-full_service')).toBeVisible();
      await expect(page.locator('#svc-max-full_service')).toBeVisible();

      const hasHorizontalOverflow = await page.locator('form').first().evaluate((el) => {
        return el.scrollWidth > el.clientWidth + 2;
      });
      expect(hasHorizontalOverflow).toBeFalsy();
    } finally {
      if (storeId) {
        await req.delete(`stores/${storeId}`);
      }
      await req.dispose();
    }
  });
});
