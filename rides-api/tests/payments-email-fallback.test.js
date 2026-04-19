const express = require('express');
const request = require('supertest');
const Database = require('better-sqlite3');
const { registerPaymentsRoutes } = require('../src/routes/payments');

function createApiResponse(data, error = null) {
  return { data, error };
}

function setupDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT
    );
    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      customer_name TEXT,
      customer_email TEXT,
      status TEXT,
      total REAL,
      shipping_address TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      product_id TEXT,
      product_name TEXT,
      quantity INTEGER,
      unit_price REAL
    );
    CREATE TABLE payments (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      stripe_payment_intent_id TEXT,
      provider TEXT,
      provider_payment_id TEXT,
      amount INTEGER,
      currency TEXT,
      status TEXT,
      payment_method TEXT,
      receipt_url TEXT,
      failure_reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  return db;
}

function seedOrder(db, { customerEmail }) {
  db.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run('user-1', 'account-owner@unforgettablerides.test');
  db.prepare(`
    INSERT INTO orders (id, user_id, customer_name, customer_email, status, total, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', 24.99, datetime('now'), datetime('now'))
  `).run('order-1', 'user-1', 'Fallback Test Customer', customerEmail || null);
  db.prepare(`
    INSERT INTO order_items (id, order_id, product_id, product_name, quantity, unit_price)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('item-1', 'order-1', 'prod-1', 'Dog Shampoo', 2, 12.495);
}

function buildApp(db, sendEmailNotification) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: 'user-1',
      role: 'customer',
      email: 'account-owner@unforgettablerides.test',
      email_verified_at: '2026-01-01 00:00:00',
    };
    next();
  });

  registerPaymentsRoutes({
    app,
    db,
    apiResponse: createApiResponse,
    isStaff: (user) => user?.role === 'admin' || user?.role === 'staff' || user?.role === 'store_manager',
    sendNotification: async () => true,
    sendEmailNotification,
    NODE_ENV: 'test',
    stripe: null,
    STRIPE_WEBHOOK_SECRET: '',
    PAYMENT_CURRENCY: 'usd',
    STRIPE_PUBLISHABLE_KEY: '',
    squareClient: {
      payments: {
        create: jest.fn().mockResolvedValue({
          payment: {
            id: 'sq-provider-payment-1',
            status: 'COMPLETED',
            sourceType: 'CARD',
            receiptUrl: 'https://square.test/receipt/1',
          },
        }),
      },
    },
    SQUARE_APPLICATION_ID: 'sq-app-id',
    SQUARE_LOCATION_ID: 'sq-loc-id',
    SQUARE_ENV: 'sandbox',
    paypalClient: null,
    PAYPAL_CLIENT_ID: '',
    PAYPAL_ENV: 'sandbox',
    uuidv4: () => 'fixed-uuid',
    isAuthRequireVerifiedForSensitive: () => false,
  });
  return app;
}

describe('Payment confirmation email recipient fallback', () => {
  test('uses order.customer_email when present', async () => {
    const db = setupDb();
    seedOrder(db, { customerEmail: 'order-customer@unforgettablerides.test' });
    const sendEmailNotification = jest.fn().mockResolvedValue(true);
    const app = buildApp(db, sendEmailNotification);

    const res = await request(app)
      .post('/api/v1/payments/square/create-payment')
      .send({
        order_id: 'order-1',
        source_id: 'cnon:card-nonce-ok',
        idempotency_key: 'idem-1',
      });

    expect(res.status).toBe(200);
    expect(sendEmailNotification).toHaveBeenCalledTimes(1);
    expect(sendEmailNotification).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'order_confirmed',
      to: 'order-customer@unforgettablerides.test',
    }));
  });

  test('falls back to account email when order.customer_email is missing', async () => {
    const db = setupDb();
    seedOrder(db, { customerEmail: null });
    const sendEmailNotification = jest.fn().mockResolvedValue(true);
    const app = buildApp(db, sendEmailNotification);

    const res = await request(app)
      .post('/api/v1/payments/square/create-payment')
      .send({
        order_id: 'order-1',
        source_id: 'cnon:card-nonce-ok',
        idempotency_key: 'idem-2',
      });

    expect(res.status).toBe(200);
    expect(sendEmailNotification).toHaveBeenCalledTimes(1);
    expect(sendEmailNotification).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'order_confirmed',
      to: 'account-owner@unforgettablerides.test',
    }));
  });
});

