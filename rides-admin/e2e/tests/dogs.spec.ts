import { expect, test } from '@playwright/test';
import { API_BASE, getAuthToken, loginAsAdmin } from './helpers';

test.describe('Dogs management regression', () => {
  test('admin sees owner field and delete warning dialog behavior', async ({ page }) => {
    await loginAsAdmin(page);
    const token = await getAuthToken(page);

    const uniqueSuffix = Date.now();
    const dogName = `E2E Dog ${uniqueSuffix}`;
    let createdDogId: string | null = null;
    try {
      const createdDogResp = await page.request.post(`${API_BASE}dogs`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          name: dogName,
          photo_urls: [],
          age_months: 12,
          weight_lbs: 18,
          sex: 'male',
          traits: {
            size_class: 'M',
            height_inches: 16,
            coat_length: 'short',
            coat_texture: 'smooth',
            has_undercoat: false,
            shedding_level: 'medium',
            mat_risk: 'low',
            current_mat_level: 'none',
            skin_sensitivity: 'low',
            is_brachycephalic: false,
            ear_type: 'floppy',
          },
          confirmed_traits: {},
          breed_info: {
            predictions: [],
            is_purebred: false,
            is_mix: true,
            user_confirmed_breed: 'Mixed',
            user_confirmed_mix: null,
          },
          health: {
            has_allergies: false,
            allergy_notes: null,
            has_skin_conditions: false,
            skin_condition_notes: null,
            prone_to_ear_infections: false,
            noise_sensitive: false,
            dryer_tolerant: true,
            water_fearful: false,
            vet_grooming_restrictions: null,
            last_vet_visit: null,
          },
          grooming_preferences: {
            preferred_shampoo_type: 'auto',
            fragrance_preference: 'any',
            water_temp_preference: 'auto',
            dryer_preference: 'auto',
            avoid_conditioner: false,
            typical_wash_frequency_weeks: null,
            special_instructions: null,
          },
        },
      });
      expect(createdDogResp.ok()).toBeTruthy();
      const createdDogJson = await createdDogResp.json();
      createdDogId = createdDogJson?.data?.id || null;

      await page.goto('/dogs');
      await expect(page.getByRole('heading', { name: /Dogs|狗狗档案/ })).toBeVisible();

      const search = page.getByPlaceholder(/Search by name, breed, owner, or ID...|按名字、品种、主人或 ID 搜索.../);
      await search.fill(dogName);
      await expect(page.getByRole('cell', { name: dogName })).toBeVisible();

      await page.getByRole('button', { name: /Edit|编辑/ }).first().click();
      await expect(page.getByRole('heading', { name: /Edit Dog|编辑狗狗/ })).toBeVisible();
      await expect(page.locator('.form-group', { hasText: /Owner|主人/ }).locator('select')).toBeVisible();

      await page.getByRole('button', { name: /Cancel|取消/ }).click();
      await expect(page.getByRole('heading', { name: /Edit Dog|编辑狗狗/ })).toHaveCount(0);

      await page.getByRole('button', { name: /Delete|删除/ }).first().click();
      await expect(page.getByRole('heading', { name: /Delete Dog|删除狗狗/ })).toBeVisible();
      await expect(page.getByText(/This action cannot be undone.|此操作不可撤销。/)).toBeVisible();
      const deleteDialog = page.locator('.action-dialog').last();
      await deleteDialog.getByRole('button', { name: /Cancel|取消/ }).click();
      await expect(page.getByRole('heading', { name: /Delete Dog|删除狗狗/ })).toHaveCount(0);

      await expect(page.getByRole('cell', { name: dogName })).toHaveCount(1);
    } finally {
      if (createdDogId) {
        try {
          const deleteResp = await page.request.delete(`${API_BASE}dogs/${createdDogId}`, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 5000,
          });
          expect([204, 404]).toContain(deleteResp.status());
        } catch {
          // Ignore cleanup failure during teardown.
        }
      }
    }
  });

  test('admin can search owners and reassign dog owner in edit dialog', async ({ page }) => {
    await loginAsAdmin(page);
    const token = await getAuthToken(page);

    const uniqueSuffix = Date.now();
    const dogName = `E2E Reassign Dog ${uniqueSuffix}`;
    const ownerEmail = `e2e-owner-${uniqueSuffix}@unforgettablerides.test`;
    const ownerName = `E2E Owner ${uniqueSuffix}`;
    let createdDogId: string | null = null;
    let createdOwnerId: string | null = null;

    try {
      const createdOwnerResp = await page.request.post(`${API_BASE}auth/register`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          email: ownerEmail,
          password: 'Test123!',
          name: ownerName,
          role: 'customer',
        },
      });
      expect(createdOwnerResp.ok()).toBeTruthy();
      const createdOwnerJson = await createdOwnerResp.json();
      createdOwnerId = createdOwnerJson?.data?.id || null;
      expect(createdOwnerId).toBeTruthy();

      const createdDogResp = await page.request.post(`${API_BASE}dogs`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          name: dogName,
          photo_urls: [],
          age_months: 14,
          weight_lbs: 22,
          sex: 'female',
          traits: {
            size_class: 'M',
            height_inches: 16,
            coat_length: 'short',
            coat_texture: 'smooth',
            has_undercoat: false,
            shedding_level: 'medium',
            mat_risk: 'low',
            current_mat_level: 'none',
            skin_sensitivity: 'low',
            is_brachycephalic: false,
            ear_type: 'floppy',
          },
          confirmed_traits: {},
          breed_info: {
            predictions: [],
            is_purebred: false,
            is_mix: true,
            user_confirmed_breed: 'Mixed',
            user_confirmed_mix: null,
          },
          health: {
            has_allergies: false,
            allergy_notes: null,
            has_skin_conditions: false,
            skin_condition_notes: null,
            prone_to_ear_infections: false,
            noise_sensitive: false,
            dryer_tolerant: true,
            water_fearful: false,
            vet_grooming_restrictions: null,
            last_vet_visit: null,
          },
          grooming_preferences: {
            preferred_shampoo_type: 'auto',
            fragrance_preference: 'any',
            water_temp_preference: 'auto',
            dryer_preference: 'auto',
            avoid_conditioner: false,
            typical_wash_frequency_weeks: null,
            special_instructions: null,
          },
        },
      });
      expect(createdDogResp.ok()).toBeTruthy();
      const createdDogJson = await createdDogResp.json();
      createdDogId = createdDogJson?.data?.id || null;
      expect(createdDogId).toBeTruthy();

      await page.goto('/dogs');
      await expect(page.getByRole('heading', { name: /Dogs|ç‹—ç‹—æ¡£æ¡ˆ/ })).toBeVisible();

      const search = page.getByPlaceholder(/Search by name, breed, owner, or ID...|æŒ‰åå­—ã€å“ç§ã€ä¸»äººæˆ– ID æœç´¢.../);
      await search.fill(dogName);
      await expect(page.getByRole('cell', { name: dogName })).toBeVisible();

      await page.getByRole('button', { name: /Edit|ç¼–è¾‘/ }).first().click();
      await expect(page.getByRole('heading', { name: /Edit Dog|ç¼–è¾‘ç‹—ç‹—/ })).toBeVisible();

      const ownerSearchInput = page.getByPlaceholder(/Search owner by name, email, or ID...|æŒ‰å§“åã€é‚®ç®±æˆ– ID æœç´¢ä¸»äºº.../);
      await ownerSearchInput.fill(ownerEmail);

      const ownerSelect = page.locator('.form-group', { hasText: /Owner|ä¸»äºº/ }).locator('select');
      await expect(ownerSelect.locator('option')).toHaveCount(2);
      await expect(ownerSelect.locator('option', { hasText: new RegExp(ownerEmail, 'i') })).toHaveCount(1);
      await ownerSelect.selectOption({ value: createdOwnerId! });

      await page.getByRole('button', { name: /Save|ä¿å­˜/ }).click();
      await expect(page.getByRole('heading', { name: /Edit Dog|ç¼–è¾‘ç‹—ç‹—/ })).toHaveCount(0);

      await expect(page.getByRole('cell', { name: new RegExp(ownerEmail, 'i') })).toBeVisible();
    } finally {
      if (createdDogId) {
        try {
          await page.request.delete(`${API_BASE}dogs/${createdDogId}`, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 5000,
          });
        } catch {
          // Ignore cleanup failure during teardown.
        }
      }
      if (createdOwnerId) {
        try {
          await page.request.put(`${API_BASE}users/${createdOwnerId}`, {
            headers: { Authorization: `Bearer ${token}` },
            data: { is_active: false },
            timeout: 5000,
          });
        } catch {
          // Ignore cleanup failure during teardown.
        }
      }
    }
  });
});

