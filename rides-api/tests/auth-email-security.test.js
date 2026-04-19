const crypto = require('crypto');
const { app, db, request, createTestUser } = require('./helpers');

function hashAuthCode(userId, purpose, code) {
  return crypto
    .createHash('sha256')
    .update(`${String(userId)}:${String(purpose)}:${String(code)}`)
    .digest('hex');
}

function hashVerificationLinkToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

describe('Auth email security (email verification + device verify)', () => {
  const prefix = `auth-email-${Date.now()}`;
  const settingKey = 'auth_device_challenge_enabled';
  const originalSetting = db.prepare('SELECT value FROM store_settings WHERE key = ?').get(settingKey)?.value;

  afterAll(() => {
    if (originalSetting === undefined) {
      db.prepare('DELETE FROM store_settings WHERE key = ?').run(settingKey);
    } else {
      db.prepare("INSERT INTO store_settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
        .run(settingKey, originalSetting);
    }
    db.prepare("DELETE FROM trusted_devices WHERE user_id IN (SELECT id FROM users WHERE email LIKE ?)").run(`${prefix}%`);
    db.prepare("DELETE FROM email_verification_codes WHERE user_id IN (SELECT id FROM users WHERE email LIKE ?)").run(`${prefix}%`);
    db.prepare("DELETE FROM users WHERE email LIKE ?").run(`${prefix}%`);
  });

  test('signup returns email verification challenge metadata', async () => {
    const email = `${prefix}-signup@unforgettablerides.test`;
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email, password: 'Test123!', name: 'Email Verify User' });

    expect(res.status).toBe(201);
    expect(res.body?.data?.email_verification_required).toBe(true);
    expect(typeof res.body?.data?.verification_challenge_id).toBe('string');
    expect(res.body?.data?.user?.email_verified_at ?? null).toBeNull();
  });

  test('signed-in user can request and complete email verification via link', async () => {
    const user = createTestUser('customer', { email: `${prefix}-verify@unforgettablerides.test` });
    const sendRes = await request(app)
      .post('/api/v1/auth/email/send-verification')
      .set('Authorization', `Bearer ${user.token}`)
      .send({});

    expect(sendRes.status).toBe(200);
    expect(sendRes.body?.data?.sent).toBe(true);

    // Override token hash for deterministic test input.
    const token = 'verify-link-token-e2e';
    const row = db.prepare(`
      SELECT id
      FROM email_verification_codes
      WHERE user_id = ? AND purpose = 'email_verify_link'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(user.user.id);
    expect(row?.id).toBeDefined();
    db.prepare('UPDATE email_verification_codes SET code_hash = ? WHERE id = ?')
      .run(hashVerificationLinkToken(token), row.id);

    const verifyRes = await request(app)
      .get('/api/v1/auth/email/verify-link')
      .query({ token })
      .redirects(0);

    expect(verifyRes.status).toBe(200);
    expect(String(verifyRes.text || '')).toContain('Email verified');
    const updated = db.prepare('SELECT email_verified_at FROM users WHERE id = ?').get(user.user.id);
    expect(updated?.email_verified_at).toBeTruthy();
  });

  test('login/verify-device accepts valid challenge code and returns token', async () => {
    const user = createTestUser('customer', { email: `${prefix}-device@unforgettablerides.test` });
    const challengeId = `challenge-${Date.now()}`;
    const code = '654321';
    const metadata = JSON.stringify({
      device_fingerprint: 'device:e2e-browser-1',
      device_label: 'E2E Browser',
    });
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO email_verification_codes
      (id, user_id, email, purpose, code_hash, expires_at, used_at, attempt_count, max_attempts, metadata_json, created_at)
      VALUES (?, ?, ?, 'login_device', ?, ?, NULL, 0, 5, ?, datetime('now'))
    `).run(
      challengeId,
      user.user.id,
      user.user.email,
      hashAuthCode(user.user.id, 'login_device', code),
      expiresAt,
      metadata
    );

    const res = await request(app)
      .post('/api/v1/auth/login/verify-device')
      .send({ challenge_id: challengeId, code, device_name: 'E2E Browser' });

    expect(res.status).toBe(200);
    expect(typeof res.body?.data?.token).toBe('string');
    expect(res.body?.data?.user?.id).toBe(user.user.id);

    const trusted = db.prepare('SELECT * FROM trusted_devices WHERE user_id = ? AND device_fingerprint = ?')
      .get(user.user.id, 'device:e2e-browser-1');
    expect(trusted?.id).toBeDefined();
  });

  test('login respects auth_device_challenge_enabled setting', async () => {
    const user = createTestUser('customer', { email: `${prefix}-toggle@unforgettablerides.test` });
    db.prepare("DELETE FROM trusted_devices WHERE user_id = ?").run(user.user.id);

    db.prepare("INSERT INTO store_settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .run(settingKey, '1');
    const enabledRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.user.email, password: user.password, device_id: 'toggle-device-1' });
    expect(enabledRes.status).toBe(202);
    expect(enabledRes.body?.data?.challenge_required).toBe(true);

    db.prepare("INSERT INTO store_settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .run(settingKey, '0');
    db.prepare("DELETE FROM trusted_devices WHERE user_id = ?").run(user.user.id);
    const disabledRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.user.email, password: user.password, device_id: 'toggle-device-2' });
    expect(disabledRes.status).toBe(200);
    expect(typeof disabledRes.body?.data?.token).toBe('string');
  });

  test('repeat login challenge within short window reuses the same challenge id', async () => {
    const user = createTestUser('customer', { email: `${prefix}-reuse@unforgettablerides.test` });
    db.prepare("DELETE FROM trusted_devices WHERE user_id = ?").run(user.user.id);
    db.prepare("INSERT INTO store_settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .run(settingKey, '1');

    const first = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.user.email, password: user.password, device_id: 'reuse-device-1' });
    expect(first.status).toBe(202);
    expect(first.body?.data?.challenge_required).toBe(true);
    const challengeId = first.body?.data?.challenge_id;
    expect(typeof challengeId).toBe('string');

    const second = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.user.email, password: user.password, device_id: 'reuse-device-1' });
    expect(second.status).toBe(202);
    expect(second.body?.data?.challenge_id).toBe(challengeId);

    const count = db.prepare(`
      SELECT COUNT(*) as c
      FROM email_verification_codes
      WHERE user_id = ? AND purpose = 'login_device' AND used_at IS NULL
    `).get(user.user.id).c;
    expect(count).toBe(1);
  });

  test('store manager cannot update security settings through /settings', async () => {
    const manager = createTestUser('store_manager', { email: `${prefix}-manager@unforgettablerides.test` });
    const res = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${manager.token}`)
      .send({ auth_device_challenge_enabled: '1' });
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  });

  test('user can change email with code verification', async () => {
    const oldEmail = `${prefix}-emailchange-old@unforgettablerides.test`;
    const user = createTestUser('customer', { email: oldEmail, password: 'EmailOld1!' });
    const newEmail = `${prefix}-emailchange-new@unforgettablerides.test`;

    const requestRes = await request(app)
      .post('/api/v1/auth/email/change/request')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ new_email: newEmail, current_password: 'EmailOld1!' });
    expect(requestRes.status).toBe(200);
    expect(requestRes.body?.data?.sent).toBe(true);

    const code = '112233';
    const row = db.prepare(`
      SELECT id
      FROM email_verification_codes
      WHERE user_id = ? AND purpose = 'email_change'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(user.user.id);
    expect(row?.id).toBeDefined();
    db.prepare('UPDATE email_verification_codes SET code_hash = ? WHERE id = ?')
      .run(hashAuthCode(user.user.id, 'email_change', code), row.id);

    const confirmRes = await request(app)
      .post('/api/v1/auth/email/change/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ code });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body?.data?.changed).toBe(true);
    expect(confirmRes.body?.data?.user?.email).toBe(newEmail);
    expect(confirmRes.body?.data?.user?.email_verified_at).toBeTruthy();
  });
});

