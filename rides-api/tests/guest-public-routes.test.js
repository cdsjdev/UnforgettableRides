const { app, request } = require('./helpers');

describe('Guest public route regression', () => {
  test('legacy advisor endpoint is removed', async () => {
    const res = await request(app).get('/api/v1/advisor/status');
    expect(res.status).toBe(410);
    expect(res.body?.error?.code).toBe('ENDPOINT_REMOVED');
  });

  test('legacy recommendations endpoints are removed', async () => {
    const quickRes = await request(app).post('/api/v1/recommendations/quick').send({});
    expect(quickRes.status).toBe(410);
    expect(quickRes.body?.error?.code).toBe('ENDPOINT_REMOVED');

    const normalRes = await request(app).post('/api/v1/recommendations').send({});
    expect(normalRes.status).toBe(410);
    expect(normalRes.body?.error?.code).toBe('ENDPOINT_REMOVED');
  });

  test('legacy appointment voice endpoints are removed', async () => {
    const parseRes = await request(app).post('/api/v1/appointments/parse-voice').send({});
    expect(parseRes.status).toBe(410);
    expect(parseRes.body?.error?.code).toBe('ENDPOINT_REMOVED');

    const voiceRes = await request(app).post('/api/v1/appointments/voice-book');
    expect(voiceRes.status).toBe(410);
    expect(voiceRes.body?.error?.code).toBe('ENDPOINT_REMOVED');
  });

  test('legacy commerce endpoints are removed', async () => {
    const ordersRes = await request(app).post('/api/v1/orders').send({});
    expect(ordersRes.status).toBe(410);
    expect(ordersRes.body?.error?.code).toBe('ENDPOINT_REMOVED');

    const productsRes = await request(app).get('/api/v1/products');
    expect(productsRes.status).toBe(410);
    expect(productsRes.body?.error?.code).toBe('ENDPOINT_REMOVED');
  });

  test('rides endpoint stays available publicly', async () => {
    const carsRes = await request(app).get('/api/v1/cars');
    expect(carsRes.status).toBe(200);
    expect(Array.isArray(carsRes.body?.data?.items)).toBe(true);
  });
});
