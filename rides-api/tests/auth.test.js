/**
 * Auth & RBAC integration tests.
 *
 * Verifies:
 * 1. Public routes are accessible without auth
 * 2. Protected routes reject unauthenticated requests
 * 3. Role-based access matrix (admin / store_manager / staff / customer)
 * 4. Ownership enforcement (customers see only own data)
 * 5. Internal service key auth
 * 6. Rate limiting on auth endpoints
 * 7. Edge cases (inactive user, expired token, last-admin protection)
 */

const { app, db, request, createTestUser, createAllRoles, cleanupTestUsers, restoreDogs } = require('./helpers');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const JWT_SECRET = process.env.JWT_SECRET || 'petcare-dev-secret-change-in-production';

let roles; // { admin, store_manager, staff, customer } each with { user, token }

beforeAll(() => {
  roles = createAllRoles();
});

afterAll(() => {
  db.prepare(`
    DELETE FROM feedback
    WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@petcare.test')
  `).run();
  db.prepare(`
    DELETE FROM business_points_ledger
    WHERE business_membership_id IN (
      SELECT id FROM business_memberships
      WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@petcare.test')
    )
  `).run();
  db.prepare(`
    DELETE FROM customer_business_links
    WHERE customer_user_id IN (SELECT id FROM users WHERE email LIKE '%@petcare.test')
       OR business_membership_id IN (
         SELECT id FROM business_memberships
         WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@petcare.test')
       )
  `).run();
  db.prepare(`
    DELETE FROM business_member_applications
    WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@petcare.test')
       OR reviewed_by_user_id IN (SELECT id FROM users WHERE email LIKE '%@petcare.test')
  `).run();
  db.prepare(`
    DELETE FROM password_reset_tokens
    WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@petcare.test')
  `).run();
  db.prepare(`
    DELETE FROM business_memberships
    WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@petcare.test')
  `).run();
  cleanupTestUsers();
  restoreDogs();
  db.prepare("DELETE FROM appointments WHERE dog_name LIKE 'TestDog%'").run();
  db.prepare("DELETE FROM orders WHERE customer_name LIKE 'TestCustomer%'").run();
});

// â”€â”€â”€ 1. Public Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Public routes', () => {
  test('GET /api/v1/health is accessible without auth', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('POST /api/v1/auth/login accepts valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: roles.admin.user.email, password: roles.admin.password });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeDefined();
  });

  test('POST /api/v1/auth/login rejects invalid password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: roles.admin.user.email, password: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('POST /api/v1/auth/signup creates customer account', async () => {
    const email = `signup-test-${Date.now()}@petcare.test`;
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email, password: 'Test123!', name: 'Signup Test' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('customer');
    expect(res.body.data.token).toBeDefined();
  });

  test('POST /api/v1/auth/signup rejects duplicate email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: roles.customer.user.email, password: 'Test123!', name: 'Dup' });
    expect(res.status).toBe(409);
  });

  test('GET /api/v1/products is accessible without auth', async () => {
    const res = await request(app).get('/api/v1/products');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /api/v1/products/:id is accessible without auth', async () => {
    const list = await request(app).get('/api/v1/products');
    expect(list.body.data.length).toBeGreaterThan(0);
    const res = await request(app).get(`/api/v1/products/${list.body.data[0].id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(list.body.data[0].id);
  });

  test('GET /api/v1/products/:id hides inactive products from public', async () => {
    // Deactivate a product, then verify public access returns 404
    const list = await request(app).get('/api/v1/products');
    const product = list.body.data[0];
    // Deactivate via authenticated request
    await request(app)
      .put(`/api/v1/products/${product.id}`)
      .set('Authorization', `Bearer ${roles.admin.token}`)
      .send({ is_active: false });
    // Public (no token) should get 404
    const res = await request(app).get(`/api/v1/products/${product.id}`);
    expect(res.status).toBe(404);
    // Authenticated customer should also get 404
    const custRes = await request(app)
      .get(`/api/v1/products/${product.id}`)
      .set('Authorization', `Bearer ${roles.customer.token}`);
    expect(custRes.status).toBe(404);
    // Authenticated staff should still see it
    const authRes = await request(app)
      .get(`/api/v1/products/${product.id}`)
      .set('Authorization', `Bearer ${roles.staff.token}`);
    expect(authRes.status).toBe(200);
    expect(authRes.body.data.is_active).toBe(0);
    // Restore
    await request(app)
      .put(`/api/v1/products/${product.id}`)
      .set('Authorization', `Bearer ${roles.admin.token}`)
      .send({ is_active: true });
  });

  test('GET /api/v1/appointments/availability is accessible without auth', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const res = await request(app).get(`/api/v1/appointments/availability?date=${tomorrow}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.slots)).toBe(true);
  });

  test('POST /api/v1/auth/password/forgot returns generic success for existing and non-existing email', async () => {
    const existing = await request(app)
      .post('/api/v1/auth/password/forgot')
      .send({ email: roles.customer.user.email });
    expect(existing.status).toBe(200);

    const missing = await request(app)
      .post('/api/v1/auth/password/forgot')
      .send({ email: `missing-${Date.now()}@petcare.test` });
    expect(missing.status).toBe(200);
  });

  test('POST /api/v1/auth/password/reset updates password with valid token', async () => {
    const user = createTestUser('staff', { email: `resetpw-${Date.now()}@petcare.test`, password: 'OldPass1' });
    const token = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(uuidv4(), user.user.id, tokenHash, expiresAt);

    const resetRes = await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ token, new_password: 'NewPass123' });
    expect(resetRes.status).toBe(200);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.user.email, password: 'NewPass123' });
    expect(login.status).toBe(200);
  });
});

// â”€â”€â”€ 2. Authentication Gate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Authentication gate', () => {
  const protectedEndpoints = [
    ['GET', '/api/v1/auth/me'],
    ['GET', '/api/v1/users'],
    ['GET', '/api/v1/appointments'],
    ['GET', '/api/v1/orders'],
    ['GET', '/api/v1/dogs'],
    ['GET', '/api/v1/settings'],
    ['GET', '/api/v1/analytics/current'],
  ];

  test.each(protectedEndpoints)('%s %s returns 401 without token', async (method, path) => {
    const res = await request(app)[method.toLowerCase()](path);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('rejects expired token', async () => {
    const expiredToken = jwt.sign(
      { userId: roles.customer.user.id, role: 'customer' },
      JWT_SECRET,
      { expiresIn: '0s' }
    );
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
  });

  test('rejects invalid token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer garbage.token.here');
    expect(res.status).toBe(401);
  });

  test('rejects inactive user', async () => {
    const inactive = createTestUser('staff', { is_active: 0, email: `inactive-${Date.now()}@petcare.test` });
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${inactive.token}`);
    expect(res.status).toBe(401);
  });
});

// â”€â”€â”€ 3. Role-Based Access Matrix â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Role-based access control', () => {
  // Admin-only endpoints
  describe('Admin-only endpoints', () => {
    test('GET /api/v1/users â€” admin gets 200', async () => {
      const res = await request(app).get('/api/v1/users')
        .set('Authorization', `Bearer ${roles.admin.token}`);
      expect(res.status).toBe(200);
    });

    test('POST /api/v1/auth/register â€” admin gets 201', async () => {
      const res = await request(app).post('/api/v1/auth/register')
        .set('Authorization', `Bearer ${roles.admin.token}`)
        .send({ email: `reg-${Date.now()}@petcare.test`, password: 'Test123!', name: 'Reg Test' });
      expect(res.status).toBe(201);
    });

    test('GET /api/v1/users â€” store_manager gets 403', async () => {
      const res = await request(app).get('/api/v1/users')
        .set('Authorization', `Bearer ${roles.store_manager.token}`);
      expect(res.status).toBe(403);
    });

    test('GET /api/v1/users â€” staff gets 403', async () => {
      const res = await request(app).get('/api/v1/users')
        .set('Authorization', `Bearer ${roles.staff.token}`);
      expect(res.status).toBe(403);
    });

    test('GET /api/v1/users â€” customer gets 403', async () => {
      const res = await request(app).get('/api/v1/users')
        .set('Authorization', `Bearer ${roles.customer.token}`);
      expect(res.status).toBe(403);
    });
  });

  // Admin + store_manager endpoints
  describe('Manager+ endpoints', () => {
    const managerEndpoints = [
      ['GET', '/api/v1/settings'],
      ['GET', '/api/v1/analytics/current'],
      ['GET', '/api/v1/analytics/summary'],
      ['GET', '/api/v1/analytics/tracking-config'],
      ['POST', '/api/v1/analytics/validation-snapshots/refresh'],
    ];

    test.each(managerEndpoints)('%s %s â€” admin gets 200', async (method, path) => {
      const res = await request(app)[method.toLowerCase()](path)
        .set('Authorization', `Bearer ${roles.admin.token}`);
      expect(res.status).toBe(200);
    });

    test.each(managerEndpoints)('%s %s â€” store_manager gets 200', async (method, path) => {
      const res = await request(app)[method.toLowerCase()](path)
        .set('Authorization', `Bearer ${roles.store_manager.token}`);
      expect(res.status).toBe(200);
    });

    test.each(managerEndpoints)('%s %s â€” staff gets 403', async (method, path) => {
      const res = await request(app)[method.toLowerCase()](path)
        .set('Authorization', `Bearer ${roles.staff.token}`);
      expect(res.status).toBe(403);
    });

    test.each(managerEndpoints)('%s %s â€” customer gets 403', async (method, path) => {
      const res = await request(app)[method.toLowerCase()](path)
        .set('Authorization', `Bearer ${roles.customer.token}`);
      expect(res.status).toBe(403);
    });
  });

  describe('Tracking config endpoints', () => {
    const TRACKING_KEYS = [
      'analytics_tracking_enabled',
      'analytics_door_line_coords',
      'analytics_door_line_direction',
      'analytics_metrics_default',
      'analytics_flow_gap_threshold_pct',
      'analytics_rollout_stable_days',
      'analytics_rollout_min_daily_legacy_flow',
    ];
    const original = {};

    beforeAll(() => {
      for (const key of TRACKING_KEYS) {
        const row = db.prepare('SELECT value FROM store_settings WHERE key = ?').get(key);
        original[key] = row ? row.value : undefined;
      }
    });

    afterAll(() => {
      for (const key of TRACKING_KEYS) {
        if (original[key] === undefined) {
          db.prepare('DELETE FROM store_settings WHERE key = ?').run(key);
        } else {
          db.prepare("INSERT INTO store_settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
            .run(key, original[key]);
        }
      }
    });

    test('PUT /api/v1/analytics/tracking-config â€” admin can update and GET sees persisted values', async () => {
      const payload = {
        tracking_enabled: true,
        door_line_coords: '100,120,500,120',
        door_line_direction: 'positive_to_negative_is_entry',
        metrics_default: 'legacy',
        flow_gap_threshold_pct: 18,
        rollout_stable_days: 4,
        rollout_min_daily_legacy_flow: 30,
      };
      const putRes = await request(app)
        .put('/api/v1/analytics/tracking-config')
        .set('Authorization', `Bearer ${roles.admin.token}`)
        .send(payload);
      expect(putRes.status).toBe(200);
      expect(putRes.body.data.tracking_enabled).toBe(true);
      expect(putRes.body.data.door_line_coords).toBe('100,120,500,120');
      expect(putRes.body.data.door_line_direction).toBe('positive_to_negative_is_entry');
      expect(putRes.body.data.metrics_default).toBe('legacy');
      expect(putRes.body.data.flow_gap_threshold_pct).toBe(18);
      expect(putRes.body.data.rollout_stable_days).toBe(4);
      expect(putRes.body.data.rollout_min_daily_legacy_flow).toBe(30);

      const getRes = await request(app)
        .get('/api/v1/analytics/tracking-config')
        .set('Authorization', `Bearer ${roles.admin.token}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.tracking_enabled).toBe(true);
      expect(getRes.body.data.door_line_coords).toBe('100,120,500,120');
      expect(getRes.body.data.door_line_direction).toBe('positive_to_negative_is_entry');
      expect(getRes.body.data.metrics_default).toBe('legacy');
      expect(getRes.body.data.flow_gap_threshold_pct).toBe(18);
      expect(getRes.body.data.rollout_stable_days).toBe(4);
      expect(getRes.body.data.rollout_min_daily_legacy_flow).toBe(30);
    });

    test('PUT /api/v1/analytics/tracking-config â€” store_manager can update', async () => {
      const putRes = await request(app)
        .put('/api/v1/analytics/tracking-config')
        .set('Authorization', `Bearer ${roles.store_manager.token}`)
        .send({
          tracking_enabled: false,
          door_line_coords: '320,0,320,480',
          door_line_direction: 'negative_to_positive_is_entry',
          metrics_default: 'tracked',
          flow_gap_threshold_pct: 25,
          rollout_stable_days: 5,
          rollout_min_daily_legacy_flow: 40,
        });
      expect(putRes.status).toBe(200);
      expect(putRes.body.data.tracking_enabled).toBe(false);
      expect(putRes.body.data.door_line_coords).toBe('320,0,320,480');
      expect(putRes.body.data.door_line_direction).toBe('negative_to_positive_is_entry');
      expect(putRes.body.data.metrics_default).toBe('tracked');
      expect(putRes.body.data.flow_gap_threshold_pct).toBe(25);
      expect(putRes.body.data.rollout_stable_days).toBe(5);
      expect(putRes.body.data.rollout_min_daily_legacy_flow).toBe(40);
    });

    test('PUT /api/v1/analytics/tracking-config â€” staff gets 403', async () => {
      const res = await request(app)
        .put('/api/v1/analytics/tracking-config')
        .set('Authorization', `Bearer ${roles.staff.token}`)
        .send({ tracking_enabled: true });
      expect(res.status).toBe(403);
    });

    test('PUT /api/v1/analytics/tracking-config â€” invalid direction returns 400', async () => {
      const res = await request(app)
        .put('/api/v1/analytics/tracking-config')
        .set('Authorization', `Bearer ${roles.admin.token}`)
        .send({ door_line_direction: 'left_to_right_is_entry' });
      expect(res.status).toBe(400);
    });

    test('PUT /api/v1/analytics/tracking-config â€” invalid coords returns 400', async () => {
      const res = await request(app)
        .put('/api/v1/analytics/tracking-config')
        .set('Authorization', `Bearer ${roles.admin.token}`)
        .send({ door_line_coords: '100,100,100,100' }); // degenerate line
      expect(res.status).toBe(400);
    });

    test('PUT /api/v1/analytics/tracking-config â€” invalid metrics_default returns 400', async () => {
      const res = await request(app)
        .put('/api/v1/analytics/tracking-config')
        .set('Authorization', `Bearer ${roles.admin.token}`)
        .send({ metrics_default: 'auto' });
      expect(res.status).toBe(400);
    });

    test('PUT /api/v1/analytics/tracking-config â€” invalid flow_gap_threshold_pct returns 400', async () => {
      const res = await request(app)
        .put('/api/v1/analytics/tracking-config')
        .set('Authorization', `Bearer ${roles.admin.token}`)
        .send({ flow_gap_threshold_pct: 0 });
      expect(res.status).toBe(400);
    });

    test('PUT /api/v1/analytics/tracking-config â€” invalid rollout_stable_days returns 400', async () => {
      const res = await request(app)
        .put('/api/v1/analytics/tracking-config')
        .set('Authorization', `Bearer ${roles.admin.token}`)
        .send({ rollout_stable_days: 0 });
      expect(res.status).toBe(400);
    });

    test('PUT /api/v1/analytics/tracking-config â€” invalid rollout_min_daily_legacy_flow returns 400', async () => {
      const res = await request(app)
        .put('/api/v1/analytics/tracking-config')
        .set('Authorization', `Bearer ${roles.admin.token}`)
        .send({ rollout_min_daily_legacy_flow: 5001 });
      expect(res.status).toBe(400);
    });

    test('GET /api/v1/analytics/summary â€” includes tracked vs legacy delta fields', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/summary')
        .set('Authorization', `Bearer ${roles.admin.token}`);
      expect(res.status).toBe(200);
      expect(typeof res.body.data.tracked_vs_legacy_entry_delta).toBe('number');
      expect(typeof res.body.data.tracked_vs_legacy_exit_delta).toBe('number');
      expect(typeof res.body.data.tracked_vs_legacy_flow_delta_abs).toBe('number');
      expect(typeof res.body.data.tracked_vs_legacy_flow_delta_pct).toBe('number');
      expect(['tracked', 'legacy']).toContain(res.body.data.metrics_default);
      expect(['tracked', 'legacy']).toContain(res.body.data.metrics_default_recommended);
      expect(typeof res.body.data.flow_gap_threshold_pct).toBe('number');
      expect(typeof res.body.data.rollout_stable_days).toBe('number');
      expect(typeof res.body.data.rollout_min_daily_legacy_flow).toBe('number');
      expect(typeof res.body.data.metrics_rollout_policy).toBe('object');
      expect(typeof res.body.data.tracker_mode).toBe('string');
    });

    test('POST /api/v1/analytics/validation-snapshots/refresh + GET snapshots â€” returns persisted daily snapshots', async () => {
      await request(app)
        .post('/api/v1/analytics/validation-snapshots/refresh')
        .set('Authorization', `Bearer ${roles.admin.token}`);
      const res = await request(app)
        .get('/api/v1/analytics/validation-snapshots?limit=5')
        .set('Authorization', `Bearer ${roles.admin.token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(typeof res.body.data[0].date).toBe('string');
      expect(typeof res.body.data[0].metrics_default_recommended).toBe('string');
    });
  });

  describe('Camera tracking payload validation', () => {
    test('POST /api/v1/ml/camera/config â€” invalid direction returns 400 without forwarding', async () => {
      const res = await request(app)
        .post('/api/v1/ml/camera/config')
        .set('Authorization', `Bearer ${roles.admin.token}`)
        .send({ door_line_direction: 'left_to_right_is_entry' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_REQUEST');
    });

    test('POST /api/v1/ml/camera/config â€” invalid coords returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/ml/camera/config')
        .set('Authorization', `Bearer ${roles.admin.token}`)
        .send({ door_line_coords: '10,10,10,10' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_REQUEST');
    });

    test('POST /api/v1/ml/camera/start â€” invalid tracking_enabled type returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/ml/camera/start')
        .set('Authorization', `Bearer ${roles.admin.token}`)
        .send({ tracking_enabled: 'yes' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_REQUEST');
    });
  });

  // Staff-level endpoints (admin + store_manager + staff)
  describe('Staff+ endpoints', () => {
    test('PUT /api/v1/orders/:id/status â€” staff can update', async () => {
      // First create an order to update
      const orderId = require('uuid').v4();
      db.prepare(
        "INSERT INTO orders (id, user_id, customer_name, customer_phone, status, total) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(orderId, roles.customer.user.id, 'TestCustomer1', '555-0001', 'pending', 10);

      const res = await request(app)
        .put(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${roles.staff.token}`)
        .send({ status: 'confirmed' });
      expect(res.status).toBe(200);
    });

    test('PUT /api/v1/orders/:id/status â€” customer gets 403', async () => {
      const orderId = require('uuid').v4();
      db.prepare(
        "INSERT INTO orders (id, user_id, customer_name, customer_phone, status, total) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(orderId, roles.customer.user.id, 'TestCustomer2', '555-0002', 'pending', 10);

      const res = await request(app)
        .put(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${roles.customer.token}`)
        .send({ status: 'confirmed' });
      expect(res.status).toBe(403);
    });
  });
});

// â”€â”€â”€ 4. Ownership Enforcement â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Business membership applications', () => {
  test('customer can submit application and cannot submit duplicate pending', async () => {
    const applicant = createTestUser('customer', { email: `bm-app-${Date.now()}@petcare.test` });

    const first = await request(app)
      .post('/api/v1/business-memberships/apply')
      .set('Authorization', `Bearer ${applicant.token}`)
      .send({
        applicant_phone: '0900000001',
        shop_name: 'Happy Grooming',
        city: 'Taipei',
        message: 'bringing existing customers',
      });
    expect(first.status).toBe(201);
    expect(first.body.data.status).toBe('pending');

    const second = await request(app)
      .post('/api/v1/business-memberships/apply')
      .set('Authorization', `Bearer ${applicant.token}`)
      .send({ shop_name: 'Retry Shop' });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ALREADY_APPLIED');
  });

  test('admin can review and approve application, which upgrades role and creates membership', async () => {
    const applicant = createTestUser('customer', { email: `bm-approve-${Date.now()}@petcare.test` });

    const applyRes = await request(app)
      .post('/api/v1/business-memberships/apply')
      .set('Authorization', `Bearer ${applicant.token}`)
      .send({
        applicant_phone: '0900000002',
        shop_name: 'Sun Grooming Studio',
        city: 'Taichung',
      });
    expect(applyRes.status).toBe(201);
    const appId = applyRes.body.data.id;

    const listRes = await request(app)
      .get('/api/v1/business-memberships/applications?status=pending')
      .set('Authorization', `Bearer ${roles.admin.token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((r) => r.id === appId)).toBe(true);

    const approveRes = await request(app)
      .put(`/api/v1/business-memberships/applications/${appId}/review`)
      .set('Authorization', `Bearer ${roles.admin.token}`)
      .send({
        action: 'approve',
        code: 'BIZ-APPROVE-1',
        display_name: 'Sun Grooming Studio',
      });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.application.status).toBe('approved');
    expect(approveRes.body.data.membership.code).toBe('BIZ-APPROVE-1');

    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(applicant.user.id);
    expect(user.role).toBe('business_member');

    const membership = db.prepare('SELECT * FROM business_memberships WHERE user_id = ?').get(applicant.user.id);
    expect(membership).toBeDefined();
    expect(membership.code).toBe('BIZ-APPROVE-1');

    const secondReview = await request(app)
      .put(`/api/v1/business-memberships/applications/${appId}/review`)
      .set('Authorization', `Bearer ${roles.admin.token}`)
      .send({ action: 'reject' });
    expect(secondReview.status).toBe(409);
    expect(secondReview.body.error.code).toBe('ALREADY_REVIEWED');
  });

  test('customer cannot list applications', async () => {
    const res = await request(app)
      .get('/api/v1/business-memberships/applications?status=pending')
      .set('Authorization', `Bearer ${roles.customer.token}`);
    expect(res.status).toBe(403);
  });
});

describe('Ownership enforcement', () => {
  let customerA, customerB;

  beforeAll(() => {
    customerA = createTestUser('customer', { email: `ownerA-${Date.now()}@petcare.test` });
    customerB = createTestUser('customer', { email: `ownerB-${Date.now()}@petcare.test` });
  });

  describe('Dogs', () => {
    let dogA;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/dogs')
        .set('Authorization', `Bearer ${customerA.token}`)
        .send({ name: 'TestDogOwnerA', breed: 'Poodle' });
      dogA = res.body.data;
    });

    afterAll(() => {
      // Clean up â€” remove test dog from in-memory array via the API isn't safe
      // so we'll just leave it; the server reloads from file on restart
    });

    test('new dog gets user_id from auth token, not hardcoded', () => {
      expect(dogA.user_id).toBe(customerA.user.id);
    });

    test('customer A can see their own dog', async () => {
      const res = await request(app)
        .get(`/api/v1/dogs/${dogA.id}`)
        .set('Authorization', `Bearer ${customerA.token}`);
      expect(res.status).toBe(200);
    });

    test('customer B cannot see customer A dog', async () => {
      const res = await request(app)
        .get(`/api/v1/dogs/${dogA.id}`)
        .set('Authorization', `Bearer ${customerB.token}`);
      expect(res.status).toBe(403);
    });

    test('customer B cannot update customer A dog', async () => {
      const res = await request(app)
        .put(`/api/v1/dogs/${dogA.id}`)
        .set('Authorization', `Bearer ${customerB.token}`)
        .send({ name: 'Hacked' });
      expect(res.status).toBe(403);
    });

    test('customer B cannot delete customer A dog', async () => {
      const res = await request(app)
        .delete(`/api/v1/dogs/${dogA.id}`)
        .set('Authorization', `Bearer ${customerB.token}`);
      expect(res.status).toBe(403);
    });

    test('staff can see any dog', async () => {
      const res = await request(app)
        .get(`/api/v1/dogs/${dogA.id}`)
        .set('Authorization', `Bearer ${roles.staff.token}`);
      expect(res.status).toBe(200);
    });

    test('customer A list only shows own dogs', async () => {
      const res = await request(app)
        .get('/api/v1/dogs')
        .set('Authorization', `Bearer ${customerA.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.every(d => d.user_id === customerA.user.id)).toBe(true);
    });

    test('cannot override user_id via request body', async () => {
      const res = await request(app)
        .post('/api/v1/dogs')
        .set('Authorization', `Bearer ${customerA.token}`)
        .send({ name: 'TestDogNoOverride', user_id: 'hacker-id' });
      expect(res.body.data.user_id).toBe(customerA.user.id);
    });
  });

  describe('Appointments', () => {
    let apptA;

    beforeAll(async () => {
      // Customer A creates an appointment
      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${customerA.token}`)
        .send({ dog_name: 'TestDogA', date: '2099-01-01', time: '10:00', service_type: 'wash' });
      apptA = res.body.data;
    });

    test('customer A can see their own appointment', async () => {
      const res = await request(app)
        .get(`/api/v1/appointments/${apptA.id}`)
        .set('Authorization', `Bearer ${customerA.token}`);
      expect(res.status).toBe(200);
    });

    test('customer B cannot see customer A appointment', async () => {
      const res = await request(app)
        .get(`/api/v1/appointments/${apptA.id}`)
        .set('Authorization', `Bearer ${customerB.token}`);
      expect(res.status).toBe(403);
    });

    test('staff can see any appointment', async () => {
      const res = await request(app)
        .get(`/api/v1/appointments/${apptA.id}`)
        .set('Authorization', `Bearer ${roles.staff.token}`);
      expect(res.status).toBe(200);
    });

    test('customer A list only shows own appointments', async () => {
      const res = await request(app)
        .get('/api/v1/appointments')
        .set('Authorization', `Bearer ${customerA.token}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.map(a => a.user_id);
      expect(ids.every(id => id === customerA.user.id)).toBe(true);
    });
  });

  describe('Orders', () => {
    let orderA;

    beforeAll(() => {
      // Create an order for customer A directly in DB
      const orderId = require('uuid').v4();
      db.prepare(
        "INSERT INTO orders (id, user_id, customer_name, customer_phone, status, total) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(orderId, customerA.user.id, 'TestCustomerA', '555-0010', 'pending', 25);
      orderA = { id: orderId };
    });

    test('customer A can see their own order', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${orderA.id}`)
        .set('Authorization', `Bearer ${customerA.token}`);
      expect(res.status).toBe(200);
    });

    test('customer B cannot see customer A order', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${orderA.id}`)
        .set('Authorization', `Bearer ${customerB.token}`);
      expect(res.status).toBe(403);
    });

    test('staff can see any order', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${orderA.id}`)
        .set('Authorization', `Bearer ${roles.staff.token}`);
      expect(res.status).toBe(200);
    });
  });

  describe('Washes â€” cross-owner dog_id reassignment', () => {
    let dogA, dogB, washA;

    beforeAll(async () => {
      // Customer A creates a dog
      const resA = await request(app)
        .post('/api/v1/dogs')
        .set('Authorization', `Bearer ${customerA.token}`)
        .send({ name: 'TestDogWashA' });
      dogA = resA.body.data;

      // Customer B creates a dog
      const resB = await request(app)
        .post('/api/v1/dogs')
        .set('Authorization', `Bearer ${customerB.token}`)
        .send({ name: 'TestDogWashB' });
      dogB = resB.body.data;

      // Customer A creates a wash for their dog
      const resW = await request(app)
        .post('/api/v1/washes')
        .set('Authorization', `Bearer ${customerA.token}`)
        .send({ dog_id: dogA.id, cycle_id: 'test', notes: 'test wash' });
      washA = resW.body.data;
    });

    test('customer A cannot reassign wash to customer B dog via PUT dog_id', async () => {
      const res = await request(app)
        .put(`/api/v1/washes/${washA.id}`)
        .set('Authorization', `Bearer ${customerA.token}`)
        .send({ dog_id: dogB.id });
      expect(res.status).toBe(403);
    });
  });
});

// â”€â”€â”€ 5. Internal Service Auth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Internal service auth', () => {
  const crypto = require('crypto');
  const INTERNAL_KEY = process.env.INTERNAL_API_KEY || 'petcare-internal-dev-key';

  function hmacSign(body, overrides = {}) {
    const ts = overrides.timestamp || String(Date.now());
    const nonce = overrides.nonce || require('uuid').v4();
    const payload = `${ts}.${nonce}.${JSON.stringify(body)}`;
    const sig = crypto.createHmac('sha256', INTERNAL_KEY).update(payload).digest('hex');
    return { 'X-Internal-Signature': sig, 'X-Internal-Timestamp': ts, 'X-Internal-Nonce': nonce };
  }

  // HMAC tests
  test('valid HMAC signature on whitelisted route succeeds', async () => {
    const body = { timestamp: new Date().toISOString(), dog_count: 2, detections: [] };
    const headers = hmacSign(body);
    const res = await request(app)
      .post('/api/v1/analytics/detection')
      .set(headers)
      .send(body);
    expect([200, 201]).toContain(res.status);
  });

  test('missing nonce is rejected', async () => {
    const body = { timestamp: new Date().toISOString(), dog_count: 1, detections: [] };
    const ts = String(Date.now());
    // Sign without nonce in payload to simulate old-style request
    const payload = `${ts}.${JSON.stringify(body)}`;
    const sig = crypto.createHmac('sha256', INTERNAL_KEY).update(payload).digest('hex');
    const res = await request(app)
      .post('/api/v1/analytics/detection')
      .set('X-Internal-Signature', sig)
      .set('X-Internal-Timestamp', ts)
      // no X-Internal-Nonce header
      .send(body);
    expect(res.status).toBe(401);
  });

  test('invalid HMAC signature is rejected (correct length)', async () => {
    const body = { timestamp: new Date().toISOString(), dog_count: 1, detections: [] };
    const res = await request(app)
      .post('/api/v1/analytics/detection')
      .set('X-Internal-Signature', 'deadbeef'.repeat(8))
      .set('X-Internal-Timestamp', String(Date.now()))
      .set('X-Internal-Nonce', require('uuid').v4())
      .send(body);
    expect(res.status).toBe(401);
  });

  test('malformed signature (wrong length) returns 401, not 500', async () => {
    const body = { timestamp: new Date().toISOString(), dog_count: 1, detections: [] };
    const res = await request(app)
      .post('/api/v1/analytics/detection')
      .set('X-Internal-Signature', 'abc')
      .set('X-Internal-Timestamp', String(Date.now()))
      .set('X-Internal-Nonce', require('uuid').v4())
      .send(body);
    expect(res.status).toBe(401);
  });

  test('non-hex signature returns 401, not 500', async () => {
    const body = { timestamp: new Date().toISOString(), dog_count: 1, detections: [] };
    const res = await request(app)
      .post('/api/v1/analytics/detection')
      .set('X-Internal-Signature', 'zzzz'.repeat(16))
      .set('X-Internal-Timestamp', String(Date.now()))
      .set('X-Internal-Nonce', require('uuid').v4())
      .send(body);
    expect(res.status).toBe(401);
  });

  test('invalid signature + valid legacy key does NOT bypass HMAC check', async () => {
    const body = { timestamp: new Date().toISOString(), dog_count: 1, detections: [] };
    const res = await request(app)
      .post('/api/v1/analytics/detection')
      .set('X-Internal-Signature', 'deadbeef'.repeat(8))
      .set('X-Internal-Timestamp', String(Date.now()))
      .set('X-Internal-Nonce', require('uuid').v4())
      .set('X-Internal-Key', INTERNAL_KEY) // valid legacy key should NOT help
      .send(body);
    expect(res.status).toBe(401);
  });

  test('stale HMAC timestamp is rejected', async () => {
    const body = { timestamp: new Date().toISOString(), dog_count: 1, detections: [] };
    const nonce = require('uuid').v4();
    const staleTs = String(Date.now() - 600000); // 10 min ago
    const payload = `${staleTs}.${nonce}.${JSON.stringify(body)}`;
    const sig = crypto.createHmac('sha256', INTERNAL_KEY).update(payload).digest('hex');
    const res = await request(app)
      .post('/api/v1/analytics/detection')
      .set('X-Internal-Signature', sig)
      .set('X-Internal-Timestamp', staleTs)
      .set('X-Internal-Nonce', nonce)
      .send(body);
    expect(res.status).toBe(401);
  });

  test('replay with same signature/timestamp/body but swapped nonce is rejected', async () => {
    const body = { timestamp: new Date().toISOString(), dog_count: 3, detections: [] };
    const headers = hmacSign(body);

    // First request succeeds
    const res1 = await request(app)
      .post('/api/v1/analytics/detection')
      .set(headers)
      .send(body);
    expect([200, 201]).toContain(res1.status);

    // Replay with different nonce but same signature/timestamp â€” signature won't match
    // because nonce is part of the signed payload
    const res2 = await request(app)
      .post('/api/v1/analytics/detection')
      .set('X-Internal-Signature', headers['X-Internal-Signature'])
      .set('X-Internal-Timestamp', headers['X-Internal-Timestamp'])
      .set('X-Internal-Nonce', require('uuid').v4()) // different nonce
      .send(body);
    expect(res2.status).toBe(401);
  });

  test('exact replay with same nonce is rejected', async () => {
    const body = { timestamp: new Date().toISOString(), dog_count: 4, detections: [] };
    const headers = hmacSign(body);

    // First request succeeds
    const res1 = await request(app)
      .post('/api/v1/analytics/detection')
      .set(headers)
      .send(body);
    expect([200, 201]).toContain(res1.status);

    // Exact replay â€” same headers, same body
    const res2 = await request(app)
      .post('/api/v1/analytics/detection')
      .set(headers)
      .send(body);
    expect(res2.status).toBe(401);
  });

  // Legacy X-Internal-Key tests (backwards compatibility â€” only when no signature header)
  test('valid X-Internal-Key (no signature header) succeeds', async () => {
    const res = await request(app)
      .post('/api/v1/analytics/detection')
      .set('X-Internal-Key', INTERNAL_KEY)
      .send({ timestamp: new Date().toISOString(), dog_count: 2, detections: [] });
    expect([200, 201]).toContain(res.status);
  });

  test('invalid X-Internal-Key is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/analytics/detection')
      .set('X-Internal-Key', 'wrong-key')
      .send({ timestamp: new Date().toISOString(), dog_count: 1, detections: [] });
    expect(res.status).toBe(401);
  });

  test('X-Internal-Key on non-whitelisted route is rejected', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('X-Internal-Key', INTERNAL_KEY);
    expect(res.status).toBe(401);
  });
});

// â”€â”€â”€ 6. Password Change â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Password change', () => {
  test('change password with correct current password', async () => {
    const user = createTestUser('customer', { email: `pwchange-${Date.now()}@petcare.test`, password: 'OldPass1' });
    const res = await request(app)
      .put('/api/v1/auth/password')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ current_password: 'OldPass1', new_password: 'NewPass1' });
    expect(res.status).toBe(200);

    // Verify new password works
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.user.email, password: 'NewPass1' });
    expect(login.status).toBe(200);
  });

  test('reject password change with wrong current password', async () => {
    const res = await request(app)
      .put('/api/v1/auth/password')
      .set('Authorization', `Bearer ${roles.customer.token}`)
      .send({ current_password: 'wrongpassword', new_password: 'NewPass1' });
    expect(res.status).toBe(401);
  });

  test('reject password shorter than 6 chars', async () => {
    const res = await request(app)
      .put('/api/v1/auth/password')
      .set('Authorization', `Bearer ${roles.customer.token}`)
      .send({ current_password: roles.customer.password, new_password: '12345' });
    expect(res.status).toBe(400);
  });
});

// â”€â”€â”€ 7. Last-Admin Protection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Last-admin protection', () => {
  test('cannot deactivate the sole remaining active admin', async () => {
    // Create a fresh admin who will be the sole admin for this test
    const soleAdmin = createTestUser('admin', { email: `sole-admin-${Date.now()}@petcare.test` });

    // Deactivate ALL other admins so soleAdmin is the last one
    db.prepare("UPDATE users SET is_active = 0 WHERE role = 'admin' AND id != ?").run(soleAdmin.user.id);

    // Attempt to deactivate the sole admin via the API
    const res = await request(app)
      .put(`/api/v1/users/${soleAdmin.user.id}`)
      .set('Authorization', `Bearer ${soleAdmin.token}`)
      .send({ is_active: false });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LAST_ADMIN');

    // Verify the admin is still active
    const check = db.prepare('SELECT is_active FROM users WHERE id = ?').get(soleAdmin.user.id);
    expect(check.is_active).toBe(1);

    // Restore other admins
    db.prepare("UPDATE users SET is_active = 1 WHERE role = 'admin'").run();
  });

  test('cannot demote the sole remaining active admin', async () => {
    const soleAdmin = createTestUser('admin', { email: `sole-admin2-${Date.now()}@petcare.test` });
    db.prepare("UPDATE users SET is_active = 0 WHERE role = 'admin' AND id != ?").run(soleAdmin.user.id);

    const res = await request(app)
      .put(`/api/v1/users/${soleAdmin.user.id}`)
      .set('Authorization', `Bearer ${soleAdmin.token}`)
      .send({ role: 'staff' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LAST_ADMIN');

    // Restore
    db.prepare("UPDATE users SET is_active = 1 WHERE role = 'admin'").run();
  });
});

describe('Multi-store scope enforcement', () => {
  let manager;
  let prefix;

  beforeEach(() => {
    prefix = `store-scope-${Date.now()}`;
    const upsertStore = db.prepare(`
      INSERT INTO stores (id, name, slug, timezone, is_active, settings_json, created_at, updated_at)
      VALUES (?, ?, ?, 'America/Los_Angeles', 1, '{}', datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        slug = excluded.slug,
        is_active = 1,
        updated_at = datetime('now')
    `);
    upsertStore.run('store-a', 'Store A', 'store-a');
    upsertStore.run('store-b', 'Store B', 'store-b');
    upsertStore.run('store-c', 'Store C', 'store-c');

    manager = createTestUser('store_manager', { email: `${prefix}-mgr@petcare.test` });
    const upsertLink = db.prepare(`
      INSERT INTO user_store_links (user_id, store_id, is_active, created_at, updated_at)
      VALUES (?, ?, 1, datetime('now'), datetime('now'))
      ON CONFLICT(user_id, store_id) DO UPDATE SET is_active = 1, updated_at = datetime('now')
    `);
    upsertLink.run(manager.user.id, 'store-a');
    upsertLink.run(manager.user.id, 'store-b');
    db.prepare("UPDATE users SET store_id = 'store-a', updated_at = datetime('now') WHERE id = ?").run(manager.user.id);
  });

  afterEach(() => {
    db.prepare('DELETE FROM order_items WHERE order_id LIKE ?').run(`${prefix}%`);
    db.prepare('DELETE FROM order_items WHERE product_id LIKE ?').run(`${prefix}%`);
    db.prepare('DELETE FROM orders WHERE id LIKE ?').run(`${prefix}%`);
    if (manager?.user?.id) {
      db.prepare('DELETE FROM orders WHERE user_id = ? AND customer_name = ?').run(manager.user.id, 'Scope Order');
    }
    db.prepare('DELETE FROM appointments WHERE id LIKE ? OR dog_name LIKE ?').run(`${prefix}%`, `${prefix}%`);
    db.prepare('DELETE FROM products WHERE id LIKE ?').run(`${prefix}%`);
    if (manager?.user?.id) {
      db.prepare('DELETE FROM user_store_links WHERE user_id = ?').run(manager.user.id);
      db.prepare('DELETE FROM users WHERE id = ?').run(manager.user.id);
    }
  });

  test('manager list is scoped to assigned stores and still includes NULL legacy rows', async () => {
    const insertOrder = db.prepare(`
      INSERT INTO orders (id, user_id, customer_name, status, total, notes, store_id, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', 10.0, NULL, ?, datetime('now'), datetime('now'))
    `);
    insertOrder.run(`${prefix}-a`, manager.user.id, 'Scope A', 'store-a');
    insertOrder.run(`${prefix}-b`, manager.user.id, 'Scope B', 'store-b');
    insertOrder.run(`${prefix}-c`, manager.user.id, 'Scope C', 'store-c');
    insertOrder.run(`${prefix}-null`, manager.user.id, 'Scope Null', null);

    const res = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${manager.token}`);
    expect(res.status).toBe(200);

    const ids = (res.body.data || []).map(o => o.id).filter(id => String(id).startsWith(prefix));
    expect(ids).toContain(`${prefix}-a`);
    expect(ids).toContain(`${prefix}-b`);
    expect(ids).toContain(`${prefix}-null`);
    expect(ids).not.toContain(`${prefix}-c`);
  });

  test('manager cannot query a store they are not assigned to', async () => {
    const res = await request(app)
      .get('/api/v1/orders?store_id=store-c')
      .set('Authorization', `Bearer ${manager.token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('multi-store manager must provide store_id when creating appointment', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const res = await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${manager.token}`)
      .send({
        dog_name: `${prefix}-dog`,
        date: tomorrow,
        time: '10:00',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('STORE_REQUIRED');
  });

  test('order creation respects explicit assigned store_id for multi-store manager', async () => {
    db.prepare(`
      INSERT INTO products (id, name, category, price, stock_quantity, is_active, store_id, created_at, updated_at)
      VALUES (?, ?, 'other', 12.5, 50, 1, 'store-b', datetime('now'), datetime('now'))
    `).run(`${prefix}-prod`, `${prefix}-product`);

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${manager.token}`)
      .send({
        customer_name: 'Scope Order',
        payment_method: 'in_store',
        items: [{ product_id: `${prefix}-prod`, quantity: 1 }],
        store_id: 'store-b',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.store_id).toBe('store-b');
  });

  test('manager with no store assignments cannot create write records', async () => {
    const noScope = createTestUser('store_manager', { email: `${prefix}-noscope@petcare.test` });
    db.prepare('DELETE FROM user_store_links WHERE user_id = ?').run(noScope.user.id);
    db.prepare('UPDATE users SET store_id = NULL, updated_at = datetime(\'now\') WHERE id = ?').run(noScope.user.id);

    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const apptRes = await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${noScope.token}`)
      .send({
        dog_name: `${prefix}-noscope-dog`,
        date: tomorrow,
        time: '11:00',
        store_id: 'store-a',
      });
    expect(apptRes.status).toBe(403);
    expect(apptRes.body.error.code).toBe('FORBIDDEN');

    db.prepare(`
      INSERT INTO products (id, name, category, price, stock_quantity, is_active, store_id, created_at, updated_at)
      VALUES (?, ?, 'other', 9.5, 20, 1, 'store-a', datetime('now'), datetime('now'))
    `).run(`${prefix}-noscope-prod`, `${prefix}-noscope-product`);

    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${noScope.token}`)
      .send({
        customer_name: 'No Scope',
        payment_method: 'in_store',
        items: [{ product_id: `${prefix}-noscope-prod`, quantity: 1 }],
        store_id: 'store-a',
      });
    expect(orderRes.status).toBe(403);
    expect(orderRes.body.error.code).toBe('FORBIDDEN');

    db.prepare('DELETE FROM user_store_links WHERE user_id = ?').run(noScope.user.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(noScope.user.id);
  });
});

describe('Feedback flow', () => {
  test('customer can submit feedback', async () => {
    const res = await request(app)
      .post('/api/v1/feedback')
      .set('Authorization', `Bearer ${roles.customer.token}`)
      .send({ category: 'improvement', message: 'Add more filters to order list' });

    expect(res.status).toBe(201);
    expect(res.body.data.category).toBe('improvement');
    expect(res.body.data.status).toBe('new');
    expect(res.body.data.message).toContain('filters');
  });

  test('admin can list feedback', async () => {
    const create = await request(app)
      .post('/api/v1/feedback')
      .set('Authorization', `Bearer ${roles.customer.token}`)
      .send({ category: 'bug', message: 'Shop page scroll feels sticky on web' });
    expect(create.status).toBe(201);

    const list = await request(app)
      .get('/api/v1/feedback?status=all')
      .set('Authorization', `Bearer ${roles.admin.token}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.data)).toBe(true);
    expect(list.body.data.some(r => r.id === create.body.data.id)).toBe(true);
  });

  test('non-admin cannot list feedback', async () => {
    const res = await request(app)
      .get('/api/v1/feedback')
      .set('Authorization', `Bearer ${roles.customer.token}`);
    expect(res.status).toBe(403);
  });

  test('admin can update feedback status and note', async () => {
    const create = await request(app)
      .post('/api/v1/feedback')
      .set('Authorization', `Bearer ${roles.customer.token}`)
      .send({ category: 'feature', message: 'Need CSV export for reports' });
    expect(create.status).toBe(201);

    const updated = await request(app)
      .put(`/api/v1/feedback/${create.body.data.id}`)
      .set('Authorization', `Bearer ${roles.admin.token}`)
      .send({ status: 'resolved', admin_note: 'Added to Q2 roadmap' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.status).toBe('resolved');
    expect(updated.body.data.admin_note).toBe('Added to Q2 roadmap');
  });
});
