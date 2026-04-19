const { app, db, request, createTestUser } = require('./helpers');

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

describe('Guest public route regression', () => {
  const prefix = `guest-public-${Date.now()}-`;

  afterAll(() => {
    db.prepare("DELETE FROM users WHERE email LIKE ?").run(`${prefix}%`);
  });

  test('GET /api/v1/advisor/status is public', async () => {
    const res = await request(app).get('/api/v1/advisor/status');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body?.data?.available_providers)).toBe(true);
  });

  test('POST /api/v1/advisor/chat validates request body without auth gate', async () => {
    const res = await request(app).post('/api/v1/advisor/chat').send({});
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_REQUEST');
  });

  test('POST /api/v1/ml/analyze validates image count without auth gate', async () => {
    const res = await request(app).post('/api/v1/ml/analyze');
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INSUFFICIENT_IMAGES');
  });

  test('POST /api/v1/recommendations/quick is public', async () => {
    const res = await request(app)
      .post('/api/v1/recommendations/quick')
      .send({
        traits: {
          coat_length: 'short',
          skin_sensitivity: 'low',
        },
        current_condition: {
          dirt_level_today: 'medium',
        },
      });
    expect(res.status).toBe(200);
    expect(res.body?.data?.recommended_program).toBeDefined();
    expect(typeof res.body?.data?.qr_code_url).toBe('string');
  });

  test('POST /api/v1/recommendations returns not-found for invalid dog id (not 401)', async () => {
    const res = await request(app)
      .post('/api/v1/recommendations')
      .send({ dog_id: 'missing-dog-id' });
    expect(res.status).toBe(404);
    expect(res.body?.error?.code).toBe('NOT_FOUND');
  });

  test('POST /api/v1/appointments/parse-voice validates body without auth gate', async () => {
    const res = await request(app)
      .post('/api/v1/appointments/parse-voice')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_REQUEST');
  });

  test('POST /api/v1/appointments/voice-book validates audio upload without auth gate', async () => {
    const res = await request(app).post('/api/v1/appointments/voice-book');
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_REQUEST');
  });

  test('GET /api/v1/social/public/feed returns public posts for guest', async () => {
    const author = createTestUser('customer', { email: `${prefix}feed-author@petcare.test` });
    const postRes = await request(app)
      .post('/api/v1/social/posts')
      .set(auth(author.token))
      .send({
        content: 'guest public feed test post',
        visibility: 'public',
      });
    expect(postRes.status).toBe(201);

    const feedRes = await request(app).get('/api/v1/social/public/feed');
    expect(feedRes.status).toBe(200);
    const items = feedRes.body?.data?.items || [];
    expect(items.some((item) => item.id === postRes.body?.data?.id)).toBe(true);
  });

  test('GET /api/v1/social/public/posts/:id and comments are readable by guest', async () => {
    const author = createTestUser('customer', { email: `${prefix}post-detail-author@petcare.test` });
    const postRes = await request(app)
      .post('/api/v1/social/posts')
      .set(auth(author.token))
      .send({
        content: 'guest public post detail test',
        visibility: 'public',
      });
    expect(postRes.status).toBe(201);
    const postId = postRes.body?.data?.id;
    expect(postId).toBeTruthy();

    const detailRes = await request(app).get(`/api/v1/social/public/posts/${postId}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body?.data?.id).toBe(postId);

    const commentsRes = await request(app).get(`/api/v1/social/public/posts/${postId}/comments`);
    expect(commentsRes.status).toBe(200);
    expect(Array.isArray(commentsRes.body?.data?.items)).toBe(true);
  });

  test('GET /api/v1/social/public/meetups returns public meetups for guest', async () => {
    const host = createTestUser('customer', { email: `${prefix}meetup-host@petcare.test` });
    const startAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
    const createRes = await request(app)
      .post('/api/v1/social/meetups')
      .set(auth(host.token))
      .send({
        title: 'Guest public meetup test',
        locationName: 'Public Park',
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        visibility: 'public',
      });
    expect(createRes.status).toBe(201);

    const listRes = await request(app)
      .get('/api/v1/social/public/meetups')
      .query({ query: 'public meetup test' });
    expect(listRes.status).toBe(200);
    const items = listRes.body?.data?.items || [];
    expect(items.some((item) => item.id === createRes.body?.data?.id)).toBe(true);
  });

  test('POST /api/v1/orders accepts guest checkout with customer_email', async () => {
    const productId = `prod-${Date.now()}`;
    db.prepare(`
      INSERT INTO products (id, name, category, price, stock_quantity, is_active)
      VALUES (?, 'Guest Checkout Product', 'other', 9.99, 20, 1)
    `).run(productId);

    const createOrderRes = await request(app)
      .post('/api/v1/orders')
      .send({
        customer_name: 'Guest Buyer',
        customer_phone: '555-1000',
        customer_email: 'guest-buyer@petcare.test',
        payment_method: 'in_store',
        items: [{ product_id: productId, quantity: 1 }],
      });

    expect(createOrderRes.status).toBe(201);
    expect(createOrderRes.body?.data?.user_id || null).toBeNull();
    expect(createOrderRes.body?.data?.customer_email).toBe('guest-buyer@petcare.test');
  });
});
