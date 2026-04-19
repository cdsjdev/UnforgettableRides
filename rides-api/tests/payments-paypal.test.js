const { app, db, request, createTestUser } = require('./helpers');

describe('PayPal payments routing', () => {
  const prefix = `payments-paypal-${Date.now()}`;

  afterAll(() => {
    db.prepare("DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE customer_name LIKE ?)").run(`${prefix}%`);
    db.prepare("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE customer_name LIKE ?)").run(`${prefix}%`);
    db.prepare("DELETE FROM orders WHERE customer_name LIKE ?").run(`${prefix}%`);
    db.prepare("DELETE FROM users WHERE email LIKE ?").run(`${prefix}%`);
  });

  function createPendingOrder(userId, customerName) {
    const id = `order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    db.prepare(`
      INSERT INTO orders (id, user_id, customer_name, customer_email, status, total, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'pending', 24.99, datetime('now'), datetime('now'))
    `).run(id, userId, customerName, `${customerName}@petcare.test`);
    return id;
  }

  test('GET /api/v1/payments/config includes paypal_enabled flag', async () => {
    const res = await request(app).get('/api/v1/payments/config');
    expect(res.status).toBe(200);
    expect(typeof res.body?.data?.paypal_enabled).toBe('boolean');
    expect(typeof res.body?.data?.paypal_client_id).toBe('string');
    expect(typeof res.body?.data?.paypal_environment).toBe('string');
  });

  test('POST /api/v1/payments/paypal/create-order requires auth', async () => {
    const res = await request(app)
      .post('/api/v1/payments/paypal/create-order')
      .send({ order_id: 'any' });
    expect(res.status).toBe(401);
  });

  test('POST /api/v1/payments/paypal/capture-order requires auth', async () => {
    const res = await request(app)
      .post('/api/v1/payments/paypal/capture-order')
      .send({ order_id: 'any', paypal_order_id: 'any' });
    expect(res.status).toBe(401);
  });

  test('POST /api/v1/payments/paypal/create-order returns 400 without order_id', async () => {
    const user = createTestUser('customer', { email: `${prefix}-noid@petcare.test` });
    const res = await request(app)
      .post('/api/v1/payments/paypal/create-order')
      .set('Authorization', `Bearer ${user.token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('VALIDATION');
  });

  test('POST /api/v1/payments/paypal/create-order returns 404 for missing order', async () => {
    const user = createTestUser('customer', { email: `${prefix}-notfound@petcare.test` });
    const res = await request(app)
      .post('/api/v1/payments/paypal/create-order')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ order_id: 'order-does-not-exist' });
    expect(res.status).toBe(404);
    expect(res.body?.error?.code).toBe('NOT_FOUND');
  });

  test('POST /api/v1/payments/paypal/create-order returns 403 for another user\'s order', async () => {
    const owner = createTestUser('customer', { email: `${prefix}-owner@petcare.test` });
    const other = createTestUser('customer', { email: `${prefix}-other@petcare.test` });
    const orderId = createPendingOrder(owner.user.id, `${prefix}-owner`);

    const res = await request(app)
      .post('/api/v1/payments/paypal/create-order')
      .set('Authorization', `Bearer ${other.token}`)
      .send({ order_id: orderId });
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  });

  test('POST /api/v1/payments/paypal/create-order returns 503 when PayPal not configured', async () => {
    const user = createTestUser('customer', { email: `${prefix}-nocfg@petcare.test` });
    const orderId = createPendingOrder(user.user.id, `${prefix}-nocfg`);

    const res = await request(app)
      .post('/api/v1/payments/paypal/create-order')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ order_id: orderId });

    expect(res.status).toBe(503);
    expect(res.body?.error?.code).toBe('PAYPAL_NOT_CONFIGURED');
  });

  test('POST /api/v1/payments/paypal/capture-order returns 400 without required fields', async () => {
    const user = createTestUser('customer', { email: `${prefix}-cap-noid@petcare.test` });
    const res = await request(app)
      .post('/api/v1/payments/paypal/capture-order')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ order_id: 'any' }); // missing paypal_order_id
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('VALIDATION');
  });

  test('POST /api/v1/payments/paypal/capture-order returns 404 for missing order', async () => {
    const user = createTestUser('customer', { email: `${prefix}-cap-notfound@petcare.test` });
    const res = await request(app)
      .post('/api/v1/payments/paypal/capture-order')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ order_id: 'order-does-not-exist', paypal_order_id: 'pp-123' });
    expect(res.status).toBe(404);
    expect(res.body?.error?.code).toBe('NOT_FOUND');
  });

  test('POST /api/v1/payments/paypal/capture-order returns 403 for another user\'s order', async () => {
    const owner = createTestUser('customer', { email: `${prefix}-cap-owner@petcare.test` });
    const other = createTestUser('customer', { email: `${prefix}-cap-other@petcare.test` });
    const orderId = createPendingOrder(owner.user.id, `${prefix}-cap-owner`);

    const res = await request(app)
      .post('/api/v1/payments/paypal/capture-order')
      .set('Authorization', `Bearer ${other.token}`)
      .send({ order_id: orderId, paypal_order_id: 'pp-123' });
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  });

  test('POST /api/v1/payments/paypal/capture-order rejects non-pending order', async () => {
    const user = createTestUser('customer', { email: `${prefix}-cap-nonpending@petcare.test` });
    const orderId = createPendingOrder(user.user.id, `${prefix}-cap-nonpending`);
    db.prepare("UPDATE orders SET status = 'confirmed' WHERE id = ?").run(orderId);

    const res = await request(app)
      .post('/api/v1/payments/paypal/capture-order')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ order_id: orderId, paypal_order_id: 'pp-123' });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('ORDER_NOT_PAYABLE');
  });

  test('POST /api/v1/payments/paypal/capture-order idempotent for already-succeeded payment', async () => {
    const user = createTestUser('customer', { email: `${prefix}-cap-idem@petcare.test` });
    const orderId = createPendingOrder(user.user.id, `${prefix}-cap-idem`);

    // Seed a succeeded payment directly
    const paymentId = `pay-test-${Date.now()}`;
    db.prepare(`
      INSERT INTO payments (id, order_id, provider, provider_payment_id, amount, currency, status, payment_method, created_at, updated_at)
      VALUES (?, ?, 'paypal', 'pp-already-captured', 2499, 'usd', 'succeeded', 'paypal', datetime('now'), datetime('now'))
    `).run(paymentId, orderId);

    const res = await request(app)
      .post('/api/v1/payments/paypal/capture-order')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ order_id: orderId, paypal_order_id: 'pp-already-captured' });

    expect(res.status).toBe(200);
    expect(res.body?.data?.status).toBe('succeeded');
    expect(res.body?.data?.payment_id).toBe(paymentId);
  });
});
