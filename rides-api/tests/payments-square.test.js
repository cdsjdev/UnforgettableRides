const { app, db, request, createTestUser } = require('./helpers');

describe('Square payments routing', () => {
  const prefix = `payments-square-${Date.now()}`;

  afterAll(() => {
    db.prepare("DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE customer_name LIKE ?)").run(`${prefix}%`);
    db.prepare("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE customer_name LIKE ?)").run(`${prefix}%`);
    db.prepare("DELETE FROM orders WHERE customer_name LIKE ?").run(`${prefix}%`);
    db.prepare("DELETE FROM users WHERE email LIKE ?").run(`${prefix}%`);
  });

  function createPendingOrderForUser(userId, customerName) {
    const id = `order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    db.prepare(`
      INSERT INTO orders (id, user_id, customer_name, customer_email, status, total, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'pending', 19.99, datetime('now'), datetime('now'))
    `).run(id, userId, customerName, `${customerName}@petcare.test`);
    return id;
  }

  test('GET /api/v1/payments/config returns provider metadata', async () => {
    const res = await request(app).get('/api/v1/payments/config');
    expect(res.status).toBe(200);
    expect(res.body?.data?.provider).toBeTruthy();
    expect(typeof res.body?.data?.square_enabled).toBe('boolean');
    expect(typeof res.body?.data?.stripe_enabled).toBe('boolean');
  });

  test('POST /api/v1/payments/create-intent returns provider-changed for verified user', async () => {
    const user = createTestUser('customer', { email: `${prefix}-compat@petcare.test` });
    db.prepare("UPDATE users SET email_verified_at = datetime('now') WHERE id = ?").run(user.user.id);
    const res = await request(app)
      .post('/api/v1/payments/create-intent')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ order_id: 'any' });
    expect(res.status).toBe(410);
    expect(res.body?.error?.code).toBe('PAYMENT_PROVIDER_CHANGED');
  });

  test('POST /api/v1/payments/square/create-payment returns actionable provider error when unavailable', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const user = createTestUser('customer', { email: `${prefix}-nocfg@petcare.test` });
    db.prepare("UPDATE users SET email_verified_at = datetime('now') WHERE id = ?").run(user.user.id);
    const orderId = createPendingOrderForUser(user.user.id, `${prefix}-customer`);

    const res = await request(app)
      .post('/api/v1/payments/square/create-payment')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        order_id: orderId,
        source_id: 'invalid-source-id',
      });

    try {
      expect([503, 500]).toContain(res.status);
      if (res.status === 503) {
        expect(['SQUARE_NOT_CONFIGURED', 'SQUARE_AUTH_ERROR']).toContain(res.body?.error?.code);
      } else {
        expect(['PAYMENT_ERROR', 'DB_ERROR']).toContain(res.body?.error?.code);
      }
    } finally {
      errorSpy.mockRestore();
    }
  });
});
