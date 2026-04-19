const { app, db, request, createTestUser } = require('./helpers');

describe('Store scope safety - commerce, appointments, and advisor routes', () => {
  let manager;
  let prefix;
  let storeA;
  let storeB;
  let storeC;

  beforeEach(() => {
    prefix = `scope-routes-${Date.now()}`;
    storeA = `${prefix}-a`;
    storeB = `${prefix}-b`;
    storeC = `${prefix}-c`;

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
    upsertStore.run(storeC, `${prefix} Store C`, `${prefix}-store-c`);

    manager = createTestUser('store_manager', { email: `${prefix}-mgr@unforgettablerides.test` });
    const upsertLink = db.prepare(`
      INSERT INTO user_store_links (user_id, store_id, is_active, created_at, updated_at)
      VALUES (?, ?, 1, datetime('now'), datetime('now'))
      ON CONFLICT(user_id, store_id) DO UPDATE SET is_active = 1, updated_at = datetime('now')
    `);
    upsertLink.run(manager.user.id, storeA);
    upsertLink.run(manager.user.id, storeB);
    db.prepare('UPDATE users SET store_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(storeA, manager.user.id);
  });

  afterEach(() => {
    db.prepare('DELETE FROM order_items WHERE order_id LIKE ?').run(`order-${prefix}%`);
    db.prepare('DELETE FROM orders WHERE id LIKE ?').run(`order-${prefix}%`);
    db.prepare('DELETE FROM appointments WHERE id LIKE ? OR dog_name LIKE ?').run(`${prefix}%`, `${prefix}%`);
    db.prepare('DELETE FROM products WHERE id LIKE ?').run(`${prefix}%`);
    db.prepare('DELETE FROM advisor_knowledge_chunks WHERE doc_id LIKE ?').run(`${prefix}%`);
    db.prepare('DELETE FROM advisor_knowledge_docs WHERE id LIKE ?').run(`${prefix}%`);
    db.prepare('DELETE FROM store_settings_by_store WHERE store_id IN (?, ?, ?)').run(storeA, storeB, storeC);
    if (manager?.user?.id) {
      db.prepare('DELETE FROM user_store_links WHERE user_id = ?').run(manager.user.id);
      db.prepare('DELETE FROM users WHERE id = ?').run(manager.user.id);
    }
    db.prepare('DELETE FROM stores WHERE id IN (?, ?, ?)').run(storeA, storeB, storeC);
  });

  test('GET /api/v1/products is scoped to assigned stores + legacy null-store rows', async () => {
    db.prepare(`
      INSERT INTO products (id, name, category, price, stock_quantity, is_active, store_id, created_at, updated_at)
      VALUES (?, ?, 'other', 10, 10, 1, ?, datetime('now'), datetime('now'))
    `).run(`${prefix}-prod-a`, `${prefix}-prod-a`, storeA);
    db.prepare(`
      INSERT INTO products (id, name, category, price, stock_quantity, is_active, store_id, created_at, updated_at)
      VALUES (?, ?, 'other', 10, 10, 1, ?, datetime('now'), datetime('now'))
    `).run(`${prefix}-prod-b`, `${prefix}-prod-b`, storeB);
    db.prepare(`
      INSERT INTO products (id, name, category, price, stock_quantity, is_active, store_id, created_at, updated_at)
      VALUES (?, ?, 'other', 10, 10, 1, ?, datetime('now'), datetime('now'))
    `).run(`${prefix}-prod-c`, `${prefix}-prod-c`, storeC);
    db.prepare(`
      INSERT INTO products (id, name, category, price, stock_quantity, is_active, store_id, created_at, updated_at)
      VALUES (?, ?, 'other', 10, 10, 1, NULL, datetime('now'), datetime('now'))
    `).run(`${prefix}-prod-null`, `${prefix}-prod-null`);

    const res = await request(app)
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${manager.token}`);
    expect(res.status).toBe(200);

    const ids = (res.body.data || []).map((p) => p.id);
    expect(ids).toContain(`${prefix}-prod-a`);
    expect(ids).toContain(`${prefix}-prod-b`);
    expect(ids).toContain(`${prefix}-prod-null`);
    expect(ids).not.toContain(`${prefix}-prod-c`);
  });

  test('POST /api/v1/orders rejects product outside selected store scope', async () => {
    db.prepare(`
      INSERT INTO products (id, name, category, price, stock_quantity, is_active, store_id, created_at, updated_at)
      VALUES (?, ?, 'other', 12.5, 50, 1, ?, datetime('now'), datetime('now'))
    `).run(`${prefix}-prod-c`, `${prefix}-prod-c`, storeC);

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${manager.token}`)
      .send({
        customer_name: 'Scope Order',
        payment_method: 'in_store',
        store_id: storeA,
        items: [{ product_id: `${prefix}-prod-c`, quantity: 1 }],
      });

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  });

  test('GET /api/v1/appointments/availability requires store_id for multi-store manager', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const res = await request(app)
      .get(`/api/v1/appointments/availability?date=${tomorrow}`)
      .set('Authorization', `Bearer ${manager.token}`);

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('STORE_REQUIRED');
  });

  test('GET /api/v1/appointments/availability is scoped by requested store', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    db.prepare(`
      INSERT INTO store_settings_by_store (store_id, key, value, updated_at)
      VALUES (?, 'max_concurrent_appointments', '1', datetime('now'))
      ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(storeA);
    db.prepare(`
      INSERT INTO store_settings_by_store (store_id, key, value, updated_at)
      VALUES (?, 'max_concurrent_appointments', '1', datetime('now'))
      ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(storeB);

    db.prepare(`
      INSERT INTO appointments (id, user_id, dog_id, dog_name, customer_name, customer_phone, service_type, date, time, duration_minutes, status, notes, booked_via, store_id)
      VALUES (?, ?, NULL, ?, NULL, NULL, 'wash', ?, '10:00', 60, 'confirmed', NULL, 'form', ?)
    `).run(`${prefix}-appt-b`, manager.user.id, `${prefix}-dog-b`, tomorrow, storeB);

    const resA = await request(app)
      .get(`/api/v1/appointments/availability?date=${tomorrow}&service_type=wash&store_id=${storeA}`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(resA.status).toBe(200);
    const slotA = (resA.body?.data?.slots || []).find((s) => s.time === '10:00');
    expect(slotA).toBeTruthy();
    expect(slotA.available).toBe(true);

    const resB = await request(app)
      .get(`/api/v1/appointments/availability?date=${tomorrow}&service_type=wash&store_id=${storeB}`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(resB.status).toBe(200);
    const slotB = (resB.body?.data?.slots || []).find((s) => s.time === '10:00');
    expect(slotB).toBeTruthy();
    expect(slotB.available).toBe(false);
  });

  test('POST /api/v1/advisor/rag/documents requires store_id for multi-store manager', async () => {
    const res = await request(app)
      .post('/api/v1/advisor/rag/documents')
      .set('Authorization', `Bearer ${manager.token}`)
      .send({
        title: `${prefix} Doc Missing Store`,
        content: 'scoped knowledge content',
      });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('STORE_REQUIRED');
  });

  test('GET /api/v1/advisor/rag/documents is scoped to assigned stores', async () => {
    db.prepare(`
      INSERT INTO advisor_knowledge_docs (id, store_id, title, source, content, metadata_json, is_active, created_at, updated_at)
      VALUES (?, ?, ?, NULL, ?, NULL, 1, datetime('now'), datetime('now'))
    `).run(`${prefix}-doc-a`, storeA, `${prefix}-doc-a`, 'alpha store knowledge token');
    db.prepare(`
      INSERT INTO advisor_knowledge_docs (id, store_id, title, source, content, metadata_json, is_active, created_at, updated_at)
      VALUES (?, ?, ?, NULL, ?, NULL, 1, datetime('now'), datetime('now'))
    `).run(`${prefix}-doc-c`, storeC, `${prefix}-doc-c`, 'charlie store knowledge token');

    const res = await request(app)
      .get('/api/v1/advisor/rag/documents')
      .set('Authorization', `Bearer ${manager.token}`);

    expect(res.status).toBe(200);
    const ids = (res.body?.data || []).map((d) => d.id);
    expect(ids).toContain(`${prefix}-doc-a`);
    expect(ids).not.toContain(`${prefix}-doc-c`);
  });

  test('POST /api/v1/advisor/rag/retrieve excludes out-of-scope store chunks', async () => {
    db.prepare(`
      INSERT INTO advisor_knowledge_docs (id, store_id, title, source, content, metadata_json, is_active, created_at, updated_at)
      VALUES (?, ?, ?, NULL, ?, NULL, 1, datetime('now'), datetime('now'))
    `).run(`${prefix}-doc-a`, storeA, `${prefix}-doc-a`, 'scope-token grooming guidance for store A');
    db.prepare(`
      INSERT INTO advisor_knowledge_docs (id, store_id, title, source, content, metadata_json, is_active, created_at, updated_at)
      VALUES (?, ?, ?, NULL, ?, NULL, 1, datetime('now'), datetime('now'))
    `).run(`${prefix}-doc-c`, storeC, `${prefix}-doc-c`, 'scope-token grooming guidance for store C');
    db.prepare(`
      INSERT INTO advisor_knowledge_chunks (doc_id, chunk_index, content, content_lower, token_count, created_at)
      VALUES (?, 0, ?, ?, 7, datetime('now'))
    `).run(`${prefix}-doc-a`, 'scope-token from alpha store', 'scope-token from alpha store');
    db.prepare(`
      INSERT INTO advisor_knowledge_chunks (doc_id, chunk_index, content, content_lower, token_count, created_at)
      VALUES (?, 0, ?, ?, 7, datetime('now'))
    `).run(`${prefix}-doc-c`, 'scope-token from charlie store', 'scope-token from charlie store');

    const res = await request(app)
      .post(`/api/v1/advisor/rag/retrieve?store_id=${storeA}`)
      .set('Authorization', `Bearer ${manager.token}`)
      .send({ query: 'scope-token' });

    expect(res.status).toBe(200);
    const docIds = (res.body?.data?.chunks || []).map((c) => c.doc_id);
    expect(docIds).toContain(`${prefix}-doc-a`);
    expect(docIds).not.toContain(`${prefix}-doc-c`);
  });

  test('DELETE /api/v1/advisor/rag/documents/:id cannot delete out-of-scope doc', async () => {
    db.prepare(`
      INSERT INTO advisor_knowledge_docs (id, store_id, title, source, content, metadata_json, is_active, created_at, updated_at)
      VALUES (?, ?, ?, NULL, ?, NULL, 1, datetime('now'), datetime('now'))
    `).run(`${prefix}-doc-c-del`, storeC, `${prefix}-doc-c-del`, 'delete protection');

    const res = await request(app)
      .delete(`/api/v1/advisor/rag/documents/${prefix}-doc-c-del`)
      .set('Authorization', `Bearer ${manager.token}`);

    expect(res.status).toBe(404);
    expect(res.body?.error?.code).toBe('NOT_FOUND');
  });
});

