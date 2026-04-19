const { app, db, request, createTestUser } = require('./helpers');
const { v4: uuidv4 } = require('uuid');

describe('PUT /api/v1/appointments/:id - reschedule validation', () => {
  let customer;
  let storeId;
  let apptId;
  const prefix = `appt-upd-${Date.now()}`;
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  beforeEach(() => {
    storeId = `${prefix}-store`;

    db.prepare(`
      INSERT INTO stores (id, name, slug, timezone, is_active, settings_json, created_at, updated_at)
      VALUES (?, ?, ?, 'America/Los_Angeles', 1, '{}', datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, is_active = 1, updated_at = datetime('now')
    `).run(storeId, `${prefix} Store`, `${prefix}-store`);

    customer = createTestUser('customer', { email: `${prefix}-cust@unforgettablerides.test`, store_id: storeId });

    // Ensure store hours 9-18
    const upsertSetting = db.prepare(`
      INSERT INTO store_settings_by_store (store_id, key, value, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    upsertSetting.run(storeId, 'store_open_hour', '9');
    upsertSetting.run(storeId, 'store_close_hour', '18');
    upsertSetting.run(storeId, 'max_concurrent_appointments', '1');
    upsertSetting.run(storeId, 'appointment_slot_minutes', '30');

    apptId = uuidv4();
    db.prepare(`
      INSERT INTO appointments (id, user_id, dog_id, dog_name, customer_name, customer_phone, service_type, date, time, duration_minutes, status, notes, booked_via, store_id)
      VALUES (?, ?, NULL, ?, NULL, NULL, 'wash', ?, '10:00', 30, 'confirmed', NULL, 'form', ?)
    `).run(apptId, customer.user.id, `${prefix}-dog`, tomorrow, storeId);
  });

  afterEach(() => {
    db.prepare('DELETE FROM appointments WHERE id LIKE ? OR dog_name LIKE ?').run(`${prefix}%`, `${prefix}%`);
    db.prepare('DELETE FROM store_settings_by_store WHERE store_id = ?').run(storeId);
    if (customer?.user?.id) {
      db.prepare('DELETE FROM user_store_links WHERE user_id = ?').run(customer.user.id);
      db.prepare('DELETE FROM users WHERE id = ?').run(customer.user.id);
    }
    db.prepare('DELETE FROM stores WHERE id = ?').run(storeId);
  });

  test('rejects invalid service_type', async () => {
    const res = await request(app)
      .put(`/api/v1/appointments/${apptId}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ service_type: 'fake_service' });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_REQUEST');
    expect(res.body?.error?.message).toMatch(/service_type/i);
  });

  test('rejects time outside store hours', async () => {
    const res = await request(app)
      .put(`/api/v1/appointments/${apptId}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ date: tomorrow, time: '06:00', duration_minutes: 30 });

    expect(res.status).toBe(409);
    expect(res.body?.error?.code).toBe('OUTSIDE_SERVICE_HOURS');
  });

  test('rejects misaligned slot', async () => {
    const res = await request(app)
      .put(`/api/v1/appointments/${apptId}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ date: tomorrow, time: '10:15', duration_minutes: 30 });

    expect(res.status).toBe(409);
    expect(res.body?.error?.code).toBe('INVALID_SLOT_ALIGNMENT');
  });

  test('rejects SLOT_UNAVAILABLE when slot is fully booked', async () => {
    // Insert another appointment at 11:00 to fill that slot (max_concurrent=1)
    const otherId = uuidv4();
    db.prepare(`
      INSERT INTO appointments (id, user_id, dog_id, dog_name, customer_name, customer_phone, service_type, date, time, duration_minutes, status, notes, booked_via, store_id)
      VALUES (?, ?, NULL, ?, NULL, NULL, 'wash', ?, '11:00', 30, 'confirmed', NULL, 'form', ?)
    `).run(otherId, customer.user.id, `${prefix}-dog2`, tomorrow, storeId);

    const res = await request(app)
      .put(`/api/v1/appointments/${apptId}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ date: tomorrow, time: '11:00', duration_minutes: 30 });

    expect(res.status).toBe(409);
    expect(res.body?.error?.code).toBe('SLOT_UNAVAILABLE');
  });

  test('allows reschedule to an open slot', async () => {
    const res = await request(app)
      .put(`/api/v1/appointments/${apptId}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ date: tomorrow, time: '14:00', duration_minutes: 30 });

    expect(res.status).toBe(200);
    expect(res.body?.data?.time).toBe('14:00');
    expect(res.body?.data?.date).toBe(tomorrow);
    expect(res.body?.data?.email_sent_to).toBe(customer.user.email);
  });

  test('returns email_sent_to on create', async () => {
    const createRes = await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        dog_name: `${prefix}-new-dog`,
        service_type: 'wash',
        date: tomorrow,
        time: '15:00',
        duration_minutes: 30,
        store_id: storeId,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body?.data?.email_sent_to).toBe(customer.user.email);
  });

  test('returns email_sent_to on cancel', async () => {
    const cancelRes = await request(app)
      .delete(`/api/v1/appointments/${apptId}`)
      .set('Authorization', `Bearer ${customer.token}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body?.data?.cancelled).toBe(true);
    expect(cancelRes.body?.data?.email_sent_to).toBe(customer.user.email);
  });

  test('allows updating same slot without self-conflict', async () => {
    // Updating notes without changing time should succeed even with max_concurrent=1
    const res = await request(app)
      .put(`/api/v1/appointments/${apptId}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ notes: 'updated notes' });

    expect(res.status).toBe(200);
    expect(res.body?.data?.notes).toBe('updated notes');
  });

  test('rejects invalid date format', async () => {
    const res = await request(app)
      .put(`/api/v1/appointments/${apptId}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ date: 'not-a-date', time: '10:00', duration_minutes: 30 });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_REQUEST');
    expect(res.body?.error?.message).toMatch(/date or time/i);
  });

  test('rejects invalid time format', async () => {
    const res = await request(app)
      .put(`/api/v1/appointments/${apptId}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ date: tomorrow, time: '25:99', duration_minutes: 30 });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_REQUEST');
    expect(res.body?.error?.message).toMatch(/date or time/i);
  });

  test('rejects invalid duration (zero)', async () => {
    const res = await request(app)
      .put(`/api/v1/appointments/${apptId}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ date: tomorrow, time: '10:00', duration_minutes: 0 });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_REQUEST');
    expect(res.body?.error?.message).toMatch(/duration_minutes/i);
  });

  test('rejects invalid duration (exceeds max)', async () => {
    const res = await request(app)
      .put(`/api/v1/appointments/${apptId}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ date: tomorrow, time: '10:00', duration_minutes: 300 });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_REQUEST');
    expect(res.body?.error?.message).toMatch(/duration_minutes/i);
  });

  test('rejects duration that overflows past store close', async () => {
    const res = await request(app)
      .put(`/api/v1/appointments/${apptId}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ date: tomorrow, time: '17:30', duration_minutes: 60 });

    expect(res.status).toBe(409);
    expect(res.body?.error?.code).toBe('OUTSIDE_SERVICE_HOURS');
  });

  test('returns 404 for nonexistent appointment', async () => {
    const res = await request(app)
      .put(`/api/v1/appointments/${uuidv4()}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ notes: 'hello' });

    expect(res.status).toBe(404);
    expect(res.body?.error?.code).toBe('NOT_FOUND');
  });

  test('customer cannot update another user appointment', async () => {
    const other = createTestUser('customer', { email: `${prefix}-other@unforgettablerides.test`, store_id: storeId });

    const res = await request(app)
      .put(`/api/v1/appointments/${apptId}`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ notes: 'hijack' });

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');

    // Verify original unchanged
    const row = db.prepare('SELECT notes FROM appointments WHERE id = ?').get(apptId);
    expect(row.notes).toBeNull();

    // Cleanup extra user
    db.prepare('DELETE FROM users WHERE id = ?').run(other.user.id);
  });

  test('customer cannot change status field', async () => {
    const res = await request(app)
      .put(`/api/v1/appointments/${apptId}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ status: 'cancelled', notes: 'trying to cancel via status' });

    expect(res.status).toBe(200);
    // Status should remain confirmed - field silently ignored for customers
    expect(res.body?.data?.status).toBe('confirmed');
    expect(res.body?.data?.notes).toBe('trying to cancel via status');
  });

  test('staff can change status field', async () => {
    const staff = createTestUser('staff', { email: `${prefix}-staff@unforgettablerides.test`, store_id: storeId });

    const res = await request(app)
      .put(`/api/v1/appointments/${apptId}`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ status: 'in_progress' });

    expect(res.status).toBe(200);
    expect(res.body?.data?.status).toBe('in_progress');

    db.prepare('DELETE FROM users WHERE id = ?').run(staff.user.id);
  });

  test('normalizes uppercase service_type to lowercase', async () => {
    const res = await request(app)
      .put(`/api/v1/appointments/${apptId}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ service_type: 'GROOM', date: tomorrow, time: '12:00', duration_minutes: 60 });

    expect(res.status).toBe(200);
    expect(res.body?.data?.service_type).toBe('groom');
  });

  test('rejects disabled service type on reschedule', async () => {
    db.prepare(`
      INSERT INTO store_settings_by_store (store_id, key, value, updated_at)
      VALUES (?, 'appointment_service_enabled_groom', '0', datetime('now'))
      ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(storeId);

    const res = await request(app)
      .put(`/api/v1/appointments/${apptId}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ service_type: 'groom', date: tomorrow, time: '10:00', duration_minutes: 60 });

    expect(res.status).toBe(409);
    expect(res.body?.error?.code).toBe('SERVICE_DISABLED');
  });
});

