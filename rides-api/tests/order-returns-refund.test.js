const { app, db, request, createTestUser } = require('./helpers');

describe('Order return refund completion', () => {
  const prefix = `order-return-refund-${Date.now()}`;

  afterAll(() => {
    db.prepare("DELETE FROM order_returns WHERE order_id IN (SELECT id FROM orders WHERE customer_name LIKE ?)").run(`${prefix}%`);
    db.prepare("DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE customer_name LIKE ?)").run(`${prefix}%`);
    db.prepare("DELETE FROM orders WHERE customer_name LIKE ?").run(`${prefix}%`);
    db.prepare("DELETE FROM users WHERE email LIKE ?").run(`${prefix}%`);
  });

  function insertOrderAndReturn({ userId, status = 'refund_pending' }) {
    const orderId = `order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const returnId = `ret-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const customerName = `${prefix}-${Math.random().toString(36).slice(2, 6)}`;

    db.prepare(`
      INSERT INTO orders (id, user_id, customer_name, customer_email, status, total, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'confirmed', 19.99, datetime('now'), datetime('now'))
    `).run(orderId, userId, customerName, `${customerName}@petcare.test`);

    db.prepare(`
      INSERT INTO order_returns
        (id, order_id, user_id, reason_type, reason_text, status, created_at, updated_at)
      VALUES (?, ?, ?, 'non_quality', 'test return', ?, datetime('now'), datetime('now'))
    `).run(returnId, orderId, userId, status);

    return { orderId, returnId, customerName };
  }

  test('returns 400 when completing refund without successful payment and no manual reference', async () => {
    const admin = createTestUser('admin', { email: `${prefix}-admin-a@petcare.test` });
    const customer = createTestUser('customer', { email: `${prefix}-cust-a@petcare.test` });
    const { returnId } = insertOrderAndReturn({ userId: customer.user.id });

    const res = await request(app)
      .put(`/api/v1/order-returns/${returnId}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'refund_completed' });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('REFUND_PAYMENT_NOT_FOUND');
  });

  test('allows manual refund completion with refund_reference when no provider payment exists', async () => {
    const admin = createTestUser('admin', { email: `${prefix}-admin-b@petcare.test` });
    const customer = createTestUser('customer', { email: `${prefix}-cust-b@petcare.test` });
    const { returnId } = insertOrderAndReturn({ userId: customer.user.id });

    const res = await request(app)
      .put(`/api/v1/order-returns/${returnId}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        status: 'refund_completed',
        refund_reference: 'manual-ref-123',
        refund_amount: 19.99,
      });

    expect(res.status).toBe(200);
    expect(res.body?.data?.status).toBe('refund_completed');
    expect(res.body?.data?.refund_reference).toBe('manual-ref-123');
    expect(Number(res.body?.data?.refund_amount)).toBe(19.99);
  });

  test('returns 502 for unsupported provider when auto refund is attempted', async () => {
    const admin = createTestUser('admin', { email: `${prefix}-admin-c@petcare.test` });
    const customer = createTestUser('customer', { email: `${prefix}-cust-c@petcare.test` });
    const { orderId, returnId } = insertOrderAndReturn({ userId: customer.user.id });

    db.prepare(`
      INSERT INTO payments
        (id, order_id, provider, provider_payment_id, amount, currency, status, created_at, updated_at)
      VALUES (?, ?, 'stripe', ?, 1999, 'usd', 'succeeded', datetime('now'), datetime('now'))
    `).run(`pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, orderId, `pi-${Math.random().toString(36).slice(2, 10)}`);

    const res = await request(app)
      .put(`/api/v1/order-returns/${returnId}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'refund_completed' });

    expect(res.status).toBe(502);
    expect(res.body?.error?.code).toBe('REFUND_PROVIDER_UNSUPPORTED');
  });

  test('idempotent no-op when status is already refund_completed', async () => {
    const admin = createTestUser('admin', { email: `${prefix}-admin-d@petcare.test` });
    const customer = createTestUser('customer', { email: `${prefix}-cust-d@petcare.test` });
    const { returnId } = insertOrderAndReturn({ userId: customer.user.id, status: 'refund_completed' });

    const res = await request(app)
      .put(`/api/v1/order-returns/${returnId}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'refund_completed' });

    expect(res.status).toBe(200);
    expect(res.body?.data?.status).toBe('refund_completed');
  });
});
