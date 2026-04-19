const { app, db, request, createTestUser } = require('./helpers');
const { v4: uuidv4 } = require('uuid');

describe('Appointment assessment pricing with deposit', () => {
  const prefix = `appt-deposit-${Date.now()}`;
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  let storeId;
  let customer;
  let staff;
  let serviceId;

  beforeEach(() => {
    storeId = `${prefix}-store`;
    db.prepare(`
      INSERT INTO stores (id, name, slug, timezone, is_active, settings_json, created_at, updated_at)
      VALUES (?, ?, ?, 'America/Los_Angeles', 1, '{}', datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, is_active = 1, updated_at = datetime('now')
    `).run(storeId, `${prefix} Store`, `${prefix}-store`);

    const upsertSetting = db.prepare(`
      INSERT INTO store_settings_by_store (store_id, key, value, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    upsertSetting.run(storeId, 'store_open_hour', '9');
    upsertSetting.run(storeId, 'store_close_hour', '18');
    upsertSetting.run(storeId, 'appointment_slot_minutes', '30');
    upsertSetting.run(storeId, 'max_concurrent_appointments', '3');
    upsertSetting.run(storeId, 'appointment_deposit_groom', '30');
    upsertSetting.run(storeId, 'service_price_groom', '120');

    customer = createTestUser('customer', { email: `${prefix}-cust@unforgettablerides.test`, store_id: storeId });
    staff = createTestUser('staff', { email: `${prefix}-staff@unforgettablerides.test`, store_id: storeId });

    serviceId = `svc-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO store_services
      (id, store_id, service_type, name, category, description, base_price_cents, member_price_cents, price_on_assessment, size_variants_json, duration_minutes, requires_prior_session, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, 'groom', ?, 'grooming', ?, NULL, NULL, 1, '[]', 60, 0, 1, 1, datetime('now'), datetime('now'))
    `).run(serviceId, storeId, 'Bichon Blowout', 'Price assessed on site');
  });

  afterEach(() => {
    db.prepare('DELETE FROM appointment_deposit_payments WHERE user_id IN (?, ?)').run(customer.user.id, staff.user.id);
    db.prepare('DELETE FROM appointment_deposits WHERE appointment_id IN (SELECT id FROM appointments WHERE dog_name LIKE ?)').run(`${prefix}%`);
    db.prepare('DELETE FROM appointment_charges WHERE appointment_id IN (SELECT id FROM appointments WHERE dog_name LIKE ?)').run(`${prefix}%`);
    db.prepare('DELETE FROM appointments WHERE dog_name LIKE ?').run(`${prefix}%`);
    db.prepare('DELETE FROM store_services WHERE id = ?').run(serviceId);
    db.prepare('DELETE FROM store_settings_by_store WHERE store_id = ?').run(storeId);
    db.prepare('DELETE FROM user_store_links WHERE user_id IN (?, ?)').run(customer.user.id, staff.user.id);
    db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(customer.user.id, staff.user.id);
    db.prepare('DELETE FROM stores WHERE id = ?').run(storeId);
  });

  test('assessment service booking sets pricing_mode and deposit requirement', async () => {
    const depositPaymentId = `apdep-${uuidv4().slice(0, 12)}`;
    db.prepare(`
      INSERT INTO appointment_deposit_payments
      (id, user_id, store_id, service_type, store_service_id, amount, provider, provider_payment_id, status, idempotency_key, created_at, updated_at)
      VALUES (?, ?, ?, 'groom', ?, 30, 'square', ?, 'succeeded', ?, datetime('now'), datetime('now'))
    `).run(
      depositPaymentId,
      customer.user.id,
      storeId,
      serviceId,
      `sq-pay-${uuidv4().slice(0, 8)}`,
      `idemp-${uuidv4().slice(0, 8)}`
    );

    const res = await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        store_id: storeId,
        store_service_id: serviceId,
        pay_deposit_now: true,
        pay_deposit_payment_id: depositPaymentId,
        dog_name: `${prefix}-dog-1`,
        service_type: 'groom',
        date: tomorrow,
        time: '10:00',
        duration_minutes: 60,
        booked_via: 'form',
      });

    expect(res.status).toBe(201);
    expect(res.body?.data?.pricing_mode).toBe('price_on_assessment');
    expect(Number(res.body?.data?.deposit_required_amount)).toBe(30);
    expect(Number(res.body?.data?.deposit_paid_total)).toBe(30);
    expect(Boolean(res.body?.data?.is_deposit_paid)).toBe(true);
  });

  test('customer booking assessment service requires pay_deposit_now', async () => {
    const res = await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        store_id: storeId,
        store_service_id: serviceId,
        dog_name: `${prefix}-dog-no-deposit`,
        service_type: 'groom',
        date: tomorrow,
        time: '10:30',
        duration_minutes: 60,
        booked_via: 'form',
      });

    expect(res.status).toBe(409);
    expect(res.body?.error?.code).toBe('DEPOSIT_PAYMENT_REQUIRED');
  });

  test('customer booking rejects invalid pay_deposit_payment_id', async () => {
    const res = await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        store_id: storeId,
        store_service_id: serviceId,
        pay_deposit_now: true,
        pay_deposit_payment_id: 'apdep-invalid',
        dog_name: `${prefix}-dog-invalid-payment`,
        service_type: 'groom',
        date: tomorrow,
        time: '10:30',
        duration_minutes: 60,
        booked_via: 'form',
      });

    expect(res.status).toBe(409);
    expect(res.body?.error?.code).toBe('INVALID_DEPOSIT_PAYMENT');
  });

  test('deposit payment record is consumed and cannot be reused', async () => {
    const depositPaymentId = `apdep-${uuidv4().slice(0, 12)}`;
    db.prepare(`
      INSERT INTO appointment_deposit_payments
      (id, user_id, store_id, service_type, store_service_id, amount, provider, provider_payment_id, status, idempotency_key, created_at, updated_at)
      VALUES (?, ?, ?, 'groom', ?, 30, 'square', ?, 'succeeded', ?, datetime('now'), datetime('now'))
    `).run(
      depositPaymentId,
      customer.user.id,
      storeId,
      serviceId,
      `sq-pay-${uuidv4().slice(0, 8)}`,
      `idemp-${uuidv4().slice(0, 8)}`
    );

    const first = await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        store_id: storeId,
        store_service_id: serviceId,
        pay_deposit_now: true,
        pay_deposit_payment_id: depositPaymentId,
        dog_name: `${prefix}-dog-consume-1`,
        service_type: 'groom',
        date: tomorrow,
        time: '13:00',
        duration_minutes: 60,
        booked_via: 'form',
      });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        store_id: storeId,
        store_service_id: serviceId,
        pay_deposit_now: true,
        pay_deposit_payment_id: depositPaymentId,
        dog_name: `${prefix}-dog-consume-2`,
        service_type: 'groom',
        date: tomorrow,
        time: '14:00',
        duration_minutes: 60,
        booked_via: 'form',
      });
    expect(second.status).toBe(409);
    expect(second.body?.error?.code).toBe('INVALID_DEPOSIT_PAYMENT');
  });

  test('final charge is blocked until deposit is collected, then succeeds with due amount', async () => {
    const createRes = await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({
        store_id: storeId,
        store_service_id: serviceId,
        dog_name: `${prefix}-dog-2`,
        service_type: 'groom',
        date: tomorrow,
        time: '11:00',
        duration_minutes: 60,
        booked_via: 'form',
      });
    expect(createRes.status).toBe(201);
    const appointmentId = createRes.body?.data?.id;
    expect(appointmentId).toBeTruthy();

    const blockedCharge = await request(app)
      .post(`/api/v1/appointments/${appointmentId}/charge`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ base_price: 120 });
    expect(blockedCharge.status).toBe(409);
    expect(blockedCharge.body?.error?.code).toBe('DEPOSIT_REQUIRED');

    const depositRes = await request(app)
      .post(`/api/v1/appointments/${appointmentId}/deposit`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ amount: 30, note: 'bichon blowout deposit' });
    expect(depositRes.status).toBe(201);
    expect(Number(depositRes.body?.data?.amount)).toBe(30);

    const chargeRes = await request(app)
      .post(`/api/v1/appointments/${appointmentId}/charge`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ base_price: 120 });
    expect(chargeRes.status).toBe(201);
    expect(Number(chargeRes.body?.data?.final_price)).toBe(120);
    expect(Number(chargeRes.body?.data?.deposit_paid)).toBe(30);
    expect(Number(chargeRes.body?.data?.amount_due_now)).toBe(90);
  });

  test('deposit endpoint rejects non-assessment appointments', async () => {
    const fixedServiceId = `svc-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO store_services
      (id, store_id, service_type, name, category, description, base_price_cents, member_price_cents, price_on_assessment, size_variants_json, duration_minutes, requires_prior_session, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, 'groom', ?, 'grooming', ?, 9000, NULL, 0, '[]', 60, 0, 1, 2, datetime('now'), datetime('now'))
    `).run(fixedServiceId, storeId, 'Basic Groom', 'Fixed price');

    const createRes = await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        store_id: storeId,
        store_service_id: fixedServiceId,
        dog_name: `${prefix}-dog-3`,
        service_type: 'groom',
        date: tomorrow,
        time: '12:00',
        duration_minutes: 60,
        booked_via: 'form',
      });
    expect(createRes.status).toBe(201);
    const appointmentId = createRes.body?.data?.id;
    expect(appointmentId).toBeTruthy();
    expect(createRes.body?.data?.pricing_mode).toBe('fixed');

    const depositRes = await request(app)
      .post(`/api/v1/appointments/${appointmentId}/deposit`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ amount: 20 });
    expect(depositRes.status).toBe(400);
    expect(depositRes.body?.error?.code).toBe('DEPOSIT_NOT_APPLICABLE');

    db.prepare('DELETE FROM store_services WHERE id = ?').run(fixedServiceId);
  });
});

