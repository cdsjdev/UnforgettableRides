function registerAuthRoutes({
  app,
  apiResponse,
  authMiddleware,
  roleGuard,
  db,
  rateLimit,
  RATE_LIMIT_MAX_LOGIN,
  RATE_LIMIT_MAX_SIGNUP,
  bcrypt,
  jwt,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  uuidv4,
  crypto,
  hashPasswordResetToken,
  PASSWORD_RESET_TOKEN_EXPIRES_MIN,
  PASSWORD_RESET_BASE_URL,
  sendPasswordResetEmail,
  sendAuthCodeEmail,
  sendEmailVerificationLinkEmail,
  AUTH_CODE_EXPIRES_MIN,
  AUTH_CODE_MAX_ATTEMPTS,
  DEVICE_TRUST_DAYS,
  isAuthDeviceChallengeEnabled,
  isAuthRequireVerifiedForSensitive,
  getPublicAppBaseUrl,
  normalizeStoreId,
}) {
  const LOGIN_DEVICE_CHALLENGE_REUSE_WINDOW_SECONDS = 30;

  const userTableColumns = new Set(
    db.prepare("PRAGMA table_info('users')").all().map((c) => String(c.name || '').toLowerCase())
  );
  const hasDefaultShippingAddress = userTableColumns.has('default_shipping_address');

  const ACTIVE_USER_SELECT = `
    SELECT id, email, name, phone_number, avatar_url,
           ${hasDefaultShippingAddress ? 'default_shipping_address' : 'NULL AS default_shipping_address'},
           notification_email_enabled, notification_sms_enabled,
           role, store_id, email_verified_at, is_active, created_at, updated_at
    FROM users
    WHERE id = ?
  `;

  function mapActiveUser(row) {
    if (!row) return row;
    let parsedShipping = null;
    if (row.default_shipping_address) {
      try {
        parsedShipping = typeof row.default_shipping_address === 'string'
          ? JSON.parse(row.default_shipping_address)
          : row.default_shipping_address;
      } catch (_) {
        parsedShipping = null;
      }
    }
    return {
      ...row,
      default_shipping_address: parsedShipping,
      notification_email_enabled: !!row.notification_email_enabled,
      notification_sms_enabled: !!row.notification_sms_enabled,
      is_active: !!row.is_active,
    };
  }

  function normalizeShippingAddressInput(rawInput, { requireRecipient = false } = {}) {
    const input = rawInput || {};
    const recipientName = String(input.recipient_name || '').trim();
    const addressLine1 = String(input.address_line1 || '').trim();
    const city = String(input.city || '').trim();
    const state = String(input.state || '').trim();
    const postalCode = String(input.postal_code || '').trim();
    const country = String(input.country || '').trim().toUpperCase();
    const label = String(input.label || '').trim() || null;
    const addressLine2 = String(input.address_line2 || '').trim() || null;

    if (requireRecipient && !recipientName) {
      return { error: { code: 'VALIDATION', message: 'recipient_name is required.' } };
    }
    if (!addressLine1 || !city || !state || !postalCode || !country) {
      return {
        error: {
          code: 'VALIDATION',
          message: 'Shipping address is required (address_line1, city, state, postal_code, country).',
        },
      };
    }
    if (!/^[A-Z]{2}$/.test(country)) {
      return {
        error: {
          code: 'SHIPPING_COUNTRY_INVALID',
          message: 'country must be a 2-letter ISO code (for example US).',
        },
      };
    }

    return {
      value: {
        label,
        recipient_name: recipientName || null,
        address_line1: addressLine1,
        address_line2: addressLine2,
        city,
        state,
        postal_code: postalCode,
        country,
      },
    };
  }

  function toLegacyDefaultShippingAddress(addressRow) {
    if (!addressRow) return null;
    return {
      address_line1: addressRow.address_line1,
      address_line2: addressRow.address_line2 || null,
      city: addressRow.city,
      state: addressRow.state,
      postal_code: addressRow.postal_code,
      country: addressRow.country,
    };
  }

  function syncUserDefaultShippingAddress(userId) {
    if (!hasDefaultShippingAddress) return;
    const defaultRow = db.prepare(`
      SELECT address_line1, address_line2, city, state, postal_code, country
      FROM user_shipping_addresses
      WHERE user_id = ? AND is_default = 1
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(userId);
    const serialized = defaultRow ? JSON.stringify(toLegacyDefaultShippingAddress(defaultRow)) : null;
    db.prepare("UPDATE users SET default_shipping_address = ?, updated_at = datetime('now') WHERE id = ?").run(serialized, userId);
  }

  function createSixDigitCode() {
    return String(crypto.randomInt(100000, 1000000));
  }

  function hashAuthCode(userId, purpose, code) {
    return crypto
      .createHash('sha256')
      .update(`${String(userId)}:${String(purpose)}:${String(code || '').trim()}`)
      .digest('hex');
  }

  function hashVerificationLinkToken(token) {
    return crypto.createHash('sha256').update(String(token || '')).digest('hex');
  }

  function resolvePublicBaseUrl(req) {
    const configured = String(
      (typeof getPublicAppBaseUrl === 'function' ? getPublicAppBaseUrl() : '')
      || process.env.EMAIL_VERIFY_BASE_URL
      || process.env.PUBLIC_APP_BASE_URL
      || PASSWORD_RESET_BASE_URL
      || ''
    ).trim();

    const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
    const proto = forwardedProto || req?.protocol || 'http';
    const host = typeof req?.get === 'function' ? String(req.get('host') || '').trim() : '';
    const requestBase = host ? `${proto}://${host}` : '';

    const isLocal = (value) => /localhost|127\.0\.0\.1/i.test(String(value || ''));
    if (configured && !(isLocal(configured) && requestBase && !isLocal(requestBase))) {
      return configured.replace(/\/+$/, '');
    }
    if (requestBase) return requestBase.replace(/\/+$/, '');
    return 'http://localhost:5173';
  }

  function resolveRequestBaseUrl(req) {
    const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
    const proto = forwardedProto || req?.protocol || 'http';
    const host = typeof req?.get === 'function' ? String(req.get('host') || '').trim() : '';
    if (!host) return '';
    return `${proto}://${host}`.replace(/\/+$/, '');
  }

  function resolveResetBaseUrl(req, clientType) {
    const client = String(clientType || '').trim().toLowerCase();
    if (client === 'dashboard') {
      // Dashboard reset links should never fall back to API origin (e.g. localhost:3000),
      // because the reset UI is hosted by the dashboard web app.
      return String(process.env.PUBLIC_DASHBOARD_BASE_URL || process.env.DASHBOARD_BASE_URL || '').trim().replace(/\/+$/, '')
        || 'http://localhost:5173';
    }
    // Default to customer-facing app URL.
    return String((typeof getPublicAppBaseUrl === 'function' ? getPublicAppBaseUrl() : '') || resolvePublicBaseUrl(req) || '').trim().replace(/\/+$/, '')
      || 'http://localhost:8081';
  }

  function buildEmailVerifyLink(token, req) {
    const base = resolvePublicBaseUrl(req);
    return `${base}/api/v1/auth/email/verify-link?token=${encodeURIComponent(token)}`;
  }

  function createDeviceFingerprint(req, rawDeviceId) {
    const deviceId = String(rawDeviceId || '').trim();
    if (deviceId) return `device:${deviceId.slice(0, 256)}`;
    const ua = String(req.headers['user-agent'] || '').slice(0, 512);
    const ip = String(req.ip || req.socket?.remoteAddress || '').slice(0, 128);
    const digest = crypto.createHash('sha256').update(`${ua}|${ip}`).digest('hex');
    return `fallback:${digest}`;
  }

  function upsertTrustedDevice({ userId, fingerprint, label, ip, userAgent }) {
    const expiresAt = new Date(Date.now() + DEVICE_TRUST_DAYS * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO trusted_devices
      (id, user_id, device_fingerprint, label, first_seen_ip, last_seen_ip, last_seen_user_agent, verified_at, expires_at, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'), datetime('now'))
      ON CONFLICT(user_id, device_fingerprint) DO UPDATE SET
        label = excluded.label,
        last_seen_ip = excluded.last_seen_ip,
        last_seen_user_agent = excluded.last_seen_user_agent,
        verified_at = datetime('now'),
        expires_at = excluded.expires_at,
        last_seen_at = datetime('now')
    `).run(
      uuidv4(),
      userId,
      fingerprint,
      label || null,
      ip || null,
      ip || null,
      userAgent || null,
      expiresAt
    );
  }

  function queueAuthCode({ user, purpose, metadata = null, targetEmail = null }) {
    const code = createSixDigitCode();
    const codeHash = hashAuthCode(user.id, purpose, code);
    const expiresAt = new Date(Date.now() + AUTH_CODE_EXPIRES_MIN * 60 * 1000).toISOString();
    const challengeId = uuidv4();
    const destinationEmail = String(targetEmail || user.email || '').trim().toLowerCase();
    const tx = db.transaction(() => {
      db.prepare(`
        DELETE FROM email_verification_codes
        WHERE user_id = ? AND purpose = ?
      `).run(user.id, purpose);
      db.prepare(`
        INSERT INTO email_verification_codes
        (id, user_id, email, purpose, code_hash, expires_at, max_attempts, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        challengeId,
        user.id,
        destinationEmail,
        purpose,
        codeHash,
        expiresAt,
        AUTH_CODE_MAX_ATTEMPTS,
        metadata ? JSON.stringify(metadata) : null
      );
    });
    tx();
    return { challengeId, code, expiresAt };
  }

  function parseMetadataJson(raw) {
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch (_) {
      return {};
    }
  }

  function findReusableLoginDeviceChallenge(userId, deviceFingerprint) {
    const rows = db.prepare(`
      SELECT id, expires_at, metadata_json, created_at
      FROM email_verification_codes
      WHERE user_id = ?
        AND purpose = 'login_device'
        AND used_at IS NULL
        AND datetime(expires_at) > datetime('now')
      ORDER BY datetime(created_at) DESC
      LIMIT 5
    `).all(userId);
    for (const row of rows) {
      const metadata = parseMetadataJson(row.metadata_json);
      const fp = String(metadata?.device_fingerprint || '').trim();
      if (fp !== String(deviceFingerprint || '').trim()) continue;
      const createdMs = new Date(row.created_at).getTime();
      if (!Number.isFinite(createdMs)) continue;
      const ageSeconds = Math.max(0, (Date.now() - createdMs) / 1000);
      if (ageSeconds <= LOGIN_DEVICE_CHALLENGE_REUSE_WINDOW_SECONDS) {
        return row;
      }
      return null;
    }
    return null;
  }

  function ensureVerifiedForSensitive(user, res, apiResponse) {
    if (!isAuthRequireVerifiedForSensitive()) return true;
    if (user?.email_verified_at) return true;
    res.status(403).json(apiResponse(null, {
      code: 'EMAIL_VERIFICATION_REQUIRED',
      message: 'Please verify your email before this action.',
    }));
    return false;
  }
  
  // POST /api/v1/auth/login
  app.post('/api/v1/auth/login', (req, res) => {
    // Rate limit by IP
    const ip = req.ip || req.socket.remoteAddress;
    const rateKey = `login:${ip}`;
    const blocked = rateLimit(rateKey, RATE_LIMIT_MAX_LOGIN, { peek: true });
    if (blocked) {
      res.set('Retry-After', String(blocked));
      return res.status(429).json(apiResponse(null, { code: 'RATE_LIMITED', message: `Too many login attempts. Try again in ${Math.ceil(blocked / 60)} minute(s).` }));
    }
  
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'Email and password are required' }));
    }
  
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (!user) {
      rateLimit(rateKey, RATE_LIMIT_MAX_LOGIN);
      return res.status(401).json(apiResponse(null, { code: 'UNAUTHORIZED', message: 'Invalid email or password' }));
    }
    if (!user.is_active) {
      rateLimit(rateKey, RATE_LIMIT_MAX_LOGIN);
      return res.status(401).json(apiResponse(null, { code: 'UNAUTHORIZED', message: 'Account is disabled' }));
    }
    if (!bcrypt.compareSync(password, user.password_hash)) {
      rateLimit(rateKey, RATE_LIMIT_MAX_LOGIN);
      return res.status(401).json(apiResponse(null, { code: 'UNAUTHORIZED', message: 'Invalid email or password' }));
    }
  
    const loginIp = req.ip || req.socket?.remoteAddress || null;
    const userAgent = String(req.headers['user-agent'] || '');
    const fingerprint = createDeviceFingerprint(req, req.body?.device_id);
    const trusted = db.prepare(`
      SELECT id
      FROM trusted_devices
      WHERE user_id = ?
        AND device_fingerprint = ?
        AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
      LIMIT 1
    `).get(user.id, fingerprint);

    if (isAuthDeviceChallengeEnabled() && !trusted) {
      rateLimit(rateKey, RATE_LIMIT_MAX_LOGIN, { reset: true });
      const reusableChallenge = findReusableLoginDeviceChallenge(user.id, fingerprint);
      if (reusableChallenge) {
        return res.status(202).json(apiResponse({
          challenge_required: true,
          challenge_type: 'email_code',
          challenge_id: reusableChallenge.id,
          expires_at: reusableChallenge.expires_at,
          message: 'Verification code already sent to your email. Please use the latest code.',
        }));
      }
      const metadata = {
        device_fingerprint: fingerprint,
        device_label: String(req.body?.device_name || '').trim() || null,
        ip: loginIp ? String(loginIp).slice(0, 128) : null,
        user_agent: userAgent.slice(0, 512),
      };
      const { challengeId, code, expiresAt } = queueAuthCode({ user, purpose: 'login_device', metadata });
      sendAuthCodeEmail({
        email: user.email,
        userName: user.name,
        purpose: 'login_device',
        code,
        expiresMinutes: AUTH_CODE_EXPIRES_MIN,
      }).catch(() => {});

      return res.status(202).json(apiResponse({
        challenge_required: true,
        challenge_type: 'email_code',
        challenge_id: challengeId,
        expires_at: expiresAt,
        message: 'Verification code sent to your email for this new device.',
      }));
    }

    upsertTrustedDevice({
      userId: user.id,
      fingerprint,
      label: String(req.body?.device_name || '').trim() || null,
      ip: loginIp ? String(loginIp).slice(0, 128) : null,
      userAgent: userAgent.slice(0, 512),
    });
    rateLimit(rateKey, RATE_LIMIT_MAX_LOGIN, { reset: true });

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    const safeUser = mapActiveUser(db.prepare(ACTIVE_USER_SELECT).get(user.id));
    res.json(apiResponse({ token, user: safeUser }));
  });

  // POST /api/v1/auth/login/verify-device
  app.post('/api/v1/auth/login/verify-device', (req, res) => {
    const challengeId = String(req.body?.challenge_id || '').trim();
    const code = String(req.body?.code || '').trim();
    if (!challengeId || !code) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'challenge_id and code are required' }));
    }

    const row = db.prepare(`
      SELECT *
      FROM email_verification_codes
      WHERE id = ? AND purpose = 'login_device'
      LIMIT 1
    `).get(challengeId);
    if (!row || row.used_at) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_CODE', message: 'Verification code is invalid or expired' }));
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_CODE', message: 'Verification code is invalid or expired' }));
    }
    if (Number(row.attempt_count || 0) >= Number(row.max_attempts || AUTH_CODE_MAX_ATTEMPTS)) {
      return res.status(429).json(apiResponse(null, { code: 'TOO_MANY_ATTEMPTS', message: 'Too many incorrect attempts. Request a new code.' }));
    }

    const expected = hashAuthCode(row.user_id, row.purpose, code);
    if (expected !== row.code_hash) {
      db.prepare('UPDATE email_verification_codes SET attempt_count = attempt_count + 1 WHERE id = ?').run(row.id);
      return res.status(400).json(apiResponse(null, { code: 'INVALID_CODE', message: 'Verification code is invalid or expired' }));
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
    if (!user || !user.is_active) {
      return res.status(401).json(apiResponse(null, { code: 'UNAUTHORIZED', message: 'User not found or inactive' }));
    }

    let metadata = {};
    try {
      metadata = row.metadata_json ? JSON.parse(row.metadata_json) : {};
    } catch (_) {
      metadata = {};
    }
    const fallbackFingerprint = createDeviceFingerprint(req, req.body?.device_id);
    const fingerprint = String(metadata?.device_fingerprint || fallbackFingerprint);
    const ip = String(req.ip || req.socket?.remoteAddress || '').slice(0, 128) || null;
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 512);
    const label = String(req.body?.device_name || metadata?.device_label || '').trim() || null;

    const tx = db.transaction(() => {
      db.prepare("UPDATE email_verification_codes SET used_at = datetime('now') WHERE id = ?").run(row.id);
      upsertTrustedDevice({ userId: user.id, fingerprint, label, ip, userAgent });
    });
    tx();

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    const safeUser = mapActiveUser(db.prepare(ACTIVE_USER_SELECT).get(user.id));
    return res.json(apiResponse({ token, user: safeUser }));
  });
  
  // GET /api/v1/auth/me
  app.get('/api/v1/auth/me', authMiddleware, (req, res) => {
    const me = mapActiveUser(db.prepare(ACTIVE_USER_SELECT).get(req.user.id));
    res.json(apiResponse(me));
  });

  // POST /api/v1/auth/role/become-owner
  // Allow a signed-in customer to enable owner capabilities on the same account.
  app.post('/api/v1/auth/role/become-owner', authMiddleware, (req, res) => {
    const user = mapActiveUser(db.prepare(ACTIVE_USER_SELECT).get(req.user.id));
    if (!user || !user.is_active) {
      return res.status(401).json(apiResponse(null, { code: 'UNAUTHORIZED', message: 'User not found or inactive' }));
    }
    if (user.role === 'owner' || user.role === 'admin') {
      return res.json(apiResponse(user));
    }
    if (user.role !== 'customer') {
      return res.status(400).json(apiResponse(null, {
        code: 'INVALID_REQUEST',
        message: 'Only customer accounts can self-enable owner access',
      }));
    }

    db.prepare("UPDATE users SET role = 'owner', updated_at = datetime('now') WHERE id = ?").run(user.id);
    const updated = mapActiveUser(db.prepare(ACTIVE_USER_SELECT).get(user.id));
    return res.json(apiResponse(updated));
  });
  
  // PUT /api/v1/auth/password
  app.put('/api/v1/auth/password', authMiddleware, (req, res) => {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'Current and new password are required' }));
    }
    if (new_password.length < 6) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'New password must be at least 6 characters' }));
    }
  
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!ensureVerifiedForSensitive(user, res, apiResponse)) return;
    if (!bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(401).json(apiResponse(null, { code: 'UNAUTHORIZED', message: 'Current password is incorrect' }));
    }
  
    const hash = bcrypt.hashSync(new_password, 10);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime(?) WHERE id = ?')
      .run(hash, new Date().toISOString(), req.user.id);
    res.json(apiResponse({ message: 'Password updated successfully' }));
  });

  // POST /api/v1/auth/verify-password
  // Lightweight re-auth check for sensitive admin UI actions.
  app.post('/api/v1/auth/verify-password', authMiddleware, (req, res) => {
    const currentPassword = String(req.body?.current_password || '');
    if (!currentPassword) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'Current password is required' }));
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user || !user.is_active) {
      return res.status(401).json(apiResponse(null, { code: 'UNAUTHORIZED', message: 'User not found or inactive' }));
    }
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json(apiResponse(null, { code: 'UNAUTHORIZED', message: 'Current password is incorrect' }));
    }
    return res.json(apiResponse({ verified: true }));
  });
  
  // DELETE /api/v1/auth/account
  // Self-service account deletion (soft delete + email tombstone so the original email can re-register)
  app.delete('/api/v1/auth/account', authMiddleware, (req, res) => {
    const { current_password } = req.body || {};
    if (!current_password) {
      return res.status(400).json(apiResponse(null, {
        code: 'INVALID_REQUEST',
        message: 'Current password is required',
      }));
    }
  
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user || !user.is_active) {
      return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'User not found' }));
    }
    if (!ensureVerifiedForSensitive(user, res, apiResponse)) return;
  
    if (!bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(401).json(apiResponse(null, {
        code: 'UNAUTHORIZED',
        message: 'Current password is incorrect',
      }));
    }
  
    // Prevent deleting the last active admin account.
    if (user.role === 'admin') {
      const activeAdminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND is_active = 1").get().count;
      if (activeAdminCount <= 1) {
        return res.status(409).json(apiResponse(null, {
          code: 'LAST_ADMIN',
          message: 'Cannot delete the last active admin account.',
        }));
      }
    }
  
    const tombstoneEmail = `deleted+${user.id}@deleted.local`;
    const randomHash = bcrypt.hashSync(uuidv4(), 10);
    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE users
        SET email = ?,
            password_hash = ?,
            name = 'Deleted User',
            phone_number = NULL,
            avatar_url = NULL,
            notification_email_enabled = 0,
            notification_sms_enabled = 0,
            is_active = 0,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(tombstoneEmail, randomHash, user.id);
  
      db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);
  
      db.prepare(`
        UPDATE business_memberships
        SET is_active = 0, updated_at = datetime('now')
        WHERE user_id = ?
      `).run(user.id);
  
      db.prepare(`
        UPDATE customer_business_links
        SET is_active = 0, unlinked_at = datetime('now'),
            notes = CASE WHEN notes IS NULL OR notes = '' THEN 'customer account deleted' ELSE notes END
        WHERE customer_user_id = ? AND is_active = 1
      `).run(user.id);
  
      db.prepare(`
        UPDATE customer_business_links
        SET is_active = 0, unlinked_at = datetime('now'),
            notes = CASE WHEN notes IS NULL OR notes = '' THEN 'business member account deleted' ELSE notes END
        WHERE business_membership_id IN (SELECT id FROM business_memberships WHERE user_id = ?) AND is_active = 1
      `).run(user.id);
    });
    tx();
  
    res.json(apiResponse({ message: 'Account deleted successfully' }));
  });
  
  // POST /api/v1/auth/password/forgot
  // Always returns success to avoid account enumeration.
  app.post('/api/v1/auth/password/forgot', async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress;
    const blocked = rateLimit(`forgot:${ip}`, RATE_LIMIT_MAX_SIGNUP);
    if (blocked) {
      res.set('Retry-After', String(blocked));
      return res.status(429).json(apiResponse(null, { code: 'RATE_LIMITED', message: `Too many attempts. Try again in ${Math.ceil(blocked / 60)} minute(s).` }));
    }
  
    const email = String(req.body?.email || '').toLowerCase().trim();
    if (!email) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'Email is required' }));
    }
  
    const user = db.prepare('SELECT id, email, name, is_active FROM users WHERE email = ?').get(email);
    if (user && user.is_active) {
      const token = `${uuidv4().replace(/-/g, '')}${uuidv4().replace(/-/g, '')}`;
      const tokenHash = hashPasswordResetToken(token);
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_EXPIRES_MIN * 60 * 1000).toISOString();
  
      const tx = db.transaction(() => {
        db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ? OR datetime(expires_at) <= datetime('now')").run(user.id);
        db.prepare(`
          INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `).run(uuidv4(), user.id, tokenHash, expiresAt);
      });
      tx();
  
      // For password reset, always prefer explicit configured app base URL.
      // Falling back to request host can incorrectly point to API origin (e.g. :3000).
      const configuredResetBase = String(
        (typeof getPublicAppBaseUrl === 'function' ? getPublicAppBaseUrl() : '')
        || ''
      ).trim().replace(/\/+$/, '');
      const client = String(req.body?.client || 'app').trim().toLowerCase();
      const resetBase = resolveResetBaseUrl(req, client) || configuredResetBase || resolvePublicBaseUrl(req);
      const returnTo = client === 'app'
        ? String((typeof getPublicAppBaseUrl === 'function' ? getPublicAppBaseUrl() : '') || '').trim().replace(/\/+$/, '')
        : String(process.env.PUBLIC_DASHBOARD_BASE_URL || process.env.DASHBOARD_BASE_URL || resolveRequestBaseUrl(req) || '').trim().replace(/\/+$/, '');
      const resetUrl = `${resetBase}/reset-password?token=${encodeURIComponent(token)}&client=${encodeURIComponent(client)}${returnTo ? `&return_to=${encodeURIComponent(returnTo)}` : ''}`;
      await sendPasswordResetEmail({ email: user.email, resetUrl, userName: user.name, client });
    }
  
    return res.json(apiResponse({ message: 'If this email is registered, a password reset link has been sent.' }));
  });
  
  // POST /api/v1/auth/password/reset
  app.post('/api/v1/auth/password/reset', (req, res) => {
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.new_password || '');
  
    if (!token || !newPassword) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'Token and new_password are required' }));
    }
    if (newPassword.length < 6) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'New password must be at least 6 characters' }));
    }
  
    const tokenHash = hashPasswordResetToken(token);
    const row = db.prepare(`
      SELECT id, user_id, expires_at, used_at
      FROM password_reset_tokens
      WHERE token_hash = ?
      LIMIT 1
    `).get(tokenHash);
  
    if (!row || row.used_at) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_TOKEN', message: 'Reset token is invalid or expired' }));
    }
  
    const expiresMs = new Date(row.expires_at).getTime();
    if (!expiresMs || Number.isNaN(expiresMs) || expiresMs < Date.now()) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_TOKEN', message: 'Reset token is invalid or expired' }));
    }
  
    const user = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(row.user_id);
    if (!user || !user.is_active) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_TOKEN', message: 'Reset token is invalid or expired' }));
    }
  
    const newHash = bcrypt.hashSync(newPassword, 10);
    const tx = db.transaction(() => {
      db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(newHash, row.user_id);
      db.prepare("UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?").run(row.id);
      db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ? AND id != ?").run(row.user_id, row.id);
    });
    tx();
  
    return res.json(apiResponse({ message: 'Password reset successfully' }));
  });
  
  // POST /api/v1/auth/signup (public self-registration, creates customer user + returns JWT)
  // Customer role has access to customer-facing marketplace features.
  // Staff/manager/admin accounts must be created by an admin via /auth/register
  app.post('/api/v1/auth/signup', (req, res) => {
    // Rate limit by IP
    const ip = req.ip || req.socket.remoteAddress;
    const blocked = rateLimit(`signup:${ip}`, RATE_LIMIT_MAX_SIGNUP);
    if (blocked) {
      res.set('Retry-After', String(blocked));
      return res.status(429).json(apiResponse(null, { code: 'RATE_LIMITED', message: `Too many signup attempts. Try again in ${Math.ceil(blocked / 60)} minute(s).` }));
    }
  
    const { email, password, name, role: requestedRole } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'Email, password, and name are required' }));
    }
    if (password.length < 6) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'Password must be at least 6 characters' }));
    }
    const signupRole = (requestedRole === 'owner') ? 'owner' : 'customer';
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) {
      return res.status(409).json(apiResponse(null, { code: 'CONFLICT', message: 'Email already registered' }));
    }

    const id = uuidv4();
    const hash = bcrypt.hashSync(password, 10);
    db.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, store_id, email_verified_at) VALUES (?, ?, ?, ?, ?, ?, NULL)'
    ).run(id, email.toLowerCase().trim(), hash, name.trim(), signupRole, null);

    const newUser = mapActiveUser(db.prepare(ACTIVE_USER_SELECT).get(id));
    const { challengeId, code, expiresAt } = queueAuthCode({
      user: { id, email: newUser.email, name: newUser.name },
      purpose: 'email_verify',
    });
    sendAuthCodeEmail({
      email: newUser.email,
      userName: newUser.name,
      purpose: 'email_verify',
      code,
      expiresMinutes: AUTH_CODE_EXPIRES_MIN,
    }).catch(() => {});
    const token = jwt.sign({ userId: id, role: signupRole }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.status(201).json(apiResponse({
      token,
      user: newUser,
      email_verification_required: true,
      verification_challenge_id: challengeId,
      verification_expires_at: expiresAt,
    }));
  });
  
  // POST /api/v1/auth/register (admin only)
  app.post('/api/v1/auth/register', authMiddleware, roleGuard('admin'), (req, res) => {
    const { email, password, name, role, store_id } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'Email, password, and name are required' }));
    }
    if (password.length < 6) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'Password must be at least 6 characters' }));
    }
    const validRoles = ['admin', 'owner', 'customer'];
    const userRole = role || 'staff';
    if (!validRoles.includes(userRole)) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: `Role must be one of: ${validRoles.join(', ')}` }));
    }
  
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) {
      return res.status(409).json(apiResponse(null, { code: 'CONFLICT', message: 'Email already registered' }));
    }
  
    const id = uuidv4();
    const hash = bcrypt.hashSync(password, 10);
    db.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, store_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, email.toLowerCase().trim(), hash, name.trim(), userRole, store_id || null);
  
    if (store_id) {
      db.prepare(`
        INSERT INTO user_store_links (user_id, store_id, is_active, created_at, updated_at)
        VALUES (?, ?, 1, datetime('now'), datetime('now'))
        ON CONFLICT(user_id, store_id) DO UPDATE SET is_active = 1, updated_at = datetime('now')
      `).run(id, store_id);
    }
  
    const newUser = mapActiveUser(db.prepare(ACTIVE_USER_SELECT).get(id));
    res.status(201).json(apiResponse(newUser));
  });
  
  // GET /api/v1/users (admin only)
  app.get('/api/v1/users', authMiddleware, roleGuard('admin'), (req, res) => {
    const users = db.prepare('SELECT id, email, name, phone_number, avatar_url, notification_email_enabled, notification_sms_enabled, role, store_id, email_verified_at, is_active, created_at, updated_at FROM users ORDER BY created_at DESC').all();
    res.json(apiResponse(users));
  });
  
  // PUT /api/v1/users/:id (admin only)
  app.put('/api/v1/users/:id', authMiddleware, roleGuard('admin'), (req, res) => {
    const { name, role, store_id, is_active } = req.body;
    const target = db.prepare('SELECT id, role, is_active FROM users WHERE id = ?').get(req.params.id);
    if (!target) {
      return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'User not found' }));
    }
  
    // Prevent last-admin lockout: block deactivating or demoting when it would leave zero active admins
    const wouldLoseAdmin = (target.role === 'admin' && target.is_active) &&
      ((is_active === false || is_active === 0) || (role !== undefined && role !== 'admin'));
    if (wouldLoseAdmin) {
      const activeAdminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND is_active = 1").get().count;
      if (activeAdminCount <= 1) {
        return res.status(409).json(apiResponse(null, {
          code: 'LAST_ADMIN',
          message: 'Cannot deactivate or demote the last active admin account.',
        }));
      }
    }
  
    if (role !== undefined) {
      const validRoles = ['admin', 'owner', 'customer'];
      if (!validRoles.includes(role)) {
        return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: `Role must be one of: ${validRoles.join(', ')}` }));
      }
    }
  
    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name.trim()); }
    if (role !== undefined) { updates.push('role = ?'); params.push(role); }
    if (store_id !== undefined) { updates.push('store_id = ?'); params.push(store_id || null); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }
  
    if (updates.length === 0) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'No fields to update' }));
    }
  
    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  
    if (role === 'admin') {
      db.prepare('DELETE FROM user_store_links WHERE user_id = ?').run(req.params.id);
      db.prepare('UPDATE users SET store_id = NULL, updated_at = datetime(\'now\') WHERE id = ?').run(req.params.id);
    } else if (store_id !== undefined) {
      db.prepare('DELETE FROM user_store_links WHERE user_id = ?').run(req.params.id);
      if (store_id) {
        db.prepare(`
          INSERT INTO user_store_links (user_id, store_id, is_active, created_at, updated_at)
          VALUES (?, ?, 1, datetime('now'), datetime('now'))
        `).run(req.params.id, store_id);
      }
    }
  
    const updated = mapActiveUser(db.prepare(ACTIVE_USER_SELECT).get(req.params.id));
    res.json(apiResponse(updated));
  });
  
  // GET /api/v1/users/:id/stores (admin only)
  app.get('/api/v1/users/:id/stores', authMiddleware, roleGuard('admin'), (req, res) => {
    const user = db.prepare('SELECT id, email, name, role, store_id FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'User not found' }));
    }
    const rows = db.prepare(`
      SELECT l.store_id, s.name as store_name, s.slug, l.is_active, l.created_at, l.updated_at
      FROM user_store_links l
      LEFT JOIN stores s ON s.id = l.store_id
      WHERE l.user_id = ? AND l.is_active = 1
      ORDER BY s.name ASC, l.store_id ASC
    `).all(req.params.id);
    const storeIds = rows.map(r => normalizeStoreId(r.store_id)).filter(Boolean);
    return res.json(apiResponse({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, store_id: user.store_id },
      store_ids: storeIds,
      stores: rows,
    }));
  });
  
  // PUT /api/v1/users/:id/stores (admin only)
  app.put('/api/v1/users/:id/stores', authMiddleware, roleGuard('admin'), (req, res) => {
    const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'User not found' }));
    }
    if (user.role === 'admin') {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'Admin does not require store assignment' }));
    }
  
    const input = Array.isArray(req.body?.store_ids) ? req.body.store_ids : null;
    if (!input) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'store_ids array is required' }));
    }
    const storeIds = Array.from(new Set(input.map(normalizeStoreId).filter(Boolean)));
  
    if (storeIds.length > 0) {
      const placeholders = storeIds.map(() => '?').join(', ');
      const existing = db.prepare(`SELECT id FROM stores WHERE id IN (${placeholders})`).all(...storeIds).map(r => r.id);
      const missing = storeIds.filter(id => !existing.includes(id));
      if (missing.length > 0) {
        return res.status(400).json(apiResponse(null, {
          code: 'INVALID_REQUEST',
          message: `Unknown store_id(s): ${missing.join(', ')}`,
        }));
      }
    }
  
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM user_store_links WHERE user_id = ?').run(req.params.id);
      const insert = db.prepare(`
        INSERT INTO user_store_links (user_id, store_id, is_active, created_at, updated_at)
        VALUES (?, ?, 1, datetime('now'), datetime('now'))
      `);
      for (const sid of storeIds) {
        insert.run(req.params.id, sid);
      }
      const legacyStoreId = storeIds.length > 0 ? storeIds[0] : null;
      db.prepare('UPDATE users SET store_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(legacyStoreId, req.params.id);
    });
    tx();
  
    const rows = db.prepare(`
      SELECT l.store_id, s.name as store_name, s.slug, l.is_active, l.created_at, l.updated_at
      FROM user_store_links l
      LEFT JOIN stores s ON s.id = l.store_id
      WHERE l.user_id = ? AND l.is_active = 1
      ORDER BY s.name ASC, l.store_id ASC
    `).all(req.params.id);
    return res.json(apiResponse({ user_id: req.params.id, store_ids: storeIds, stores: rows }));
  });
  
  // PUT /api/v1/auth/profile
  app.put('/api/v1/auth/profile', authMiddleware, (req, res) => {
    const {
      name,
      phone_number,
      avatar_url,
      notification_email_enabled,
      notification_sms_enabled,
      default_shipping_address,
    } = req.body || {};
    const updates = [];
    const params = [];
  
    if (name !== undefined) {
      const safeName = String(name).trim();
      if (!safeName) {
        return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'Name cannot be empty' }));
      }
      updates.push('name = ?');
      params.push(safeName);
    }
  
    if (avatar_url !== undefined) {
      const safeAvatar = avatar_url ? String(avatar_url).trim() : null;
      updates.push('avatar_url = ?');
      params.push(safeAvatar || null);
    }
  
    if (phone_number !== undefined) {
      const safePhone = phone_number ? String(phone_number).trim() : null;
      updates.push('phone_number = ?');
      params.push(safePhone || null);
    }
  
    if (notification_email_enabled !== undefined) {
      updates.push('notification_email_enabled = ?');
      params.push(notification_email_enabled ? 1 : 0);
    }
  
    if (notification_sms_enabled !== undefined) {
      updates.push('notification_sms_enabled = ?');
      params.push(notification_sms_enabled ? 1 : 0);
    }

    if (default_shipping_address !== undefined) {
      if (!hasDefaultShippingAddress) {
        return res.status(409).json(apiResponse(null, {
          code: 'SCHEMA_OUTDATED',
          message: 'default_shipping_address is not available in this database schema.',
        }));
      }
      if (default_shipping_address === null) {
        updates.push('default_shipping_address = ?');
        params.push(null);
      } else {
        const addr = default_shipping_address || {};
        const line1 = String(addr.address_line1 || '').trim();
        const city = String(addr.city || '').trim();
        const state = String(addr.state || '').trim();
        const postal = String(addr.postal_code || '').trim();
        const country = String(addr.country || '').trim().toUpperCase();
        if (!line1 || !city || !state || !postal || !country) {
          return res.status(400).json(apiResponse(null, {
            code: 'VALIDATION',
            message: 'default_shipping_address requires address_line1, city, state, postal_code, country.',
          }));
        }
        if (!/^[A-Z]{2}$/.test(country)) {
          return res.status(400).json(apiResponse(null, {
            code: 'SHIPPING_COUNTRY_INVALID',
            message: 'country must be a 2-letter ISO code (for example US).',
          }));
        }
        const normalized = {
          address_line1: line1,
          address_line2: String(addr.address_line2 || '').trim() || null,
          city,
          state,
          postal_code: postal,
          country,
        };
        updates.push('default_shipping_address = ?');
        params.push(JSON.stringify(normalized));
      }
    }
  
    if (updates.length === 0) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'No fields to update' }));
    }
  
    updates.push("updated_at = datetime('now')");
    params.push(req.user.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  
    const updated = mapActiveUser(db.prepare(ACTIVE_USER_SELECT).get(req.user.id));
    res.json(apiResponse(updated));
  });

  // GET /api/v1/auth/shipping-addresses
  app.get('/api/v1/auth/shipping-addresses', authMiddleware, (req, res) => {
    const rows = db.prepare(`
      SELECT id, user_id, label, recipient_name, address_line1, address_line2,
             city, state, postal_code, country, is_default, created_at, updated_at
      FROM user_shipping_addresses
      WHERE user_id = ?
      ORDER BY is_default DESC, updated_at DESC
    `).all(req.user.id).map((row) => ({
      ...row,
      is_default: !!row.is_default,
    }));
    return res.json(apiResponse(rows));
  });

  // POST /api/v1/auth/shipping-addresses
  app.post('/api/v1/auth/shipping-addresses', authMiddleware, (req, res) => {
    const parsed = normalizeShippingAddressInput(req.body || {}, { requireRecipient: true });
    if (parsed.error) {
      return res.status(400).json(apiResponse(null, parsed.error));
    }
    const addr = parsed.value;
    const id = uuidv4();
    const existingCount = db.prepare('SELECT COUNT(*) AS count FROM user_shipping_addresses WHERE user_id = ?').get(req.user.id)?.count || 0;
    const shouldBeDefault = req.body?.is_default === true || existingCount === 0;

    const tx = db.transaction(() => {
      if (shouldBeDefault) {
        db.prepare('UPDATE user_shipping_addresses SET is_default = 0, updated_at = datetime(\'now\') WHERE user_id = ?').run(req.user.id);
      }
      db.prepare(`
        INSERT INTO user_shipping_addresses
        (id, user_id, label, recipient_name, address_line1, address_line2, city, state, postal_code, country, is_default, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        id,
        req.user.id,
        addr.label,
        addr.recipient_name,
        addr.address_line1,
        addr.address_line2,
        addr.city,
        addr.state,
        addr.postal_code,
        addr.country,
        shouldBeDefault ? 1 : 0
      );
      syncUserDefaultShippingAddress(req.user.id);
    });
    tx();

    const created = db.prepare(`
      SELECT id, user_id, label, recipient_name, address_line1, address_line2,
             city, state, postal_code, country, is_default, created_at, updated_at
      FROM user_shipping_addresses
      WHERE id = ? AND user_id = ?
    `).get(id, req.user.id);
    return res.status(201).json(apiResponse({
      ...created,
      is_default: !!created?.is_default,
    }));
  });

  // PUT /api/v1/auth/shipping-addresses/:id
  app.put('/api/v1/auth/shipping-addresses/:id', authMiddleware, (req, res) => {
    const existing = db.prepare(`
      SELECT id, user_id, label, recipient_name, address_line1, address_line2,
             city, state, postal_code, country, is_default, created_at, updated_at
      FROM user_shipping_addresses
      WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);
    if (!existing) {
      return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Shipping address not found' }));
    }
    const merged = {
      ...existing,
      ...(req.body || {}),
    };
    const parsed = normalizeShippingAddressInput(merged, { requireRecipient: true });
    if (parsed.error) {
      return res.status(400).json(apiResponse(null, parsed.error));
    }
    const addr = parsed.value;
    const shouldBeDefault = req.body?.is_default === true || existing.is_default === 1;

    const tx = db.transaction(() => {
      if (shouldBeDefault) {
        db.prepare('UPDATE user_shipping_addresses SET is_default = 0, updated_at = datetime(\'now\') WHERE user_id = ?').run(req.user.id);
      }
      db.prepare(`
        UPDATE user_shipping_addresses
        SET label = ?, recipient_name = ?, address_line1 = ?, address_line2 = ?, city = ?, state = ?,
            postal_code = ?, country = ?, is_default = ?, updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `).run(
        addr.label,
        addr.recipient_name,
        addr.address_line1,
        addr.address_line2,
        addr.city,
        addr.state,
        addr.postal_code,
        addr.country,
        shouldBeDefault ? 1 : 0,
        req.params.id,
        req.user.id
      );
      syncUserDefaultShippingAddress(req.user.id);
    });
    tx();

    const updated = db.prepare(`
      SELECT id, user_id, label, recipient_name, address_line1, address_line2,
             city, state, postal_code, country, is_default, created_at, updated_at
      FROM user_shipping_addresses
      WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);
    return res.json(apiResponse({
      ...updated,
      is_default: !!updated?.is_default,
    }));
  });

  // POST /api/v1/auth/shipping-addresses/:id/default
  app.post('/api/v1/auth/shipping-addresses/:id/default', authMiddleware, (req, res) => {
    const existing = db.prepare('SELECT id FROM user_shipping_addresses WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!existing) {
      return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Shipping address not found' }));
    }
    const tx = db.transaction(() => {
      db.prepare('UPDATE user_shipping_addresses SET is_default = 0, updated_at = datetime(\'now\') WHERE user_id = ?').run(req.user.id);
      db.prepare('UPDATE user_shipping_addresses SET is_default = 1, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
      syncUserDefaultShippingAddress(req.user.id);
    });
    tx();
    return res.json(apiResponse({ ok: true }));
  });

  // DELETE /api/v1/auth/shipping-addresses/:id
  app.delete('/api/v1/auth/shipping-addresses/:id', authMiddleware, (req, res) => {
    const existing = db.prepare('SELECT id, is_default FROM user_shipping_addresses WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!existing) {
      return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Shipping address not found' }));
    }
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM user_shipping_addresses WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
      if (existing.is_default) {
        const fallback = db.prepare(`
          SELECT id FROM user_shipping_addresses
          WHERE user_id = ?
          ORDER BY updated_at DESC
          LIMIT 1
        `).get(req.user.id);
        if (fallback?.id) {
          db.prepare('UPDATE user_shipping_addresses SET is_default = 1, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(fallback.id, req.user.id);
        }
      }
      syncUserDefaultShippingAddress(req.user.id);
    });
    tx();
    return res.json(apiResponse({ ok: true }));
  });

  // POST /api/v1/auth/email/send-verification
  app.post('/api/v1/auth/email/send-verification', authMiddleware, (req, res) => {
    const user = mapActiveUser(db.prepare(ACTIVE_USER_SELECT).get(req.user.id));
    if (!user || !user.is_active) {
      return res.status(401).json(apiResponse(null, { code: 'UNAUTHORIZED', message: 'User not found or inactive' }));
    }
    if (user.email_verified_at) {
      return res.json(apiResponse({ already_verified: true, email_verified_at: user.email_verified_at }));
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashVerificationLinkToken(token);
    const expiresAt = new Date(Date.now() + AUTH_CODE_EXPIRES_MIN * 60 * 1000).toISOString();
    const challengeId = uuidv4();
    const tx = db.transaction(() => {
      db.prepare(`
        DELETE FROM email_verification_codes
        WHERE user_id = ? AND purpose IN ('email_verify', 'email_verify_link')
      `).run(user.id);
      db.prepare(`
        INSERT INTO email_verification_codes
        (id, user_id, email, purpose, code_hash, expires_at, max_attempts, metadata_json, created_at)
        VALUES (?, ?, ?, 'email_verify_link', ?, ?, 1, NULL, datetime('now'))
      `).run(
        challengeId,
        user.id,
        String(user.email || '').trim().toLowerCase(),
        tokenHash,
        expiresAt
      );
    });
    tx();

    const verifyUrl = buildEmailVerifyLink(token, req);
    sendEmailVerificationLinkEmail({
      email: user.email,
      userName: user.name,
      verifyUrl,
      expiresMinutes: AUTH_CODE_EXPIRES_MIN,
    }).catch(() => {});

    return res.json(apiResponse({
      sent: true,
      challenge_id: challengeId,
      expires_at: expiresAt,
      message: 'Verification link sent to your email.',
    }));
  });

  // GET /api/v1/auth/email/verify-link
  app.get('/api/v1/auth/email/verify-link', (req, res) => {
    const token = String(req.query?.token || '').trim();
    if (!token) {
      return res.status(400).send('Invalid verification link.');
    }

    const tokenHash = hashVerificationLinkToken(token);
    const row = db.prepare(`
      SELECT *
      FROM email_verification_codes
      WHERE purpose = 'email_verify_link'
        AND code_hash = ?
        AND used_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `).get(tokenHash);

    if (!row || new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(400).send('Verification link is invalid or expired.');
    }

    const tx = db.transaction(() => {
      db.prepare("UPDATE email_verification_codes SET used_at = datetime('now') WHERE id = ?").run(row.id);
      db.prepare("UPDATE users SET email_verified_at = COALESCE(email_verified_at, datetime('now')), updated_at = datetime('now') WHERE id = ?").run(row.user_id);
    });
    tx();

    const base = String(resolvePublicBaseUrl(req) || '').replace(/\/+$/, '');
    const redirectUrl = `${base}/profile?email_verified=1`;
    let fallbackUrl = '';
    try {
      const parsed = new URL(base);
      const isDevMode = process.env.NODE_ENV !== 'production';
      if (!parsed.port && isDevMode) {
        fallbackUrl = `${parsed.protocol}//${parsed.hostname}:8081/profile?email_verified=1`;
      }
    } catch (_) {
      fallbackUrl = '';
    }

    const escapeHtml = (value) =>
      String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const safeRedirectUrl = escapeHtml(redirectUrl);
    const safeFallbackUrl = escapeHtml(fallbackUrl);
    const fallbackLinkHtml = fallbackUrl
      ? `<p style="margin:0 0 12px;"><a href="${safeFallbackUrl}">Open App (Fallback)</a></p>`
      : '';
    const fallbackScript = fallbackUrl
      ? `setTimeout(function(){window.location.href=${JSON.stringify(fallbackUrl)};}, 4500);`
      : '';

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Email Verified - UnforgettableRides</title>
    <style>
      body { margin: 0; padding: 24px; font-family: Arial, sans-serif; background: #f8fafc; color: #0f172a; }
      .card { max-width: 560px; margin: 40px auto; background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08); }
      h1 { margin: 0 0 12px; font-size: 24px; }
      p { margin: 0 0 12px; line-height: 1.5; }
      a { color: #2563eb; text-decoration: none; font-weight: 600; }
      .hint { color: #475569; font-size: 14px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Email verified</h1>
      <p>Your UnforgettableRides email has been verified successfully.</p>
      <p><a href="${safeRedirectUrl}">Open App</a></p>
      ${fallbackLinkHtml}
      <p class="hint">If the app does not open automatically, tap one of the links above.</p>
    </div>
    <script>
      setTimeout(function(){ window.location.href = ${JSON.stringify(redirectUrl)}; }, 1200);
      ${fallbackScript}
    </script>
  </body>
</html>`;

    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  });

  // POST /api/v1/auth/email/verify
  app.post('/api/v1/auth/email/verify', authMiddleware, (req, res) => {
    const code = String(req.body?.code || '').trim();
    if (!code) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'code is required' }));
    }

    const row = db.prepare(`
      SELECT *
      FROM email_verification_codes
      WHERE user_id = ? AND purpose = 'email_verify' AND used_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `).get(req.user.id);
    if (!row) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_CODE', message: 'Verification code is invalid or expired' }));
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_CODE', message: 'Verification code is invalid or expired' }));
    }
    if (Number(row.attempt_count || 0) >= Number(row.max_attempts || AUTH_CODE_MAX_ATTEMPTS)) {
      return res.status(429).json(apiResponse(null, { code: 'TOO_MANY_ATTEMPTS', message: 'Too many incorrect attempts. Request a new code.' }));
    }

    const expected = hashAuthCode(req.user.id, 'email_verify', code);
    if (expected !== row.code_hash) {
      db.prepare('UPDATE email_verification_codes SET attempt_count = attempt_count + 1 WHERE id = ?').run(row.id);
      return res.status(400).json(apiResponse(null, { code: 'INVALID_CODE', message: 'Verification code is invalid or expired' }));
    }

    const tx = db.transaction(() => {
      db.prepare("UPDATE email_verification_codes SET used_at = datetime('now') WHERE id = ?").run(row.id);
      db.prepare("UPDATE users SET email_verified_at = COALESCE(email_verified_at, datetime('now')), updated_at = datetime('now') WHERE id = ?").run(req.user.id);
    });
    tx();

    const updated = mapActiveUser(db.prepare(ACTIVE_USER_SELECT).get(req.user.id));
    return res.json(apiResponse({
      verified: true,
      email_verified_at: updated.email_verified_at,
      user: updated,
    }));
  });

  // POST /api/v1/auth/email/change/request
  app.post('/api/v1/auth/email/change/request', authMiddleware, (req, res) => {
    const newEmail = String(req.body?.new_email || '').trim().toLowerCase();
    const currentPassword = String(req.body?.current_password || '');
    if (!newEmail || !currentPassword) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'new_email and current_password are required' }));
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_EMAIL', message: 'Please provide a valid email address' }));
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user || !user.is_active) {
      return res.status(401).json(apiResponse(null, { code: 'UNAUTHORIZED', message: 'User not found or inactive' }));
    }
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json(apiResponse(null, { code: 'UNAUTHORIZED', message: 'Current password is incorrect' }));
    }
    if (String(user.email || '').toLowerCase() === newEmail) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'New email must be different from current email' }));
    }

    const exists = db.prepare('SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1').get(newEmail, user.id);
    if (exists) {
      return res.status(409).json(apiResponse(null, { code: 'CONFLICT', message: 'Email already registered' }));
    }

    const { challengeId, code, expiresAt } = queueAuthCode({
      user,
      purpose: 'email_change',
      metadata: { new_email: newEmail },
      targetEmail: newEmail,
    });
    sendAuthCodeEmail({
      email: newEmail,
      userName: user.name,
      purpose: 'email_change',
      code,
      expiresMinutes: AUTH_CODE_EXPIRES_MIN,
    }).catch(() => {});

    return res.json(apiResponse({
      sent: true,
      challenge_id: challengeId,
      expires_at: expiresAt,
      message: 'Verification code sent to your new email.',
    }));
  });

  // POST /api/v1/auth/email/change/confirm
  app.post('/api/v1/auth/email/change/confirm', authMiddleware, (req, res) => {
    const code = String(req.body?.code || '').trim();
    if (!code) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'code is required' }));
    }

    const row = db.prepare(`
      SELECT *
      FROM email_verification_codes
      WHERE user_id = ? AND purpose = 'email_change' AND used_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `).get(req.user.id);
    if (!row) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_CODE', message: 'Verification code is invalid or expired' }));
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_CODE', message: 'Verification code is invalid or expired' }));
    }
    if (Number(row.attempt_count || 0) >= Number(row.max_attempts || AUTH_CODE_MAX_ATTEMPTS)) {
      return res.status(429).json(apiResponse(null, { code: 'TOO_MANY_ATTEMPTS', message: 'Too many incorrect attempts. Request a new code.' }));
    }

    const expected = hashAuthCode(req.user.id, 'email_change', code);
    if (expected !== row.code_hash) {
      db.prepare('UPDATE email_verification_codes SET attempt_count = attempt_count + 1 WHERE id = ?').run(row.id);
      return res.status(400).json(apiResponse(null, { code: 'INVALID_CODE', message: 'Verification code is invalid or expired' }));
    }

    let metadata = {};
    try {
      metadata = row.metadata_json ? JSON.parse(row.metadata_json) : {};
    } catch (_) {
      metadata = {};
    }
    const newEmail = String(metadata?.new_email || row.email || '').trim().toLowerCase();
    if (!newEmail) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'New email is missing from verification request' }));
    }
    const exists = db.prepare('SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1').get(newEmail, req.user.id);
    if (exists) {
      return res.status(409).json(apiResponse(null, { code: 'CONFLICT', message: 'Email already registered' }));
    }

    const tx = db.transaction(() => {
      db.prepare("UPDATE email_verification_codes SET used_at = datetime('now') WHERE id = ?").run(row.id);
      db.prepare("UPDATE users SET email = ?, email_verified_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(newEmail, req.user.id);
    });
    tx();

    const updated = mapActiveUser(db.prepare(ACTIVE_USER_SELECT).get(req.user.id));
    return res.json(apiResponse({
      changed: true,
      email: updated.email,
      email_verified_at: updated.email_verified_at,
      user: updated,
    }));
  });
  
  // ============================================================================
  // Feedback
  // ============================================================================
  
  const FEEDBACK_ALLOWED_CATEGORIES = new Set(['general', 'bug', 'improvement', 'feature', 'other']);
  const FEEDBACK_ALLOWED_STATUS = new Set(['new', 'reviewed', 'resolved']);
  
  // POST /api/v1/feedback - submit feedback (all signed-in users)
  app.post('/api/v1/feedback', authMiddleware, (req, res) => {
    const rawMessage = String(req.body?.message || '').trim();
    const rawCategory = String(req.body?.category || 'general').trim().toLowerCase();
    const category = FEEDBACK_ALLOWED_CATEGORIES.has(rawCategory) ? rawCategory : 'general';
  
    if (!rawMessage) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'message is required' }));
    }
    if (rawMessage.length > 2000) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'message must be 2000 characters or fewer' }));
    }
  
    const id = uuidv4();
    db.prepare(`
      INSERT INTO feedback (
        id, user_id, category, message, status, admin_note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'new', NULL, datetime('now'), datetime('now'))
    `).run(id, req.user.id, category, rawMessage);
  
    const created = db.prepare(`
      SELECT id, user_id, category, message, status, admin_note, created_at, updated_at
      FROM feedback
      WHERE id = ?
    `).get(id);
  
    return res.status(201).json(apiResponse(created));
  });
  
  // GET /api/v1/feedback - admin list feedback
  app.get('/api/v1/feedback', authMiddleware, roleGuard('admin'), (req, res) => {
    const status = String(req.query?.status || 'all').trim().toLowerCase();
    const search = String(req.query?.search || '').trim().toLowerCase();
    const limitRaw = Number(req.query?.limit || 100);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 100;
  
    let sql = `
      SELECT
        f.id, f.user_id, f.category, f.message, f.status, f.admin_note, f.created_at, f.updated_at,
        u.name as user_name, u.email as user_email, u.role as user_role
      FROM feedback f
      LEFT JOIN users u ON u.id = f.user_id
      WHERE 1=1
    `;
    const params = [];
  
    if (status !== 'all') {
      if (!FEEDBACK_ALLOWED_STATUS.has(status)) {
        return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'status must be one of: all, new, reviewed, resolved' }));
      }
      sql += ' AND f.status = ?';
      params.push(status);
    }
  
    if (search) {
      sql += ' AND (LOWER(f.message) LIKE ? OR LOWER(COALESCE(u.name, \'\')) LIKE ? OR LOWER(COALESCE(u.email, \'\')) LIKE ?)';
      const q = `%${search}%`;
      params.push(q, q, q);
    }
  
    sql += ' ORDER BY datetime(f.created_at) DESC, f.id DESC LIMIT ?';
    params.push(limit);
  
    const rows = db.prepare(sql).all(...params);
    return res.json(apiResponse(rows));
  });
  
  // PUT /api/v1/feedback/:id - admin update feedback status/note
  app.put('/api/v1/feedback/:id', authMiddleware, roleGuard('admin'), (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'feedback id is required' }));
    }
  
    const existing = db.prepare('SELECT * FROM feedback WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Feedback not found' }));
    }
  
    const nextStatus = req.body?.status === undefined
      ? existing.status
      : String(req.body.status || '').trim().toLowerCase();
    if (!FEEDBACK_ALLOWED_STATUS.has(nextStatus)) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'status must be one of: new, reviewed, resolved' }));
    }
  
    const note = req.body?.admin_note === undefined
      ? existing.admin_note
      : (req.body.admin_note === null ? null : String(req.body.admin_note).trim());
  
    if (note && note.length > 1000) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'admin_note must be 1000 characters or fewer' }));
    }
  
    db.prepare(`
      UPDATE feedback
      SET status = ?,
          admin_note = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(nextStatus, note || null, id);
  
    const updated = db.prepare(`
      SELECT
        f.id, f.user_id, f.category, f.message, f.status, f.admin_note, f.created_at, f.updated_at,
        u.name as user_name, u.email as user_email, u.role as user_role
      FROM feedback f
      LEFT JOIN users u ON u.id = f.user_id
      WHERE f.id = ?
    `).get(id);
  
    return res.json(apiResponse(updated));
  });
}

module.exports = {
  registerAuthRoutes,
};

