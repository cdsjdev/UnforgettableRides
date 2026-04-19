process.env.AUTH_REQUIRE_VERIFIED_FOR_SENSITIVE = 'true';

const { app, db, request, createTestUser } = require('./helpers');

describe('Email verification gates on sensitive customer actions', () => {
  const prefix = `email-gate-${Date.now()}`;

  afterAll(() => {
    db.prepare("DELETE FROM appointments WHERE dog_name LIKE ?").run(`${prefix}%`);
    db.prepare("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE customer_name LIKE ?)").run(`${prefix}%`);
    db.prepare("DELETE FROM orders WHERE customer_name LIKE ?").run(`${prefix}%`);
    db.prepare("DELETE FROM users WHERE email LIKE ?").run(`${prefix}%`);
  });

  test('blocks appointment create for unverified customer', async () => {
    const user = createTestUser('customer', { email: `${prefix}-appt@petcare.test` });
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const res = await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        dog_name: `${prefix}-dog`,
        service_type: 'wash',
        date: tomorrow,
        time: '10:00',
        duration_minutes: 30,
      });

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('EMAIL_VERIFICATION_REQUIRED');
  });

  test('blocks order create for unverified customer', async () => {
    const user = createTestUser('customer', { email: `${prefix}-order@petcare.test` });
    const product = db.prepare('SELECT id FROM products WHERE is_active = 1 ORDER BY id LIMIT 1').get();
    expect(product?.id).toBeTruthy();

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        customer_name: `${prefix}-customer`,
        items: [{ product_id: product.id, quantity: 1 }],
      });

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('EMAIL_VERIFICATION_REQUIRED');
  });

  test('blocks payment intent create for unverified customer', async () => {
    const user = createTestUser('customer', { email: `${prefix}-pay@petcare.test` });
    const res = await request(app)
      .post('/api/v1/payments/create-intent')
      .set('Authorization', `Bearer ${user.token}`)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('EMAIL_VERIFICATION_REQUIRED');
  });

  test('blocks square payment create for unverified customer', async () => {
    const user = createTestUser('customer', { email: `${prefix}-sqpay@petcare.test` });
    const res = await request(app)
      .post('/api/v1/payments/square/create-payment')
      .set('Authorization', `Bearer ${user.token}`)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('EMAIL_VERIFICATION_REQUIRED');
  });

  test('blocks PayPal create-order for unverified customer', async () => {
    const user = createTestUser('customer', { email: `${prefix}-pp-create@petcare.test` });
    const res = await request(app)
      .post('/api/v1/payments/paypal/create-order')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ order_id: 'order-any' });

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('EMAIL_VERIFICATION_REQUIRED');
  });

  test('blocks PayPal capture-order for unverified customer', async () => {
    const user = createTestUser('customer', { email: `${prefix}-pp-capture@petcare.test` });
    const res = await request(app)
      .post('/api/v1/payments/paypal/capture-order')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ order_id: 'order-any', paypal_order_id: 'pp-order-any' });

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('EMAIL_VERIFICATION_REQUIRED');
  });
});
