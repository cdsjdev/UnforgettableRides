const { app, db, request, createTestUser, cleanupTestUsers, restoreDogs } = require('./helpers');
const appModule = require('../src/index');
const { v4: uuidv4 } = require('uuid');

function sqlDateOffset(days = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

describe('Store offers/membership API (Step 4.5)', () => {
  let prefix;
  let storeA;
  let storeB;
  let admin;
  let manager;
  let customer;
  let otherCustomer;

  beforeEach(() => {
    prefix = `offers-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    storeA = `${prefix}-a`;
    storeB = `${prefix}-b`;

    const upsertStore = db.prepare(`
      INSERT INTO stores (id, name, slug, timezone, is_active, settings_json, created_at, updated_at)
      VALUES (?, ?, ?, 'America/Los_Angeles', 1, '{}', datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        slug = excluded.slug,
        is_active = 1,
        updated_at = datetime('now')
    `);
    upsertStore.run(storeA, `${prefix} Store A`, `${prefix}-store-a`);
    upsertStore.run(storeB, `${prefix} Store B`, `${prefix}-store-b`);

    admin = createTestUser('admin', { email: `${prefix}-admin@unforgettablerides.test` });
    manager = createTestUser('store_manager', { email: `${prefix}-mgr@unforgettablerides.test` });
    customer = createTestUser('customer', { email: `${prefix}-cust@unforgettablerides.test` });
    otherCustomer = createTestUser('customer', { email: `${prefix}-cust2@unforgettablerides.test` });

    db.prepare(`
      INSERT INTO user_store_links (user_id, store_id, is_active, created_at, updated_at)
      VALUES (?, ?, 1, datetime('now'), datetime('now'))
      ON CONFLICT(user_id, store_id) DO UPDATE SET is_active = 1, updated_at = datetime('now')
    `).run(manager.user.id, storeA);
    db.prepare('UPDATE users SET store_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(storeA, manager.user.id);
  });

  afterEach(() => {
    db.prepare('DELETE FROM user_coupons WHERE store_id IN (?, ?) OR id LIKE ?').run(storeA, storeB, `${prefix}%`);
    db.prepare('DELETE FROM user_memberships WHERE store_id IN (?, ?) OR id LIKE ?').run(storeA, storeB, `${prefix}%`);
    db.prepare('DELETE FROM store_promotions WHERE store_id IN (?, ?) OR id LIKE ?').run(storeA, storeB, `${prefix}%`);
    db.prepare('DELETE FROM store_membership_plans WHERE store_id IN (?, ?) OR id LIKE ?').run(storeA, storeB, `${prefix}%`);
    db.prepare('DELETE FROM store_services WHERE store_id IN (?, ?) OR id LIKE ?').run(storeA, storeB, `${prefix}%`);
    db.prepare('DELETE FROM user_store_links WHERE user_id IN (?, ?, ?, ?)').run(
      admin?.user?.id || '',
      manager?.user?.id || '',
      customer?.user?.id || '',
      otherCustomer?.user?.id || ''
    );
    db.prepare('DELETE FROM stores WHERE id IN (?, ?)').run(storeA, storeB);
    cleanupTestUsers();
    restoreDogs();
  });

  test('GET /api/v1/stores/:id/services returns parsed arrays (no raw JSON fields)', async () => {
    const serviceId = `${prefix}-svc`;
    db.prepare(`
      INSERT INTO store_services
      (id, store_id, service_type, name, category, description, base_price_cents, member_price_cents, price_on_assessment, size_variants_json, duration_minutes, requires_prior_session, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, 'groom', ?, 'grooming', NULL, 8500, NULL, 0, ?, 60, 0, 1, 1, datetime('now'), datetime('now'))
    `).run(serviceId, storeA, `${prefix} Groom`, JSON.stringify([{ label: 'MD', base_price_cents: 8500, member_price_cents: null }]));

    const res = await request(app)
      .get(`/api/v1/stores/${storeA}/services`)
      .set('Authorization', `Bearer ${customer.token}`);

    expect(res.status).toBe(200);
    const row = (res.body.data || []).find((s) => s.id === serviceId);
    expect(row).toBeTruthy();
    expect(Array.isArray(row.size_variants)).toBe(true);
    expect(row.size_variants_json).toBeUndefined();
  });

  test('GET /api/v1/stores/:id/services returns 404 for bad store', async () => {
    const res = await request(app)
      .get('/api/v1/stores/not-found-store/services')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(404);
  });

  test('GET /api/v1/stores/:id/services returns 403 for manager out-of-scope store', async () => {
    const res = await request(app)
      .get(`/api/v1/stores/${storeB}/services`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  });

  test('POST /api/v1/memberships/join returns 400 when store_id or plan_id missing', async () => {
    const noStore = await request(app)
      .post('/api/v1/memberships/join')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ plan_id: 'some-plan' });
    expect(noStore.status).toBe(400);
    expect(noStore.body?.error?.code).toBe('VALIDATION');

    const noPlan = await request(app)
      .post('/api/v1/memberships/join')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ store_id: storeA });
    expect(noPlan.status).toBe(400);
    expect(noPlan.body?.error?.code).toBe('VALIDATION');
  });

  test('POST /api/v1/memberships/join account-level (dog_id null) creates membership without dog', async () => {
    const planId = `${prefix}-plan-acct`;
    db.prepare(`
      INSERT INTO store_membership_plans
      (id, store_id, name, description, price_monthly_cents, price_yearly_cents, included_service_types_json, perks_json, is_highlighted, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, NULL, 5500, NULL, '["wash"]', '[]', 0, 1, 1, datetime('now'), datetime('now'))
    `).run(planId, storeA, `${prefix} Acct Plan`);

    const res = await request(app)
      .post('/api/v1/memberships/join')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ store_id: storeA, plan_id: planId });
    expect(res.status).toBe(201);
    expect(res.body.data.dog_id).toBeNull();
    expect(res.body.data.status).toBe('active');
    expect(res.body.data.plan_name).toBeTruthy();
  });

  test('POST /api/v1/memberships/join success + duplicate 409', async () => {
    const planId = `${prefix}-plan-a`;
    db.prepare(`
      INSERT INTO store_membership_plans
      (id, store_id, name, description, price_monthly_cents, price_yearly_cents, included_service_types_json, perks_json, is_highlighted, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, NULL, 5500, NULL, '["wash"]', '[]', 0, 1, 1, datetime('now'), datetime('now'))
    `).run(planId, storeA, `${prefix} Plan`);

    const dogId = `${prefix}-dog`;
    appModule._dogs.push({
      id: dogId,
      user_id: customer.user.id,
      name: `${prefix} Dog`,
      photo_urls: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      age_months: null,
      weight_lbs: null,
      sex: 'unknown',
      neutered_spayed: null,
      traits: {
        size_class: 'M',
        height_inches: null,
        coat_length: 'short',
        coat_texture: 'smooth',
        has_undercoat: false,
        shedding_level: 'medium',
        mat_risk: 'low',
        current_mat_level: 'none',
        skin_sensitivity: 'low',
        is_brachycephalic: false,
        ear_type: null,
        confidence: { size_class: 0.5, coat_length: 0.5, coat_texture: 0.5, has_undercoat: 0.5 },
      },
      confirmed_traits: {},
      breed_info: { predictions: [], is_purebred: false, is_mix: true, user_confirmed_breed: null, user_confirmed_mix: null },
      health: {
        has_allergies: false, allergy_notes: null, has_skin_conditions: false, skin_condition_notes: null,
        prone_to_ear_infections: false, noise_sensitive: false, dryer_tolerant: true, water_fearful: false,
        vet_grooming_restrictions: null, last_vet_visit: null,
      },
      grooming_preferences: {
        preferred_shampoo_type: 'auto', fragrance_preference: 'any', water_temp_preference: 'auto',
        dryer_preference: 'auto', avoid_conditioner: false, typical_wash_frequency_weeks: null, special_instructions: null,
      },
      wash_history: [],
      weight_history: [],
      vaccinations: [],
      medications: [],
    });

    const first = await request(app)
      .post('/api/v1/memberships/join')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ store_id: storeA, plan_id: planId, dog_id: dogId });
    expect(first.status).toBe(201);

    const dup = await request(app)
      .post('/api/v1/memberships/join')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ store_id: storeA, plan_id: planId, dog_id: dogId });
    expect(dup.status).toBe(409);
    expect(dup.body?.error?.code).toBe('ALREADY_JOINED');
  });

  test('POST /api/v1/memberships/join rejects other user dog ownership', async () => {
    const planId = `${prefix}-plan-b`;
    db.prepare(`
      INSERT INTO store_membership_plans
      (id, store_id, name, description, price_monthly_cents, price_yearly_cents, included_service_types_json, perks_json, is_highlighted, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, NULL, 5500, NULL, '["wash"]', '[]', 0, 1, 1, datetime('now'), datetime('now'))
    `).run(planId, storeA, `${prefix} Plan 2`);

    const otherDogId = `${prefix}-other-dog`;
    appModule._dogs.push({
      id: otherDogId,
      user_id: otherCustomer.user.id,
      name: `${prefix} Other Dog`,
      photo_urls: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      age_months: null,
      weight_lbs: null,
      sex: 'unknown',
      neutered_spayed: null,
      traits: {
        size_class: 'M',
        height_inches: null,
        coat_length: 'short',
        coat_texture: 'smooth',
        has_undercoat: false,
        shedding_level: 'medium',
        mat_risk: 'low',
        current_mat_level: 'none',
        skin_sensitivity: 'low',
        is_brachycephalic: false,
        ear_type: null,
        confidence: { size_class: 0.5, coat_length: 0.5, coat_texture: 0.5, has_undercoat: 0.5 },
      },
      confirmed_traits: {},
      breed_info: { predictions: [], is_purebred: false, is_mix: true, user_confirmed_breed: null, user_confirmed_mix: null },
      health: {
        has_allergies: false, allergy_notes: null, has_skin_conditions: false, skin_condition_notes: null,
        prone_to_ear_infections: false, noise_sensitive: false, dryer_tolerant: true, water_fearful: false,
        vet_grooming_restrictions: null, last_vet_visit: null,
      },
      grooming_preferences: {
        preferred_shampoo_type: 'auto', fragrance_preference: 'any', water_temp_preference: 'auto',
        dryer_preference: 'auto', avoid_conditioner: false, typical_wash_frequency_weeks: null, special_instructions: null,
      },
      wash_history: [],
      weight_history: [],
      vaccinations: [],
      medications: [],
    });

    const res = await request(app)
      .post('/api/v1/memberships/join')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ store_id: storeA, plan_id: planId, dog_id: otherDogId });
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  });

  test('POST /api/v1/memberships/purchase renews from current expiry without creating duplicate active membership', async () => {
    const planId = `${prefix}-renew-plan`;
    db.prepare(`
      INSERT INTO store_membership_plans
      (id, store_id, name, description, price_monthly_cents, price_yearly_cents, included_service_types_json, perks_json, is_highlighted, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, NULL, 5500, NULL, '["wash"]', '[]', 0, 1, 1, datetime('now'), datetime('now'))
    `).run(planId, storeA, `${prefix} Renew Plan`);

    const existingId = `${prefix}-membership-existing`;
    const startedAt = sqlDateOffset(-20);
    const originalExpiresAt = sqlDateOffset(10);
    db.prepare(`
      INSERT INTO user_memberships
      (id, user_id, dog_id, store_id, plan_id, status, started_at, expires_at, created_at, updated_at)
      VALUES (?, ?, NULL, ?, ?, 'active', ?, ?, datetime('now'), datetime('now'))
    `).run(existingId, customer.user.id, storeA, planId, startedAt, originalExpiresAt);

    const res = await request(app)
      .post('/api/v1/memberships/purchase')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ store_id: storeA, plan_id: planId, payment_method: 'online', billing_period: 'monthly' });

    expect(res.status).toBe(201);
    expect(res.body?.data?.membership?.id).toBe(existingId);

    const activeCount = db.prepare(`
      SELECT COUNT(*) AS c
      FROM user_memberships
      WHERE user_id = ?
        AND store_id = ?
        AND plan_id = ?
        AND status = 'active'
        AND dog_id IS NULL
    `).get(customer.user.id, storeA, planId)?.c || 0;
    expect(activeCount).toBe(1);

    const updated = db.prepare('SELECT started_at, expires_at FROM user_memberships WHERE id = ?').get(existingId);
    expect(updated).toBeTruthy();
    expect(updated.started_at).toBe(startedAt);

    const parseSqlDate = (v) => new Date(String(v).replace(' ', 'T') + 'Z').getTime();
    const originalMs = parseSqlDate(originalExpiresAt);
    const updatedMs = parseSqlDate(updated.expires_at);
    const extensionDays = (updatedMs - originalMs) / 86400000;

    expect(updatedMs).toBeGreaterThan(originalMs);
    expect(extensionDays).toBeGreaterThanOrEqual(27);
    expect(extensionDays).toBeLessThanOrEqual(32);
  });

  test('POST /api/v1/memberships/join returns 404 for inactive plan', async () => {
    const inactivePlanId = `${prefix}-plan-inactive`;
    db.prepare(`
      INSERT INTO store_membership_plans
      (id, store_id, name, description, price_monthly_cents, price_yearly_cents, included_service_types_json, perks_json, is_highlighted, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, NULL, 5500, NULL, '["wash"]', '[]', 0, 0, 1, datetime('now'), datetime('now'))
    `).run(inactivePlanId, storeA, `${prefix} Inactive Plan`);

    const res = await request(app)
      .post('/api/v1/memberships/join')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ store_id: storeA, plan_id: inactivePlanId });
    expect(res.status).toBe(404);
  });

  test('POST /api/v1/memberships/:id/cancel success', async () => {
    const mid = `${prefix}-m-cancel-ok`;
    db.prepare(`
      INSERT INTO user_memberships
      (id, user_id, dog_id, store_id, plan_id, status, started_at, expires_at, created_at, updated_at)
      VALUES (?, ?, NULL, ?, ?, 'active', datetime('now'), NULL, datetime('now'), datetime('now'))
    `).run(mid, customer.user.id, storeA, `${prefix}-plan-x`);

    const res = await request(app)
      .post(`/api/v1/memberships/${mid}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(res.status).toBe(200);
    expect(res.body?.data?.status).toBe('cancelled');
  });

  test('POST /api/v1/memberships/:id/cancel returns 409 when already cancelled', async () => {
    const mid = `${prefix}-m-cancelled`;
    db.prepare(`
      INSERT INTO user_memberships
      (id, user_id, dog_id, store_id, plan_id, status, started_at, expires_at, created_at, updated_at)
      VALUES (?, ?, NULL, ?, ?, 'cancelled', datetime('now'), datetime('now'), datetime('now'), datetime('now'))
    `).run(mid, customer.user.id, storeA, `${prefix}-plan-y`);

    const res = await request(app)
      .post(`/api/v1/memberships/${mid}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(res.status).toBe(409);
    expect(res.body?.error?.code).toBe('NOT_ACTIVE');
  });

  test('POST /api/v1/memberships/:id/cancel returns 403 for wrong user', async () => {
    const mid = `${prefix}-m-other-user`;
    db.prepare(`
      INSERT INTO user_memberships
      (id, user_id, dog_id, store_id, plan_id, status, started_at, expires_at, created_at, updated_at)
      VALUES (?, ?, NULL, ?, ?, 'active', datetime('now'), NULL, datetime('now'), datetime('now'))
    `).run(mid, otherCustomer.user.id, storeA, `${prefix}-plan-z`);

    const res = await request(app)
      .post(`/api/v1/memberships/${mid}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  });

  test('POST /api/v1/coupons/claim success by code and duplicate returns 409', async () => {
    const promoId = `${prefix}-promo-code`;
    db.prepare(`
      INSERT INTO store_promotions
      (id, store_id, title, description, type, discount_percent, discount_value_cents, max_discount_cents, applies_to_service_ids_json, eligibility, coupon_code, is_stackable, priority, usage_limit_total, usage_limit_per_user, valid_from, valid_until, is_active, created_at, updated_at)
      VALUES (?, ?, ?, NULL, 'fixed_off', NULL, 500, NULL, '[]', 'all', ?, 1, 10, NULL, NULL, ?, ?, 1, datetime('now'), datetime('now'))
    `).run(promoId, storeA, `${prefix} Promo Code`, `${prefix.toUpperCase()}-5OFF`, sqlDateOffset(-1), sqlDateOffset(7));

    const first = await request(app)
      .post('/api/v1/coupons/claim')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ coupon_code: `${prefix.toUpperCase()}-5OFF` });
    expect(first.status).toBe(201);

    const dup = await request(app)
      .post('/api/v1/coupons/claim')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ coupon_code: `${prefix.toUpperCase()}-5OFF` });
    expect(dup.status).toBe(409);
    expect(dup.body?.error?.code).toBe('ALREADY_CLAIMED');
  });

  test('POST /api/v1/coupons/claim success by promotion id', async () => {
    const promoId = `${prefix}-promo-id`;
    db.prepare(`
      INSERT INTO store_promotions
      (id, store_id, title, description, type, discount_percent, discount_value_cents, max_discount_cents, applies_to_service_ids_json, eligibility, coupon_code, is_stackable, priority, usage_limit_total, usage_limit_per_user, valid_from, valid_until, is_active, created_at, updated_at)
      VALUES (?, ?, ?, NULL, 'pct_off', 15, NULL, 1000, '[]', 'all', NULL, 0, 5, NULL, NULL, ?, ?, 1, datetime('now'), datetime('now'))
    `).run(promoId, storeA, `${prefix} Promo Id`, sqlDateOffset(-1), sqlDateOffset(7));

    const res = await request(app)
      .post('/api/v1/coupons/claim')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ promotion_id: promoId });
    expect(res.status).toBe(201);
  });

  test('POST /api/v1/coupons/claim members_only returns 403 without active membership', async () => {
    const promoId = `${prefix}-promo-member-only`;
    db.prepare(`
      INSERT INTO store_promotions
      (id, store_id, title, description, type, discount_percent, discount_value_cents, max_discount_cents, applies_to_service_ids_json, eligibility, coupon_code, is_stackable, priority, usage_limit_total, usage_limit_per_user, valid_from, valid_until, is_active, created_at, updated_at)
      VALUES (?, ?, ?, NULL, 'fixed_off', NULL, 500, NULL, '[]', 'members_only', NULL, 1, 50, NULL, NULL, ?, ?, 1, datetime('now'), datetime('now'))
    `).run(promoId, storeA, `${prefix} Members Only`, sqlDateOffset(-1), sqlDateOffset(7));

    const res = await request(app)
      .post('/api/v1/coupons/claim')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ promotion_id: promoId });
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('MEMBERS_ONLY');
  });

  test('POST /api/v1/coupons/claim returns 409 LIMIT_REACHED when total limit hit', async () => {
    const promoId = `${prefix}-promo-limit`;
    db.prepare(`
      INSERT INTO store_promotions
      (id, store_id, title, description, type, discount_percent, discount_value_cents, max_discount_cents, applies_to_service_ids_json, eligibility, coupon_code, is_stackable, priority, usage_limit_total, usage_limit_per_user, valid_from, valid_until, is_active, created_at, updated_at)
      VALUES (?, ?, ?, NULL, 'fixed_off', NULL, 500, NULL, '[]', 'all', NULL, 1, 1, 1, NULL, ?, ?, 1, datetime('now'), datetime('now'))
    `).run(promoId, storeA, `${prefix} Limited`, sqlDateOffset(-1), sqlDateOffset(7));

    db.prepare(`
      INSERT INTO user_coupons
      (id, user_id, promotion_id, store_id, coupon_code, claimed_at, used_at, expires_at, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, datetime('now'), NULL, ?, 'available', datetime('now'), datetime('now'))
    `).run(uuidv4(), otherCustomer.user.id, promoId, storeA, sqlDateOffset(7));

    const res = await request(app)
      .post('/api/v1/coupons/claim')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ promotion_id: promoId });
    expect(res.status).toBe(409);
    expect(res.body?.error?.code).toBe('LIMIT_REACHED');
  });

  // ── Step 8 regression: service CRUD ─────────────────────────────────────────

  test('POST /stores/:id/services creates a service (manager)', async () => {
    const res = await request(app)
      .post(`/api/v1/stores/${storeA}/services`)
      .set('Authorization', `Bearer ${manager.token}`)
      .send({
        service_type: 'wash',
        name: `${prefix} Wash`,
        base_price_cents: 3000,
        member_price_cents: null,
        price_on_assessment: false,
        size_variants: [],
        duration_minutes: 45,
        requires_prior_session: false,
        sort_order: 1,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe(`${prefix} Wash`);
    expect(res.body.data.base_price_cents).toBe(3000);
    expect(Array.isArray(res.body.data.size_variants)).toBe(true);
  });

  test('POST /stores/:id/services blocked for customer', async () => {
    const res = await request(app)
      .post(`/api/v1/stores/${storeA}/services`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ service_type: 'wash', name: 'Bad', base_price_cents: 1000 });
    expect(res.status).toBe(403);
  });

  test('PUT /stores/:id/services/:sid updates a service', async () => {
    const svcId = `${prefix}-svc-update`;
    db.prepare(`
      INSERT INTO store_services
      (id, store_id, service_type, name, category, description, base_price_cents, member_price_cents, price_on_assessment, size_variants_json, duration_minutes, requires_prior_session, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, 'wash', ?, 'wash', NULL, 3000, NULL, 0, '[]', 45, 0, 1, 1, datetime('now'), datetime('now'))
    `).run(svcId, storeA, `${prefix} Wash Update`);

    const res = await request(app)
      .put(`/api/v1/stores/${storeA}/services/${svcId}`)
      .set('Authorization', `Bearer ${manager.token}`)
      .send({ base_price_cents: 3500, name: `${prefix} Wash Updated` });
    expect(res.status).toBe(200);
    expect(res.body.data.base_price_cents).toBe(3500);
    expect(res.body.data.name).toBe(`${prefix} Wash Updated`);
  });

  test('DELETE /stores/:id/services/:sid deactivates a service', async () => {
    const svcId = `${prefix}-svc-del`;
    db.prepare(`
      INSERT INTO store_services
      (id, store_id, service_type, name, category, description, base_price_cents, member_price_cents, price_on_assessment, size_variants_json, duration_minutes, requires_prior_session, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, 'groom', ?, 'grooming', NULL, 5000, NULL, 0, '[]', 60, 0, 1, 2, datetime('now'), datetime('now'))
    `).run(svcId, storeA, `${prefix} Groom Del`);

    const del = await request(app)
      .delete(`/api/v1/stores/${storeA}/services/${svcId}`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(del.status).toBe(200);

    // Should be hidden from customer (active-only) but visible with include_inactive to manager
    const custRes = await request(app)
      .get(`/api/v1/stores/${storeA}/services`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect((custRes.body.data || []).find((s) => s.id === svcId)).toBeUndefined();

    const mgrRes = await request(app)
      .get(`/api/v1/stores/${storeA}/services?include_inactive=true`)
      .set('Authorization', `Bearer ${manager.token}`);
    const row = (mgrRes.body.data || []).find((s) => s.id === svcId);
    expect(row).toBeTruthy();
    expect(row.is_active).toBe(0);
  });

  test('include_inactive=true is blocked for customer role', async () => {
    const res = await request(app)
      .get(`/api/v1/stores/${storeA}/services?include_inactive=true`)
      .set('Authorization', `Bearer ${customer.token}`);
    // Returns 200 but inactive rows must not appear (flag is silently ignored for non-managers)
    expect(res.status).toBe(200);
    const rows = res.body.data || [];
    rows.forEach((s) => expect(s.is_active).not.toBe(0));
  });

  // ── Service validation ───────────────────────────────────────────────────────

  test('POST /stores/:id/services returns 400 when name missing', async () => {
    const res = await request(app)
      .post(`/api/v1/stores/${storeA}/services`)
      .set('Authorization', `Bearer ${manager.token}`)
      .send({ service_type: 'wash', base_price_cents: 3000 });
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('VALIDATION');
  });

  test('POST /stores/:id/services returns 400 when base_price_cents missing and not price_on_assessment', async () => {
    const res = await request(app)
      .post(`/api/v1/stores/${storeA}/services`)
      .set('Authorization', `Bearer ${manager.token}`)
      .send({ service_type: 'wash', name: `${prefix} No Price`, price_on_assessment: false });
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('VALIDATION');
  });

  test('POST /stores/:id/services succeeds with price_on_assessment true and no base_price', async () => {
    const res = await request(app)
      .post(`/api/v1/stores/${storeA}/services`)
      .set('Authorization', `Bearer ${manager.token}`)
      .send({ service_type: 'groom', name: `${prefix} On Assessment`, price_on_assessment: true, sort_order: 1 });
    expect(res.status).toBe(201);
    expect(res.body.data.price_on_assessment).toBeTruthy();
    expect(res.body.data.base_price_cents).toBeNull();
  });

  test('PUT /stores/:id/services/:sid reactivates via is_active: true', async () => {
    const svcId = `${prefix}-svc-reactivate`;
    db.prepare(`
      INSERT INTO store_services
      (id, store_id, service_type, name, category, description, base_price_cents, member_price_cents, price_on_assessment, size_variants_json, duration_minutes, requires_prior_session, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, 'wash', ?, 'wash', NULL, 3000, NULL, 0, '[]', 45, 0, 0, 1, datetime('now'), datetime('now'))
    `).run(svcId, storeA, `${prefix} Inactive Svc`);

    const res = await request(app)
      .put(`/api/v1/stores/${storeA}/services/${svcId}`)
      .set('Authorization', `Bearer ${manager.token}`)
      .send({ is_active: true });
    expect(res.status).toBe(200);
    expect(res.body.data.is_active).toBe(1);
  });

  test('PUT /stores/:id/services/:sid returns 400 when no valid fields sent', async () => {
    const svcId = `${prefix}-svc-noop`;
    db.prepare(`
      INSERT INTO store_services
      (id, store_id, service_type, name, category, description, base_price_cents, member_price_cents, price_on_assessment, size_variants_json, duration_minutes, requires_prior_session, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, 'wash', ?, 'wash', NULL, 3000, NULL, 0, '[]', 45, 0, 1, 1, datetime('now'), datetime('now'))
    `).run(svcId, storeA, `${prefix} Noop Svc`);

    const res = await request(app)
      .put(`/api/v1/stores/${storeA}/services/${svcId}`)
      .set('Authorization', `Bearer ${manager.token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('VALIDATION');
  });

  // ── GET /stores/:id/membership-plans ─────────────────────────────────────────

  test('GET /stores/:id/membership-plans returns parsed arrays', async () => {
    const planId = `${prefix}-plan-read`;
    db.prepare(`
      INSERT INTO store_membership_plans
      (id, store_id, name, description, price_monthly_cents, price_yearly_cents, included_service_types_json, perks_json, is_highlighted, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, NULL, 4900, NULL, '["wash","groom"]', '["Perk A","Perk B"]', 0, 1, 1, datetime('now'), datetime('now'))
    `).run(planId, storeA, `${prefix} Read Plan`);

    const res = await request(app)
      .get(`/api/v1/stores/${storeA}/membership-plans`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(res.status).toBe(200);
    const row = (res.body.data || []).find((p) => p.id === planId);
    expect(row).toBeTruthy();
    expect(Array.isArray(row.included_service_types)).toBe(true);
    expect(row.included_service_types).toContain('wash');
    expect(Array.isArray(row.perks)).toBe(true);
    expect(row.perks).toContain('Perk A');
    expect(row.included_service_types_json).toBeUndefined();
    expect(row.perks_json).toBeUndefined();
  });

  test('GET /stores/:id/membership-plans hides inactive from customer even with include_inactive', async () => {
    const planId = `${prefix}-plan-inact-cust`;
    db.prepare(`
      INSERT INTO store_membership_plans
      (id, store_id, name, description, price_monthly_cents, price_yearly_cents, included_service_types_json, perks_json, is_highlighted, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, NULL, 4900, NULL, '[]', '[]', 0, 0, 1, datetime('now'), datetime('now'))
    `).run(planId, storeA, `${prefix} Inactive Plan Cust`);

    const res = await request(app)
      .get(`/api/v1/stores/${storeA}/membership-plans?include_inactive=true`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(res.status).toBe(200);
    // Flag silently ignored for customers — inactive row must not appear
    expect((res.body.data || []).find((p) => p.id === planId)).toBeUndefined();
  });

  // ── GET /stores/:id/promotions ────────────────────────────────────────────────

  test('GET /stores/:id/promotions returns parsed arrays and filters by time window', async () => {
    const activePromoId = `${prefix}-promo-active`;
    const futurePromoId = `${prefix}-promo-future`;
    db.prepare(`
      INSERT INTO store_promotions
      (id, store_id, title, description, type, discount_percent, discount_value_cents, max_discount_cents, applies_to_service_ids_json, eligibility, coupon_code, is_stackable, priority, usage_limit_total, usage_limit_per_user, valid_from, valid_until, is_active, created_at, updated_at)
      VALUES (?, ?, ?, NULL, 'pct_off', 10, NULL, NULL, '[]', 'all', NULL, 0, 0, NULL, NULL, datetime('now', '-1 day'), datetime('now', '+7 days'), 1, datetime('now'), datetime('now'))
    `).run(activePromoId, storeA, `${prefix} Active Promo`);
    db.prepare(`
      INSERT INTO store_promotions
      (id, store_id, title, description, type, discount_percent, discount_value_cents, max_discount_cents, applies_to_service_ids_json, eligibility, coupon_code, is_stackable, priority, usage_limit_total, usage_limit_per_user, valid_from, valid_until, is_active, created_at, updated_at)
      VALUES (?, ?, ?, NULL, 'pct_off', 5, NULL, NULL, '[]', 'all', NULL, 0, 0, NULL, NULL, datetime('now', '+3 days'), datetime('now', '+10 days'), 1, datetime('now'), datetime('now'))
    `).run(futurePromoId, storeA, `${prefix} Future Promo`);

    const custRes = await request(app)
      .get(`/api/v1/stores/${storeA}/promotions`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(custRes.status).toBe(200);
    const custData = custRes.body.data || [];
    expect(custData.find((p) => p.id === activePromoId)).toBeTruthy();
    expect(custData.find((p) => p.id === futurePromoId)).toBeUndefined();
    // Verify parsed array (no raw JSON field)
    const activeRow = custData.find((p) => p.id === activePromoId);
    expect(Array.isArray(activeRow.applies_to_service_ids)).toBe(true);
    expect(activeRow.applies_to_service_ids_json).toBeUndefined();

    // Manager with include_inactive sees both
    const mgrRes = await request(app)
      .get(`/api/v1/stores/${storeA}/promotions?include_inactive=true`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(mgrRes.body.data.find((p) => p.id === futurePromoId)).toBeTruthy();
  });

  // ── Step 8 regression: plan CRUD ─────────────────────────────────────────────

  test('POST /stores/:id/membership-plans creates a plan (manager)', async () => {
    const res = await request(app)
      .post(`/api/v1/stores/${storeA}/membership-plans`)
      .set('Authorization', `Bearer ${manager.token}`)
      .send({
        name: `${prefix} Basic Plan`,
        price_monthly_cents: 4900,
        price_yearly_cents: null,
        included_service_types: ['wash'],
        perks: ['Unlimited washes'],
        is_highlighted: false,
        sort_order: 1,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.price_monthly_cents).toBe(4900);
    expect(Array.isArray(res.body.data.included_service_types)).toBe(true);
    expect(Array.isArray(res.body.data.perks)).toBe(true);
  });

  test('DELETE /stores/:id/membership-plans/:pid deactivates and reactivates', async () => {
    const planId = `${prefix}-plan-deact`;
    db.prepare(`
      INSERT INTO store_membership_plans
      (id, store_id, name, description, price_monthly_cents, price_yearly_cents, included_service_types_json, perks_json, is_highlighted, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, NULL, 5500, NULL, '["wash"]', '[]', 0, 1, 1, datetime('now'), datetime('now'))
    `).run(planId, storeA, `${prefix} Plan Deact`);

    const del = await request(app)
      .delete(`/api/v1/stores/${storeA}/membership-plans/${planId}`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(del.status).toBe(200);

    // Hidden from customers
    const custRes = await request(app)
      .get(`/api/v1/stores/${storeA}/membership-plans`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect((custRes.body.data || []).find((p) => p.id === planId)).toBeUndefined();

    // Visible to manager with include_inactive
    const mgrRes = await request(app)
      .get(`/api/v1/stores/${storeA}/membership-plans?include_inactive=true`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect((mgrRes.body.data || []).find((p) => p.id === planId)).toBeTruthy();

    // Reactivate via PUT
    const react = await request(app)
      .put(`/api/v1/stores/${storeA}/membership-plans/${planId}`)
      .set('Authorization', `Bearer ${manager.token}`)
      .send({ is_active: true });
    expect(react.status).toBe(200);
    expect(react.body.data.is_active).toBe(1);
  });

  // ── Step 8 regression: promotion CRUD ────────────────────────────────────────

  test('POST /stores/:id/promotions creates a promotion (manager)', async () => {
    const validFrom = sqlDateOffset(-1);
    const validUntil = sqlDateOffset(7);
    const res = await request(app)
      .post(`/api/v1/stores/${storeA}/promotions`)
      .set('Authorization', `Bearer ${manager.token}`)
      .send({
        title: `${prefix} 10% Off`,
        type: 'pct_off',
        discount_percent: 10,
        eligibility: 'all',
        is_stackable: false,
        priority: 0,
        valid_from: validFrom,
        valid_until: validUntil,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.discount_percent).toBe(10);
    expect(Array.isArray(res.body.data.applies_to_service_ids)).toBe(true);
  });

  test('POST /stores/:id/promotions blocked for out-of-scope manager', async () => {
    const res = await request(app)
      .post(`/api/v1/stores/${storeB}/promotions`)
      .set('Authorization', `Bearer ${manager.token}`)
      .send({ title: 'Bad', type: 'info', valid_from: sqlDateOffset(0), valid_until: sqlDateOffset(1) });
    expect(res.status).toBe(403);
  });

  // ── GET /memberships/me ───────────────────────────────────────────────────────

  test('GET /memberships/me returns only active memberships for the requesting user', async () => {
    const activeMid = `${prefix}-me-active`;
    const cancelledMid = `${prefix}-me-cancelled`;
    db.prepare(`
      INSERT INTO user_memberships
      (id, user_id, dog_id, store_id, plan_id, status, started_at, expires_at, created_at, updated_at)
      VALUES (?, ?, NULL, ?, ?, 'active', datetime('now'), NULL, datetime('now'), datetime('now'))
    `).run(activeMid, customer.user.id, storeA, `${prefix}-plan-me`);
    db.prepare(`
      INSERT INTO user_memberships
      (id, user_id, dog_id, store_id, plan_id, status, started_at, expires_at, created_at, updated_at)
      VALUES (?, ?, NULL, ?, ?, 'cancelled', datetime('now'), datetime('now'), datetime('now'), datetime('now'))
    `).run(cancelledMid, customer.user.id, storeA, `${prefix}-plan-me`);

    const res = await request(app)
      .get('/api/v1/memberships/me')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(res.status).toBe(200);
    const ids = (res.body.data || []).map((m) => m.id);
    expect(ids).toContain(activeMid);
    expect(ids).not.toContain(cancelledMid);
  });

  test('GET /memberships/me scoped by store_id returns only that store', async () => {
    const midA = `${prefix}-me-scope-a`;
    const midB = `${prefix}-me-scope-b`;
    db.prepare(`
      INSERT INTO user_memberships
      (id, user_id, dog_id, store_id, plan_id, status, started_at, expires_at, created_at, updated_at)
      VALUES (?, ?, NULL, ?, ?, 'active', datetime('now'), NULL, datetime('now'), datetime('now'))
    `).run(midA, customer.user.id, storeA, `${prefix}-plan-scope`);
    // storeB: customer can access because canAccessStoreScopedRecord allows customers to see active stores
    db.prepare(`
      INSERT INTO user_memberships
      (id, user_id, dog_id, store_id, plan_id, status, started_at, expires_at, created_at, updated_at)
      VALUES (?, ?, NULL, ?, ?, 'active', datetime('now'), NULL, datetime('now'), datetime('now'))
    `).run(midB, customer.user.id, storeB, `${prefix}-plan-scope`);

    const res = await request(app)
      .get(`/api/v1/memberships/me?store_id=${storeA}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(res.status).toBe(200);
    const ids = (res.body.data || []).map((m) => m.id);
    expect(ids).toContain(midA);
    expect(ids).not.toContain(midB);
  });

  test('GET /memberships/me does not return other users memberships', async () => {
    const otherMid = `${prefix}-me-other`;
    db.prepare(`
      INSERT INTO user_memberships
      (id, user_id, dog_id, store_id, plan_id, status, started_at, expires_at, created_at, updated_at)
      VALUES (?, ?, NULL, ?, ?, 'active', datetime('now'), NULL, datetime('now'), datetime('now'))
    `).run(otherMid, otherCustomer.user.id, storeA, `${prefix}-plan-other`);

    const res = await request(app)
      .get('/api/v1/memberships/me')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(res.status).toBe(200);
    expect((res.body.data || []).find((m) => m.id === otherMid)).toBeUndefined();
  });

  // ── GET /coupons/me ───────────────────────────────────────────────────────────

  test('GET /coupons/me returns claimed coupons with joined promotion fields', async () => {
    const promoId = `${prefix}-promo-coup-me`;
    db.prepare(`
      INSERT INTO store_promotions
      (id, store_id, title, description, type, discount_percent, discount_value_cents, max_discount_cents, applies_to_service_ids_json, eligibility, coupon_code, is_stackable, priority, usage_limit_total, usage_limit_per_user, valid_from, valid_until, is_active, created_at, updated_at)
      VALUES (?, ?, ?, NULL, 'pct_off', 10, NULL, NULL, '[]', 'all', NULL, 0, 0, NULL, NULL, ?, ?, 1, datetime('now'), datetime('now'))
    `).run(promoId, storeA, `${prefix} Coup Me Promo`, sqlDateOffset(-1), sqlDateOffset(7));
    const couponId = `${prefix}-coupon-me`;
    db.prepare(`
      INSERT INTO user_coupons
      (id, user_id, promotion_id, store_id, coupon_code, claimed_at, used_at, expires_at, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, datetime('now'), NULL, ?, 'available', datetime('now'), datetime('now'))
    `).run(couponId, customer.user.id, promoId, storeA, sqlDateOffset(7));

    const res = await request(app)
      .get('/api/v1/coupons/me')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(res.status).toBe(200);
    const row = (res.body.data || []).find((c) => c.id === couponId);
    expect(row).toBeTruthy();
    expect(row.promotion_title).toBeTruthy();
    expect(row.promotion_valid_until).toBeTruthy();
  });

  test('GET /coupons/me does not return other users coupons', async () => {
    const promoId = `${prefix}-promo-coup-isolation`;
    db.prepare(`
      INSERT INTO store_promotions
      (id, store_id, title, description, type, discount_percent, discount_value_cents, max_discount_cents, applies_to_service_ids_json, eligibility, coupon_code, is_stackable, priority, usage_limit_total, usage_limit_per_user, valid_from, valid_until, is_active, created_at, updated_at)
      VALUES (?, ?, ?, NULL, 'pct_off', 5, NULL, NULL, '[]', 'all', NULL, 0, 0, NULL, NULL, ?, ?, 1, datetime('now'), datetime('now'))
    `).run(promoId, storeA, `${prefix} Isolation Promo`, sqlDateOffset(-1), sqlDateOffset(7));
    const otherCouponId = `${prefix}-coupon-other`;
    db.prepare(`
      INSERT INTO user_coupons
      (id, user_id, promotion_id, store_id, coupon_code, claimed_at, used_at, expires_at, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, datetime('now'), NULL, ?, 'available', datetime('now'), datetime('now'))
    `).run(otherCouponId, otherCustomer.user.id, promoId, storeA, sqlDateOffset(7));

    const res = await request(app)
      .get('/api/v1/coupons/me')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(res.status).toBe(200);
    expect((res.body.data || []).find((c) => c.id === otherCouponId)).toBeUndefined();
  });

  test('DELETE /stores/:id/promotions/:pid deactivates and manager sees it with include_inactive', async () => {
    const promoId = `${prefix}-promo-deact`;
    db.prepare(`
      INSERT INTO store_promotions
      (id, store_id, title, description, type, discount_percent, discount_value_cents, max_discount_cents, applies_to_service_ids_json, eligibility, coupon_code, is_stackable, priority, usage_limit_total, usage_limit_per_user, valid_from, valid_until, is_active, created_at, updated_at)
      VALUES (?, ?, ?, NULL, 'pct_off', 15, NULL, NULL, '[]', 'all', NULL, 0, 0, NULL, NULL, datetime('now', '-1 day'), datetime('now', '+7 days'), 1, datetime('now'), datetime('now'))
    `).run(promoId, storeA, `${prefix} Promo Deact`);

    const del = await request(app)
      .delete(`/api/v1/stores/${storeA}/promotions/${promoId}`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(del.status).toBe(200);

    // Not visible in normal customer view
    const custRes = await request(app)
      .get(`/api/v1/stores/${storeA}/promotions`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect((custRes.body.data || []).find((p) => p.id === promoId)).toBeUndefined();

    // Visible to manager with include_inactive=true (bypasses active+time filter)
    const mgrRes = await request(app)
      .get(`/api/v1/stores/${storeA}/promotions?include_inactive=true`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect((mgrRes.body.data || []).find((p) => p.id === promoId)).toBeTruthy();
  });
});

