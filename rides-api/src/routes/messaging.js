const express = require('express');

function parseEnabled(value, fallback = true) {
  if (value == null || value === '') return fallback;
  return String(value).trim().toLowerCase() === 'true';
}

function parseLimit(value, fallback = 20, max = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function parsePositiveInt(value, fallback, max = null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  const intValue = Math.floor(parsed);
  if (Number.isFinite(Number(max)) && Number(max) > 0) {
    return Math.min(intValue, Math.floor(Number(max)));
  }
  return intValue;
}

function encodeCursor(createdAt, id) {
  if (!createdAt || !id) return null;
  return Buffer.from(`${createdAt}|${id}`, 'utf8').toString('base64');
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(String(cursor), 'base64').toString('utf8');
    const sep = decoded.lastIndexOf('|');
    if (sep <= 0) return null;
    const createdAt = decoded.slice(0, sep);
    const id = decoded.slice(sep + 1);
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function toIso(value) {
  if (!value) return null;
  return String(value).replace(' ', 'T') + 'Z';
}

function registerMessagingRoutes({
  app,
  apiResponse,
  db,
  uuidv4,
}) {
  const router = express.Router();

  // Create social_abuse_events table used for message rate limiting
  db.exec(`
    CREATE TABLE IF NOT EXISTS social_abuse_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_key TEXT NOT NULL,
      event_type TEXT NOT NULL,
      fingerprint TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_social_abuse_events_key_created
      ON social_abuse_events(event_key, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_social_abuse_events_type_key_fp_created
      ON social_abuse_events(event_type, event_key, fingerprint, created_at DESC);
  `);

  const RATE_LIMITS = {
    messages: {
      limit: parsePositiveInt(process.env.SOCIAL_RATE_LIMIT_MESSAGES_LIMIT, 60, 1000),
      windowMs: parsePositiveInt(process.env.SOCIAL_RATE_LIMIT_MESSAGES_WINDOW_MS, 60 * 1000, 60 * 60 * 1000),
    },
  };

  const abuseCounters = {
    total: 0,
    byCode: new Map(),
    byAction: new Map(),
    byRoute: new Map(),
    byUser: new Map(),
    recent: [],
  };

  const ABUSE_ALERT_WINDOW_MS = Number(process.env.SOCIAL_ABUSE_ALERT_WINDOW_MS) > 0
    ? Math.floor(Number(process.env.SOCIAL_ABUSE_ALERT_WINDOW_MS))
    : 5 * 60 * 1000;
  const ABUSE_ALERT_THRESHOLD_TOTAL = Number(process.env.SOCIAL_ABUSE_ALERT_THRESHOLD_TOTAL) > 0
    ? Math.floor(Number(process.env.SOCIAL_ABUSE_ALERT_THRESHOLD_TOTAL))
    : 25;
  const ABUSE_ALERT_THRESHOLD_RATE_LIMITED = Number(process.env.SOCIAL_ABUSE_ALERT_THRESHOLD_RATE_LIMITED) > 0
    ? Math.floor(Number(process.env.SOCIAL_ABUSE_ALERT_THRESHOLD_RATE_LIMITED))
    : 15;
  const ABUSE_ALERT_THRESHOLD_SPAM_DETECTED = Number(process.env.SOCIAL_ABUSE_ALERT_THRESHOLD_SPAM_DETECTED) > 0
    ? Math.floor(Number(process.env.SOCIAL_ABUSE_ALERT_THRESHOLD_SPAM_DETECTED))
    : 10;
  const ABUSE_ALERT_COOLDOWN_MS = Number(process.env.SOCIAL_ABUSE_ALERT_COOLDOWN_MS) > 0
    ? Math.floor(Number(process.env.SOCIAL_ABUSE_ALERT_COOLDOWN_MS))
    : 2 * 60 * 1000;

  const abuseAlertState = {
    windowStartedAt: Date.now(),
    totalInWindow: 0,
    rateLimitedInWindow: 0,
    spamDetectedInWindow: 0,
    lastAlertAtByType: new Map(),
  };

  const bumpCounter = (counterMap, key) => {
    const normalized = String(key || 'unknown').trim() || 'unknown';
    counterMap.set(normalized, Number(counterMap.get(normalized) || 0) + 1);
  };

  const recordAbuseMetric = ({
    kind = 'abuse_control',
    action = 'unknown',
    userId = null,
    route = 'unknown',
    code = 'ABUSE_SIGNAL',
    retryAfterSeconds = null,
    details = null,
  }) => {
    const now = Date.now();
    if ((now - abuseAlertState.windowStartedAt) >= ABUSE_ALERT_WINDOW_MS) {
      abuseAlertState.windowStartedAt = now;
      abuseAlertState.totalInWindow = 0;
      abuseAlertState.rateLimitedInWindow = 0;
      abuseAlertState.spamDetectedInWindow = 0;
    }

    const event = {
      kind, action, code, route,
      user_id: userId || null,
      retry_after_seconds: Number.isFinite(Number(retryAfterSeconds))
        ? Math.max(1, Math.floor(Number(retryAfterSeconds)))
        : null,
      details: details && typeof details === 'object' ? details : null,
      at: new Date().toISOString(),
    };

    abuseCounters.total += 1;
    bumpCounter(abuseCounters.byCode, event.code);
    bumpCounter(abuseCounters.byAction, event.action);
    bumpCounter(abuseCounters.byRoute, event.route);
    if (event.user_id) {
      bumpCounter(abuseCounters.byUser, event.user_id);
      if (abuseCounters.byUser.size > 500) {
        const sorted = Array.from(abuseCounters.byUser.entries()).sort((a, b) => b[1] - a[1]);
        abuseCounters.byUser = new Map(sorted.slice(0, 400));
      }
    }
    abuseCounters.recent.push(event);
    if (abuseCounters.recent.length > 200) abuseCounters.recent.shift();

    try {
      db.prepare(`
        INSERT INTO social_abuse_events (event_key, event_type, fingerprint, created_at)
        VALUES (?, 'abuse_signal', ?, datetime('now'))
      `).run(`${event.code}:${event.action}`, JSON.stringify(event));
    } catch { /* best-effort */ }

    if (process.env.NODE_ENV !== 'test') {
      try {
        console.warn(JSON.stringify({ level: 'warn', event: 'SOCIAL_ABUSE_EVENT', ...event }));
      } catch { /* best-effort */ }
    }

    abuseAlertState.totalInWindow += 1;
    if (event.code === 'RATE_LIMITED') abuseAlertState.rateLimitedInWindow += 1;
    if (event.code === 'SPAM_DETECTED') abuseAlertState.spamDetectedInWindow += 1;

    const alertCandidates = [];
    if (abuseAlertState.totalInWindow >= ABUSE_ALERT_THRESHOLD_TOTAL) {
      alertCandidates.push({ type: 'TOTAL', count: abuseAlertState.totalInWindow, threshold: ABUSE_ALERT_THRESHOLD_TOTAL });
    }
    if (abuseAlertState.rateLimitedInWindow >= ABUSE_ALERT_THRESHOLD_RATE_LIMITED) {
      alertCandidates.push({ type: 'RATE_LIMITED', count: abuseAlertState.rateLimitedInWindow, threshold: ABUSE_ALERT_THRESHOLD_RATE_LIMITED });
    }
    if (abuseAlertState.spamDetectedInWindow >= ABUSE_ALERT_THRESHOLD_SPAM_DETECTED) {
      alertCandidates.push({ type: 'SPAM_DETECTED', count: abuseAlertState.spamDetectedInWindow, threshold: ABUSE_ALERT_THRESHOLD_SPAM_DETECTED });
    }

    for (const candidate of alertCandidates) {
      const lastAlertAt = Number(abuseAlertState.lastAlertAtByType.get(candidate.type) || 0);
      if ((now - lastAlertAt) < ABUSE_ALERT_COOLDOWN_MS) continue;
      abuseAlertState.lastAlertAtByType.set(candidate.type, now);
      try {
        console.error(JSON.stringify({
          level: 'error', event: 'SOCIAL_ABUSE_ALERT',
          alert_type: candidate.type, threshold: candidate.threshold,
          count_in_window: candidate.count, window_ms: ABUSE_ALERT_WINDOW_MS,
        }));
      } catch { /* best-effort */ }
    }
  };

  const consumeRateLimit = (key, limit, windowMs) => {
    const windowSeconds = Math.max(1, Math.floor(windowMs / 1000));
    const windowExpr = `-${windowSeconds} seconds`;
    const tx = db.transaction(() => {
      db.prepare(`
        DELETE FROM social_abuse_events
        WHERE created_at < datetime('now', '-48 hours')
      `).run();

      const summary = db.prepare(`
        SELECT COUNT(1) AS cnt
        FROM social_abuse_events
        WHERE event_type = 'rate_limit'
          AND event_key = ?
          AND created_at >= datetime('now', ?)
      `).get(key, windowExpr);

      if (Number(summary?.cnt || 0) >= limit) {
        const oldest = db.prepare(`
          SELECT created_at
          FROM social_abuse_events
          WHERE event_type = 'rate_limit'
            AND event_key = ?
            AND created_at >= datetime('now', ?)
          ORDER BY created_at ASC, id ASC
          LIMIT 1
        `).get(key, windowExpr);
        const oldestMs = oldest?.created_at
          ? new Date(String(oldest.created_at).replace(' ', 'T') + 'Z').getTime()
          : Date.now();
        const retryAfterSeconds = Math.max(1, Math.ceil((oldestMs + windowMs - Date.now()) / 1000));
        return { ok: false, retryAfterSeconds };
      }

      db.prepare(`
        INSERT INTO social_abuse_events (event_key, event_type, fingerprint, created_at)
        VALUES (?, 'rate_limit', NULL, datetime('now'))
      `).run(key);
      return { ok: true, retryAfterSeconds: 0 };
    });
    return tx();
  };

  const rejectRateLimit = (res, retryAfterSeconds, message, metricMeta = null) => {
    if (metricMeta && typeof metricMeta === 'object') {
      recordAbuseMetric({
        kind: 'rate_limit',
        action: metricMeta.action || 'unknown',
        userId: metricMeta.userId || null,
        route: metricMeta.route || 'unknown',
        code: 'RATE_LIMITED',
        retryAfterSeconds,
        details: metricMeta.details || null,
      });
    }
    res.set('Retry-After', String(retryAfterSeconds));
    return res.status(429).json(apiResponse(null, {
      code: 'RATE_LIMITED',
      message: message || 'Too many requests. Please try again later.',
      retry_after_seconds: retryAfterSeconds,
    }));
  };

  const normalizeContentFingerprint = (value) => String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim();

  const isDuplicateSpam = (userId, channel, content, windowMs = 10 * 60 * 1000, maxRepeats = 2) => {
    const fp = normalizeContentFingerprint(content);
    if (fp.length < 8) return false;
    const key = `${channel}:${userId}`;
    const windowSeconds = Math.max(1, Math.floor(windowMs / 1000));
    const windowExpr = `-${windowSeconds} seconds`;
    const tx = db.transaction(() => {
      const duplicateRow = db.prepare(`
        SELECT COUNT(1) AS cnt
        FROM social_abuse_events
        WHERE event_type = 'content_fingerprint'
          AND event_key = ?
          AND fingerprint = ?
          AND created_at >= datetime('now', ?)
      `).get(key, fp, windowExpr);

      db.prepare(`
        INSERT INTO social_abuse_events (event_key, event_type, fingerprint, created_at)
        VALUES (?, 'content_fingerprint', ?, datetime('now'))
      `).run(key, fp);

      return Number(duplicateRow?.cnt || 0) >= maxRepeats;
    });
    return tx();
  };

  const ensureMessagingUser = (req, res, next) => {
    const userId = req?.user?.id;
    if (!userId) {
      return res.status(401).json(apiResponse(null, { code: 'UNAUTHORIZED', message: 'Authentication required' }));
    }
    try {
      db.prepare(`
        INSERT INTO social_users
        (user_id, message_privacy, profile_visibility, dog_profile_visibility, is_messaging_enabled, created_at, updated_at)
        VALUES (?, 'everyone', 'public', 'followers_only', 1, datetime('now'), datetime('now'))
        ON CONFLICT(user_id) DO NOTHING
      `).run(userId);
      return next();
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  };

  const isBlockedBetween = (a, b) => {
    const row = db.prepare(`
      SELECT 1 AS hit
      FROM social_blocks
      WHERE (blocker_user_id = ? AND blocked_user_id = ?)
         OR (blocker_user_id = ? AND blocked_user_id = ?)
      LIMIT 1
    `).get(a, b, b, a);
    return Boolean(row?.hit);
  };

  const isMutualFollow = (userAId, userBId) => {
    if (!userAId || !userBId) return false;
    const a = db.prepare(`
      SELECT 1 AS hit FROM social_follows
      WHERE follower_user_id = ? AND followed_user_id = ? AND status = 'active' LIMIT 1
    `).get(userAId, userBId);
    const b = db.prepare(`
      SELECT 1 AS hit FROM social_follows
      WHERE follower_user_id = ? AND followed_user_id = ? AND status = 'active' LIMIT 1
    `).get(userBId, userAId);
    return Boolean(a?.hit) && Boolean(b?.hit);
  };

  const mapProfileFor = (viewerUserId, userId) => {
    const base = db.prepare(`
      SELECT u.id AS user_id, u.name, u.avatar_url
      FROM users u WHERE u.id = ? LIMIT 1
    `).get(userId);
    if (!base) return null;
    return {
      userId: base.user_id,
      displayName: base.name || 'User',
      avatarUrl: base.avatar_url || null,
      bio: null,
      followersCount: 0,
      followingCount: 0,
      followStatus: 'none',
      isBlockedByMe: false,
      isMutualFollow: false,
    };
  };

  const requireThreadMember = (req, res, next) => {
    const threadId = String(req.params.threadId || '').trim();
    if (!threadId) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'threadId is required' }));
    }
    const member = db.prepare(`
      SELECT thread_id, user_id, last_read_message_id, is_hidden, left_at
      FROM social_thread_members
      WHERE thread_id = ? AND user_id = ?
      LIMIT 1
    `).get(threadId, req.user.id);
    if (!member || member.left_at) {
      return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Not a thread member' }));
    }
    req.threadId = threadId;
    req.threadMember = member;
    return next();
  };

  const messagingFeatureGate = (req, res, next) => {
    const globalEnabled = parseEnabled(process.env.SOCIAL_ENABLED, true);
    if (!globalEnabled) {
      return res.status(403).json(apiResponse(null, {
        code: 'FEATURE_DISABLED',
        message: 'Messaging feature is disabled',
      }));
    }
    return next();
  };

  router.use(messagingFeatureGate);
  router.use(ensureMessagingUser);

  // ── GET /api/v1/social/threads/unread-count ───────────────────
  // Must be registered BEFORE /threads/:threadId to avoid conflict
  router.get('/threads/unread-count', (req, res) => {
    try {
      const row = db.prepare(`
        SELECT COUNT(1) AS unread_count
        FROM social_thread_members m
        JOIN social_threads t ON t.id = m.thread_id
        WHERE m.user_id = ?
          AND m.left_at IS NULL
          AND m.is_hidden = 0
          AND t.last_message_id IS NOT NULL
          AND (m.last_read_message_id IS NULL OR m.last_read_message_id != t.last_message_id)
      `).get(req.user.id);
      return res.json(apiResponse({ unread_count: Number(row?.unread_count || 0) }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  // Alias at root level for tab badge
  router.get('/unread-count', (req, res) => {
    try {
      const row = db.prepare(`
        SELECT COUNT(1) AS unread_count
        FROM social_thread_members m
        JOIN social_threads t ON t.id = m.thread_id
        WHERE m.user_id = ?
          AND m.left_at IS NULL
          AND m.is_hidden = 0
          AND t.last_message_id IS NOT NULL
          AND (m.last_read_message_id IS NULL OR m.last_read_message_id != t.last_message_id)
      `).get(req.user.id);
      return res.json(apiResponse({ unread_count: Number(row?.unread_count || 0) }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  // ── GET /api/v1/social/threads ────────────────────────────────
  router.get('/threads', (req, res) => {
    const limit = parseLimit(req.query.limit, 20, 50);
    const cursor = decodeCursor(req.query.cursor);
    try {
      let whereCursor = '';
      const params = [req.user.id, req.user.id];
      if (cursor) {
        whereCursor = `
          AND (
            COALESCE(t.last_message_at, t.created_at) < ?
            OR (COALESCE(t.last_message_at, t.created_at) = ? AND t.id < ?)
          )
        `;
        params.push(cursor.createdAt, cursor.createdAt, cursor.id);
      }
      params.push(limit + 1);

      const rows = db.prepare(`
        SELECT
          t.id,
          t.type,
          t.last_message_at,
          t.created_at,
          t.last_message_id,
          m.is_muted,
          m.is_pinned,
          m.last_read_message_id,
          lm.body AS last_message_body,
          lm.deleted_at AS last_message_deleted_at,
          other.user_id AS other_user_id,
          u.name AS other_name,
          u.avatar_url AS other_avatar_url
        FROM social_thread_members m
        JOIN social_threads t ON t.id = m.thread_id
        LEFT JOIN social_messages lm ON lm.id = t.last_message_id
        LEFT JOIN social_thread_members other
          ON other.thread_id = t.id
         AND other.user_id != ?
         AND other.left_at IS NULL
        LEFT JOIN users u ON u.id = other.user_id
        WHERE m.user_id = ?
          AND m.left_at IS NULL
          AND m.is_hidden = 0
          ${whereCursor}
        ORDER BY m.is_pinned DESC, COALESCE(t.last_message_at, t.created_at) DESC, t.id DESC
        LIMIT ?
      `).all(...params);

      const hasMore = rows.length > limit;
      const trimmed = hasMore ? rows.slice(0, limit) : rows;
      const items = trimmed.map((row) => ({
        id: row.id,
        type: row.type,
        otherUser: mapProfileFor(req.user.id, row.other_user_id) || {
          userId: row.other_user_id || 'unknown',
          displayName: row.other_name || 'User',
          avatarUrl: row.other_avatar_url || null,
          bio: null,
          followersCount: 0,
          followingCount: 0,
          followStatus: 'none',
          isBlockedByMe: false,
        },
        lastMessagePreview: row.last_message_deleted_at ? 'Message deleted' : (row.last_message_body || null),
        lastMessageAt: toIso(row.last_message_at),
        unreadCount: row.last_message_id && row.last_read_message_id !== row.last_message_id ? 1 : 0,
        isMuted: Boolean(row.is_muted),
        isPinned: Boolean(row.is_pinned),
        createdAt: toIso(row.created_at),
      }));

      const last = trimmed[trimmed.length - 1];
      const nextCursor = hasMore ? encodeCursor(last.last_message_at || last.created_at, last.id) : null;
      return res.json(apiResponse({ items, nextCursor }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  // ── POST /api/v1/social/threads ───────────────────────────────
  // Create or find a direct thread (previously POST /threads/direct)
  router.post('/threads', (req, res) => {
    const otherUserId = String(req.body?.other_user_id || '').trim();
    if (!otherUserId || otherUserId === req.user.id) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Invalid target user' }));
    }

    try {
      if (isBlockedBetween(req.user.id, otherUserId)) {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Cannot message blocked user' }));
      }

      const targetUser = db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1 LIMIT 1').get(otherUserId);
      if (!targetUser) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'User not found' }));
      }

      if (!isMutualFollow(req.user.id, otherUserId)) {
        return res.status(403).json(apiResponse(null, {
          code: 'FORBIDDEN',
          message: 'Mutual follow is required to message this user',
        }));
      }

      const settings = db.prepare(`
        SELECT message_privacy, is_messaging_enabled
        FROM social_users WHERE user_id = ?
      `).get(otherUserId) || { message_privacy: 'everyone', is_messaging_enabled: 1 };

      if (!settings.is_messaging_enabled || settings.message_privacy === 'nobody') {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'User is not accepting messages' }));
      }

      const existing = db.prepare(`
        SELECT t.id
        FROM social_threads t
        JOIN social_thread_members m1 ON m1.thread_id = t.id AND m1.user_id = ? AND m1.left_at IS NULL
        JOIN social_thread_members m2 ON m2.thread_id = t.id AND m2.user_id = ? AND m2.left_at IS NULL
        WHERE t.type = 'direct' AND t.is_active = 1
        LIMIT 1
      `).get(req.user.id, otherUserId);

      if (existing?.id) {
        return res.json(apiResponse({ threadId: existing.id, created: false }));
      }

      const threadId = uuidv4();
      const tx = db.transaction(() => {
        db.prepare(`
          INSERT INTO social_threads (id, type, created_by, is_active, created_at, updated_at)
          VALUES (?, 'direct', ?, 1, datetime('now'), datetime('now'))
        `).run(threadId, req.user.id);
        db.prepare(`
          INSERT INTO social_thread_members (thread_id, user_id, role, is_muted, is_hidden, joined_at)
          VALUES (?, ?, 'owner', 0, 0, datetime('now')),
                 (?, ?, 'member', 0, 0, datetime('now'))
        `).run(threadId, req.user.id, threadId, otherUserId);
      });
      tx();

      return res.status(201).json(apiResponse({ threadId, created: true }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  // ── GET /api/v1/social/threads/:threadId/messages ────────────
  router.get('/threads/:threadId/messages', requireThreadMember, (req, res) => {
    const limit = parseLimit(req.query.limit, 30, 100);
    const cursor = decodeCursor(req.query.cursor);
    try {
      let whereCursor = '';
      const params = [req.threadId];
      if (cursor) {
        whereCursor = `
          AND (
            created_at < ?
            OR (created_at = ? AND id < ?)
          )
        `;
        params.push(cursor.createdAt, cursor.createdAt, cursor.id);
      }
      params.push(limit + 1);
      const rows = db.prepare(`
        SELECT id, thread_id, sender_user_id, message_type, body, media_url, client_msg_id, created_at, edited_at, deleted_at
        FROM social_messages
        WHERE thread_id = ?
          ${whereCursor}
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      `).all(...params);

      const hasMore = rows.length > limit;
      const trimmed = hasMore ? rows.slice(0, limit) : rows;
      const items = trimmed.map((row) => ({
        id: row.id,
        threadId: row.thread_id,
        senderUserId: row.sender_user_id,
        messageType: row.message_type,
        body: row.body,
        mediaUrl: row.media_url,
        clientMsgId: row.client_msg_id,
        createdAt: toIso(row.created_at),
        editedAt: toIso(row.edited_at),
        deletedAt: toIso(row.deleted_at),
      }));
      const last = trimmed[trimmed.length - 1];
      const nextCursor = hasMore ? encodeCursor(last.created_at, last.id) : null;
      return res.json(apiResponse({ items, nextCursor }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  // ── POST /api/v1/social/threads/:threadId/messages ───────────
  router.post('/threads/:threadId/messages', requireThreadMember, (req, res) => {
    const body = String(req.body?.body || '').trim();
    const messageType = String(req.body?.messageType || req.body?.message_type || 'text').trim();
    const mediaUrl = req.body?.mediaUrl != null ? String(req.body.mediaUrl).trim() : (req.body?.media_url != null ? String(req.body.media_url).trim() : null);
    const clientMsgId = req.body?.clientMsgId != null ? String(req.body.clientMsgId).trim() : null;

    if (!['text', 'image'].includes(messageType)) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Invalid message type' }));
    }
    if (messageType === 'text' && !body) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Message body is required' }));
    }
    if (messageType === 'image' && !mediaUrl) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'mediaUrl is required for image message' }));
    }

    const messageRateCheck = consumeRateLimit(`messages:${req.user.id}`, RATE_LIMITS.messages.limit, RATE_LIMITS.messages.windowMs);
    if (!messageRateCheck.ok) {
      return rejectRateLimit(res, messageRateCheck.retryAfterSeconds, 'Message rate limit exceeded. Please slow down.', {
        action: 'send_message',
        userId: req.user.id,
        route: '/threads/:threadId/messages',
      });
    }

    if (messageType === 'text' && isDuplicateSpam(req.user.id, 'message', body)) {
      recordAbuseMetric({
        kind: 'spam',
        action: 'duplicate_message_content',
        userId: req.user.id,
        route: '/threads/:threadId/messages',
        code: 'SPAM_DETECTED',
      });
      return res.status(429).json(apiResponse(null, {
        code: 'SPAM_DETECTED',
        message: 'Repeated message content detected. Please vary your message and try again later.',
      }));
    }

    try {
      const threadMeta = db.prepare(`
        SELECT t.type AS thread_type, other.user_id AS other_user_id
        FROM social_threads t
        LEFT JOIN social_thread_members other
          ON other.thread_id = t.id
         AND other.user_id != ?
         AND other.left_at IS NULL
        WHERE t.id = ?
        LIMIT 1
      `).get(req.user.id, req.threadId);

      if (threadMeta?.thread_type === 'direct' && threadMeta?.other_user_id && !isMutualFollow(req.user.id, threadMeta.other_user_id)) {
        return res.status(403).json(apiResponse(null, {
          code: 'FORBIDDEN',
          message: 'Mutual follow is required to message this user',
        }));
      }

      const userSettings = db.prepare(`
        SELECT is_messaging_enabled, suspended_until
        FROM social_users WHERE user_id = ?
      `).get(req.user.id);
      if (userSettings && Number(userSettings.is_messaging_enabled) === 0) {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Messaging is disabled' }));
      }
      if (userSettings?.suspended_until && String(userSettings.suspended_until) > new Date().toISOString().slice(0, 19).replace('T', ' ')) {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Account is suspended from messaging' }));
      }

      const other = db.prepare(`
        SELECT user_id FROM social_thread_members
        WHERE thread_id = ? AND user_id != ? AND left_at IS NULL
        LIMIT 1
      `).get(req.threadId, req.user.id);
      if (other?.user_id && isBlockedBetween(req.user.id, other.user_id)) {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Cannot message blocked user' }));
      }

      if (clientMsgId) {
        const existing = db.prepare(`
          SELECT id, thread_id, sender_user_id, message_type, body, media_url, client_msg_id, created_at, edited_at, deleted_at
          FROM social_messages
          WHERE thread_id = ? AND sender_user_id = ? AND client_msg_id = ?
          LIMIT 1
        `).get(req.threadId, req.user.id, clientMsgId);
        if (existing) {
          return res.json(apiResponse({
            id: existing.id,
            threadId: existing.thread_id,
            senderUserId: existing.sender_user_id,
            messageType: existing.message_type,
            body: existing.body,
            mediaUrl: existing.media_url,
            clientMsgId: existing.client_msg_id,
            createdAt: toIso(existing.created_at),
            editedAt: toIso(existing.edited_at),
            deletedAt: toIso(existing.deleted_at),
          }));
        }
      }

      const messageId = uuidv4();
      const tx = db.transaction(() => {
        db.prepare(`
          INSERT INTO social_messages
          (id, thread_id, sender_user_id, message_type, body, media_url, client_msg_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          messageId,
          req.threadId,
          req.user.id,
          messageType,
          messageType === 'text' ? body : null,
          messageType === 'image' ? mediaUrl : null,
          clientMsgId
        );

        db.prepare(`
          UPDATE social_threads
          SET last_message_id = ?,
              last_message_at = datetime('now'),
              updated_at = datetime('now')
          WHERE id = ?
        `).run(messageId, req.threadId);

        db.prepare(`
          UPDATE social_thread_members
          SET last_read_message_id = ?,
              last_read_at = datetime('now')
          WHERE thread_id = ? AND user_id = ?
        `).run(messageId, req.threadId, req.user.id);
      });
      tx();

      const created = db.prepare(`
        SELECT id, thread_id, sender_user_id, message_type, body, media_url, client_msg_id, created_at, edited_at, deleted_at
        FROM social_messages WHERE id = ?
      `).get(messageId);

      return res.status(201).json(apiResponse({
        id: created.id,
        threadId: created.thread_id,
        senderUserId: created.sender_user_id,
        messageType: created.message_type,
        body: created.body,
        mediaUrl: created.media_url,
        clientMsgId: created.client_msg_id,
        createdAt: toIso(created.created_at),
        editedAt: toIso(created.edited_at),
        deletedAt: toIso(created.deleted_at),
      }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  // ── PATCH /api/v1/social/threads/:threadId/read ───────────────
  router.patch('/threads/:threadId/read', requireThreadMember, (req, res) => {
    const lastReadMessageId = String(req.body?.last_read_message_id || '').trim();
    if (!lastReadMessageId) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'last_read_message_id is required' }));
    }
    try {
      const message = db.prepare('SELECT id FROM social_messages WHERE id = ? AND thread_id = ? LIMIT 1').get(lastReadMessageId, req.threadId);
      if (!message) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Message not found in thread' }));
      }
      db.prepare(`
        UPDATE social_thread_members
        SET last_read_message_id = ?,
            last_read_at = datetime('now')
        WHERE thread_id = ? AND user_id = ?
      `).run(lastReadMessageId, req.threadId, req.user.id);
      return res.json(apiResponse({ success: true }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  // Also support the original POST /threads/:threadId/read for backward compat
  router.post('/threads/:threadId/read', requireThreadMember, (req, res) => {
    const lastReadMessageId = String(req.body?.last_read_message_id || '').trim();
    if (!lastReadMessageId) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'last_read_message_id is required' }));
    }
    try {
      const message = db.prepare('SELECT id FROM social_messages WHERE id = ? AND thread_id = ? LIMIT 1').get(lastReadMessageId, req.threadId);
      if (!message) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Message not found in thread' }));
      }
      db.prepare(`
        UPDATE social_thread_members
        SET last_read_message_id = ?,
            last_read_at = datetime('now')
        WHERE thread_id = ? AND user_id = ?
      `).run(lastReadMessageId, req.threadId, req.user.id);
      return res.json(apiResponse({ success: true }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  app.use('/api/v1/social', router);
}

module.exports = { registerMessagingRoutes };
