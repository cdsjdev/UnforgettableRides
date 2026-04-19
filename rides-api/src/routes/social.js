const express = require('express');
const fs = require('fs');
const path = require('path');

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

function registerSocialRoutes({
  app,
  apiResponse,
  db,
  uuidv4,
  multer,
  upload,
  uploadsDir,
}) {
  const router = express.Router();
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
    posts: {
      limit: parsePositiveInt(process.env.SOCIAL_RATE_LIMIT_POSTS_LIMIT, 20, 500),
      windowMs: parsePositiveInt(process.env.SOCIAL_RATE_LIMIT_POSTS_WINDOW_MS, 60 * 60 * 1000, 24 * 60 * 60 * 1000),
    },
    comments: {
      limit: parsePositiveInt(process.env.SOCIAL_RATE_LIMIT_COMMENTS_LIMIT, 80, 1000),
      windowMs: parsePositiveInt(process.env.SOCIAL_RATE_LIMIT_COMMENTS_WINDOW_MS, 60 * 60 * 1000, 24 * 60 * 60 * 1000),
    },
    follows: {
      limit: parsePositiveInt(process.env.SOCIAL_RATE_LIMIT_FOLLOWS_LIMIT, 80, 1000),
      windowMs: parsePositiveInt(process.env.SOCIAL_RATE_LIMIT_FOLLOWS_WINDOW_MS, 60 * 60 * 1000, 24 * 60 * 60 * 1000),
    },
    messages: {
      limit: parsePositiveInt(process.env.SOCIAL_RATE_LIMIT_MESSAGES_LIMIT, 60, 1000),
      windowMs: parsePositiveInt(process.env.SOCIAL_RATE_LIMIT_MESSAGES_WINDOW_MS, 60 * 1000, 60 * 60 * 1000),
    },
    reports: {
      limit: parsePositiveInt(process.env.SOCIAL_RATE_LIMIT_REPORTS_LIMIT, 10, 200),
      windowMs: parsePositiveInt(process.env.SOCIAL_RATE_LIMIT_REPORTS_WINDOW_MS, 60 * 60 * 1000, 24 * 60 * 60 * 1000),
    },
    meetupsCreate: {
      limit: parsePositiveInt(process.env.SOCIAL_RATE_LIMIT_MEETUPS_CREATE_LIMIT, 8, 100),
      windowMs: parsePositiveInt(process.env.SOCIAL_RATE_LIMIT_MEETUPS_CREATE_WINDOW_MS, 24 * 60 * 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    },
    meetupsJoin: {
      limit: parsePositiveInt(process.env.SOCIAL_RATE_LIMIT_MEETUPS_JOIN_LIMIT, 50, 1000),
      windowMs: parsePositiveInt(process.env.SOCIAL_RATE_LIMIT_MEETUPS_JOIN_WINDOW_MS, 60 * 60 * 1000, 24 * 60 * 60 * 1000),
    },
  };
  const SOCIAL_ABUSE_ENV_KEYS = [
    'SOCIAL_RATE_LIMIT_POSTS_LIMIT',
    'SOCIAL_RATE_LIMIT_POSTS_WINDOW_MS',
    'SOCIAL_RATE_LIMIT_COMMENTS_LIMIT',
    'SOCIAL_RATE_LIMIT_COMMENTS_WINDOW_MS',
    'SOCIAL_RATE_LIMIT_FOLLOWS_LIMIT',
    'SOCIAL_RATE_LIMIT_FOLLOWS_WINDOW_MS',
    'SOCIAL_RATE_LIMIT_MESSAGES_LIMIT',
    'SOCIAL_RATE_LIMIT_MESSAGES_WINDOW_MS',
    'SOCIAL_RATE_LIMIT_REPORTS_LIMIT',
    'SOCIAL_RATE_LIMIT_REPORTS_WINDOW_MS',
    'SOCIAL_RATE_LIMIT_MEETUPS_CREATE_LIMIT',
    'SOCIAL_RATE_LIMIT_MEETUPS_CREATE_WINDOW_MS',
    'SOCIAL_RATE_LIMIT_MEETUPS_JOIN_LIMIT',
    'SOCIAL_RATE_LIMIT_MEETUPS_JOIN_WINDOW_MS',
    'SOCIAL_ABUSE_ALERT_WINDOW_MS',
    'SOCIAL_ABUSE_ALERT_THRESHOLD_TOTAL',
    'SOCIAL_ABUSE_ALERT_THRESHOLD_RATE_LIMITED',
    'SOCIAL_ABUSE_ALERT_THRESHOLD_SPAM_DETECTED',
    'SOCIAL_ABUSE_ALERT_COOLDOWN_MS',
  ];
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
  const AUTO_FLAG_REPORT_THRESHOLD = Number(process.env.SOCIAL_AUTO_FLAG_REPORT_THRESHOLD) > 0
    ? Math.max(2, Math.floor(Number(process.env.SOCIAL_AUTO_FLAG_REPORT_THRESHOLD)))
    : 3;
  if (process.env.NODE_ENV === 'production') {
    const missingEnvKeys = SOCIAL_ABUSE_ENV_KEYS.filter((key) => !String(process.env[key] || '').trim());
    if (missingEnvKeys.length > 0) {
      console.warn(`[social] missing explicit abuse env config keys (using defaults): ${missingEnvKeys.join(', ')}`);
    }
  }

  const abuseCounters = {
    total: 0,
    byCode: new Map(),
    byAction: new Map(),
    byRoute: new Map(),
    byUser: new Map(),
    recent: [],
  };
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

  const parseFingerprintPayload = (value) => {
    if (!value || typeof value !== 'string') return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const mapToSortedCounts = (counterMap, limit = 20) => Array.from(counterMap.entries())
    .map(([key, count]) => ({ key, count: Number(count || 0) }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, Math.max(1, limit));

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
      kind,
      action,
      code,
      route,
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
      // Cap byUser to top 500 offenders to prevent unbounded memory growth.
      if (abuseCounters.byUser.size > 500) {
        const sorted = Array.from(abuseCounters.byUser.entries()).sort((a, b) => b[1] - a[1]);
        abuseCounters.byUser = new Map(sorted.slice(0, 400));
      }
    }
    abuseCounters.recent.push(event);
    if (abuseCounters.recent.length > 200) {
      abuseCounters.recent.shift();
    }

    try {
      db.prepare(`
        INSERT INTO social_abuse_events (event_key, event_type, fingerprint, created_at)
        VALUES (?, 'abuse_signal', ?, datetime('now'))
      `).run(`${event.code}:${event.action}`, JSON.stringify(event));
    } catch {
      // Best-effort observability, no-op on logging persistence failure.
    }

    if (process.env.NODE_ENV !== 'test') {
      try {
        console.warn(JSON.stringify({
          level: 'warn',
          event: 'SOCIAL_ABUSE_EVENT',
          ...event,
        }));
      } catch {
        // Best-effort logging, no-op on serialization/console failure.
      }
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
          level: 'error',
          event: 'SOCIAL_ABUSE_ALERT',
          alert_type: candidate.type,
          threshold: candidate.threshold,
          count_in_window: candidate.count,
          window_ms: ABUSE_ALERT_WINDOW_MS,
          cooldown_ms: ABUSE_ALERT_COOLDOWN_MS,
          totals: {
            total: abuseAlertState.totalInWindow,
            rate_limited: abuseAlertState.rateLimitedInWindow,
            spam_detected: abuseAlertState.spamDetectedInWindow,
          },
          latest_event: event,
        }));
      } catch {
        // Best-effort logging, no-op on serialization/console failure.
      }
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

  const socialFeatureGate = (req, res, next) => {
    const globalEnabled = parseEnabled(process.env.SOCIAL_ENABLED, true);
    if (!globalEnabled) {
      return res.status(403).json(apiResponse(null, {
        code: 'FEATURE_DISABLED',
        message: 'Social feature is disabled',
      }));
    }
    return next();
  };

  const ensureSocialUser = (req, res, next) => {
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

  const insertNotification = ({
    userId,
    type,
    actorUserId = null,
    objectType = null,
    objectId = null,
    payload = null,
  }) => {
    if (!userId || !type) return;
    if (actorUserId && actorUserId === userId) return;
    if (actorUserId && isBlockedBetween(actorUserId, userId)) return;
    db.prepare(`
      INSERT INTO social_notifications
      (id, user_id, type, actor_user_id, object_type, object_id, payload_json, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
    `).run(
      uuidv4(),
      userId,
      type,
      actorUserId,
      objectType,
      objectId,
      payload ? JSON.stringify(payload) : null
    );
  };

  const isActiveFollower = (followerUserId, followedUserId) => {
    const row = db.prepare(`
      SELECT 1 AS hit
      FROM social_follows
      WHERE follower_user_id = ?
        AND followed_user_id = ?
        AND status = 'active'
      LIMIT 1
    `).get(followerUserId, followedUserId);
    return Boolean(row?.hit);
  };

  const isMutualFollow = (userAId, userBId) => {
    if (!userAId || !userBId) return false;
    return isActiveFollower(userAId, userBId) && isActiveFollower(userBId, userAId);
  };

  const mapProfileFor = (viewerUserId, userId) => {
    const base = db.prepare(`
      SELECT u.id AS user_id, u.name, u.avatar_url
      FROM users u
      WHERE u.id = ?
      LIMIT 1
    `).get(userId);
    if (!base) return null;

    const counts = db.prepare(`
      SELECT
        (SELECT COUNT(1) FROM social_follows WHERE followed_user_id = ? AND status = 'active') AS followers_count,
        (SELECT COUNT(1) FROM social_follows WHERE follower_user_id = ? AND status = 'active') AS following_count
    `).get(userId, userId);

    const follow = db.prepare(`
      SELECT status FROM social_follows WHERE follower_user_id = ? AND followed_user_id = ? LIMIT 1
    `).get(viewerUserId, userId);

    const blocked = db.prepare(`
      SELECT 1 AS hit FROM social_blocks WHERE blocker_user_id = ? AND blocked_user_id = ? LIMIT 1
    `).get(viewerUserId, userId);
    const mutual = viewerUserId ? isMutualFollow(viewerUserId, userId) : false;

    return {
      userId: base.user_id,
      displayName: base.name || 'User',
      avatarUrl: base.avatar_url || null,
      bio: null,
      followersCount: Number(counts?.followers_count || 0),
      followingCount: Number(counts?.following_count || 0),
      followStatus: follow?.status || 'none',
      isBlockedByMe: Boolean(blocked?.hit),
      isMutualFollow: Boolean(mutual),
    };
  };

  const toSqlDateTime = (value) => {
    if (!value) return null;
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 19).replace('T', ' ');
  };

  const canViewMeetupRow = (viewerUserId, row) => {
    if (!row || !viewerUserId) return false;
    if (viewerUserId === row.host_user_id) return true;
    if (isBlockedBetween(viewerUserId, row.host_user_id)) return false;
    const vis = String(row.visibility || 'public');
    if (vis === 'public') return true;
    if (vis === 'followers' || vis === 'private') {
      if (isActiveFollower(viewerUserId, row.host_user_id)) return true;
      const attendee = db.prepare(`
        SELECT status
        FROM social_meetup_attendees
        WHERE meetup_id = ? AND user_id = ?
        LIMIT 1
      `).get(row.id, viewerUserId);
      return Boolean(attendee && ['going', 'requested'].includes(String(attendee.status || '')));
    }
    return false;
  };

  const mapMeetupRow = (viewerUserId, row) => {
    const host = mapProfileFor(viewerUserId, row.host_user_id);
    const counts = db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'going' THEN 1 ELSE 0 END) AS going_count,
        SUM(CASE WHEN status = 'requested' THEN 1 ELSE 0 END) AS requested_count
      FROM social_meetup_attendees
      WHERE meetup_id = ?
    `).get(row.id);
    const mine = db.prepare(`
      SELECT status
      FROM social_meetup_attendees
      WHERE meetup_id = ?
        AND user_id = ?
      LIMIT 1
    `).get(row.id, viewerUserId);

    return {
      id: row.id,
      hostUserId: row.host_user_id,
      host,
      title: row.title,
      description: row.description || null,
      locationName: row.location_text,
      locationText: row.location_text,
      lat: row.lat == null ? null : Number(row.lat),
      lng: row.lng == null ? null : Number(row.lng),
      startAt: toIso(row.start_at),
      endAt: toIso(row.end_at),
      capacity: row.max_attendees == null ? null : Number(row.max_attendees),
      maxAttendees: row.max_attendees == null ? null : Number(row.max_attendees),
      visibility: row.visibility,
      status: row.status,
      coverImageUrl: row.cover_image_url || null,
      cancelReason: row.cancel_reason || null,
      cancelledAt: toIso(row.cancelled_at),
      attendeeCount: Number(counts?.going_count || 0),
      attendeeSummary: {
        going: Number(counts?.going_count || 0),
        requested: Number(counts?.requested_count || 0),
      },
      joinedByMe: Boolean(mine && ['going', 'requested'].includes(String(mine.status || ''))),
      isHost: viewerUserId === row.host_user_id,
      myAttendanceStatus: mine?.status || null,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
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

  router.use(socialFeatureGate);

  // Public social discovery endpoints for guest mode.
  router.get('/public/feed', (req, res) => {
    const limit = parseLimit(req.query.limit, 20, 50);
    const cursor = decodeCursor(req.query.cursor);
    try {
      let whereCursor = '';
      const params = [];
      if (cursor) {
        whereCursor = `
          AND (
            p.created_at < ?
            OR (p.created_at = ? AND p.id < ?)
          )
        `;
        params.push(cursor.createdAt, cursor.createdAt, cursor.id);
      }
      params.push(limit + 1);

      const rows = db.prepare(`
        SELECT
          p.*,
          0 AS liked_by_me
        FROM social_posts p
        JOIN social_users su ON su.user_id = p.user_id
        WHERE p.deleted_at IS NULL
          AND p.flagged_at IS NULL
          AND p.visibility = 'public'
          ${whereCursor}
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT ?
      `).all(...params);

      const hasMore = rows.length > limit;
      const trimmed = hasMore ? rows.slice(0, limit) : rows;
      const mediaByPost = listMediaForPosts(trimmed.map((r) => r.id));
      const items = trimmed.map((row) => mapPostRow(null, row, mediaByPost.get(row.id) || []));
      const last = trimmed[trimmed.length - 1];
      const nextCursor = hasMore && last ? encodeCursor(last.created_at, last.id) : null;
      return res.json(apiResponse({ items, nextCursor }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.get('/public/meetups', (req, res) => {
    const limit = parseLimit(req.query.limit, 20, 50);
    const cursor = decodeCursor(req.query.cursor);
    const hostUserId = req.query.host_user_id ? String(req.query.host_user_id).trim() : '';
    const query = String(req.query.query || req.query.q || '').trim().toLowerCase();
    const startFrom = toSqlDateTime(req.query.start_from);
    const startTo = toSqlDateTime(req.query.start_to);

    try {
      let whereCursor = '';
      const params = [];
      let where = `
        WHERE m.status = 'scheduled'
          AND m.visibility = 'public'
          AND m.end_at >= datetime('now')
      `;
      if (hostUserId) {
        where += ' AND m.host_user_id = ?';
        params.push(hostUserId);
      }
      if (startFrom) {
        where += ' AND m.start_at >= ?';
        params.push(startFrom);
      }
      if (startTo) {
        where += ' AND m.start_at <= ?';
        params.push(startTo);
      }
      if (query) {
        where += `
          AND (
            LOWER(m.title) LIKE ?
            OR LOWER(COALESCE(m.description, '')) LIKE ?
            OR LOWER(COALESCE(m.location_text, '')) LIKE ?
          )
        `;
        params.push(`%${query}%`, `%${query}%`, `%${query}%`);
      }
      if (cursor) {
        whereCursor = ' AND (m.start_at > ? OR (m.start_at = ? AND m.id > ?))';
        params.push(cursor.createdAt, cursor.createdAt, cursor.id);
      }
      params.push(limit + 1);

      const rows = db.prepare(`
        SELECT m.*
        FROM social_meetups m
        ${where}
        ${whereCursor}
        ORDER BY m.start_at ASC, m.id ASC
        LIMIT ?
      `).all(...params);

      const hasMore = rows.length > limit;
      const trimmed = hasMore ? rows.slice(0, limit) : rows;
      const items = trimmed.map((row) => mapMeetupRow(null, row));
      const last = rows[Math.min(rows.length, limit) - 1];
      const nextCursor = hasMore && last ? encodeCursor(last.start_at, last.id) : null;
      return res.json(apiResponse({ items, nextCursor }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.get('/public/posts/:postId', (req, res) => {
    const postId = String(req.params.postId || '').trim();
    if (!postId) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'postId is required' }));
    }
    try {
      const row = db.prepare(`
        SELECT p.*,
               0 AS liked_by_me
        FROM social_posts p
        WHERE p.id = ?
        LIMIT 1
      `).get(postId);
      if (!row || row.deleted_at || row.flagged_at || row.visibility !== 'public') {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Post not found' }));
      }
      const mediaRows = db.prepare(`
        SELECT id, post_id, media_url, media_type, thumbnail_url, sort_order
        FROM social_post_media
        WHERE post_id = ?
        ORDER BY sort_order ASC, created_at ASC, id ASC
      `).all(postId);
      return res.json(apiResponse(mapPostRow(null, row, mediaRows)));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.get('/public/posts/:postId/comments', (req, res) => {
    const postId = String(req.params.postId || '').trim();
    const limit = parseLimit(req.query.limit, 30, 100);
    const cursor = decodeCursor(req.query.cursor);
    if (!postId) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'postId is required' }));
    }
    try {
      const post = db.prepare(`
        SELECT id, visibility, deleted_at, flagged_at
        FROM social_posts
        WHERE id = ?
        LIMIT 1
      `).get(postId);
      if (!post || post.deleted_at || post.flagged_at || post.visibility !== 'public') {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Post not found' }));
      }

      let whereCursor = '';
      const params = [postId];
      if (cursor) {
        whereCursor = `
          AND (
            c.created_at > ?
            OR (c.created_at = ? AND c.id > ?)
          )
        `;
        params.push(cursor.createdAt, cursor.createdAt, cursor.id);
      }
      params.push(limit + 1);

      const rows = db.prepare(`
        SELECT c.*
        FROM social_post_comments c
        WHERE c.post_id = ?
          ${whereCursor}
        ORDER BY c.created_at ASC, c.id ASC
        LIMIT ?
      `).all(...params);
      const hasMore = rows.length > limit;
      const trimmed = hasMore ? rows.slice(0, limit) : rows;
      const items = trimmed
        .filter((row) => !row.flagged_at)
        .map((row) => ({
          id: row.id,
          postId: row.post_id,
          userId: row.user_id,
          content: row.deleted_at ? null : row.content,
          createdAt: toIso(row.created_at),
          updatedAt: toIso(row.updated_at),
          deletedAt: toIso(row.deleted_at),
          isDeleted: Boolean(row.deleted_at),
          author: mapProfileFor(null, row.user_id),
        }));
      const last = trimmed[trimmed.length - 1];
      const nextCursor = hasMore && last ? encodeCursor(last.created_at, last.id) : null;
      return res.json(apiResponse({ items, nextCursor }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.use(ensureSocialUser);

  router.post('/upload-image', (req, res) => {
    if (!upload || !uploadsDir) {
      return res.status(500).json(apiResponse(null, { code: 'CONFIG_ERROR', message: 'Upload pipeline is not configured' }));
    }
    upload.single('image')(req, res, (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Image must be 10 MB or smaller' }));
      }
      if (err) {
        return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: err.message || 'Invalid image upload' }));
      }
      if (!req.file) {
        return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'image file is required' }));
      }
      if (!['image/jpeg', 'image/png'].includes(String(req.file.mimetype || '').toLowerCase())) {
        return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Only image/jpeg and image/png are allowed' }));
      }

      try {
        const ext = String(req.file.mimetype).toLowerCase() === 'image/png' ? '.png' : '.jpg';
        const filename = `social-${uuidv4()}${ext}`;
        fs.writeFileSync(path.join(uploadsDir, filename), req.file.buffer);
        return res.status(201).json(apiResponse({ url: `/uploads/${filename}` }));
      } catch (writeErr) {
        return res.status(500).json(apiResponse(null, { code: 'UPLOAD_ERROR', message: writeErr.message }));
      }
    });
  });

  const allowedSocialImageMimes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
  ]);
  const allowedSocialVideoMimes = new Set([
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/x-m4v',
  ]);
  const socialMediaExtByMime = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/webm': '.webm',
    'video/x-m4v': '.m4v',
  };

  const socialMediaUpload = multer
    ? multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024, files: 1 },
      fileFilter: (req, file, cb) => {
        const mime = String(file?.mimetype || '').toLowerCase();
        if (allowedSocialImageMimes.has(mime) || allowedSocialVideoMimes.has(mime)) {
          cb(null, true);
          return;
        }
        cb(new Error('Only jpeg/png/webp images and mp4/mov/webm/m4v videos are allowed'), false);
      },
    })
    : null;

  router.post('/upload-media', (req, res) => {
    if (!socialMediaUpload || !uploadsDir) {
      return res.status(500).json(apiResponse(null, { code: 'CONFIG_ERROR', message: 'Upload pipeline is not configured' }));
    }
    socialMediaUpload.single('media')(req, res, (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Media must be 100 MB or smaller' }));
      }
      if (err) {
        return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: err.message || 'Invalid media upload' }));
      }
      if (!req.file) {
        return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'media file is required' }));
      }

      const mime = String(req.file.mimetype || '').toLowerCase();
      const isImage = allowedSocialImageMimes.has(mime);
      const isVideo = allowedSocialVideoMimes.has(mime);
      if (!isImage && !isVideo) {
        return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Unsupported media MIME type' }));
      }

      try {
        const ext = socialMediaExtByMime[mime] || (isImage ? '.jpg' : '.mp4');
        const filename = `social-${uuidv4()}${ext}`;
        fs.writeFileSync(path.join(uploadsDir, filename), req.file.buffer);
        return res.status(201).json(apiResponse({
          url: `/uploads/${filename}`,
          type: isVideo ? 'video' : 'image',
        }));
      } catch (writeErr) {
        return res.status(500).json(apiResponse(null, { code: 'UPLOAD_ERROR', message: writeErr.message }));
      }
    });
  });

  const canViewPost = (viewerUserId, postRow) => {
    if (!postRow || postRow.deleted_at || postRow.flagged_at) return false;
    if (isBlockedBetween(viewerUserId, postRow.user_id)) return false;
    if (postRow.user_id === viewerUserId) return true;
    if (postRow.visibility === 'public') return true;
    if (postRow.visibility === 'followers') return isActiveFollower(viewerUserId, postRow.user_id);
    return false;
  };

  const mapPostRow = (viewerUserId, row, mediaRows = []) => ({
    id: row.id,
    userId: row.user_id,
    storeId: row.store_id,
    content: row.deleted_at ? null : row.content,
    visibility: row.visibility,
    likeCount: Number(row.like_count || 0),
    commentCount: Number(row.comment_count || 0),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    deletedAt: toIso(row.deleted_at),
    isDeleted: Boolean(row.deleted_at),
    likedByMe: Boolean(row.liked_by_me),
    author: mapProfileFor(viewerUserId, row.user_id),
    media: mediaRows.map((m) => ({
      id: m.id,
      url: m.media_url,
      type: m.media_type,
      thumbnailUrl: m.thumbnail_url || null,
      sortOrder: Number(m.sort_order || 0),
    })),
  });

  const listMediaForPosts = (postIds) => {
    if (!Array.isArray(postIds) || postIds.length === 0) return new Map();
    const placeholders = postIds.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT id, post_id, media_url, media_type, thumbnail_url, sort_order
      FROM social_post_media
      WHERE post_id IN (${placeholders})
      ORDER BY sort_order ASC, created_at ASC, id ASC
    `).all(...postIds);
    const map = new Map();
    for (const row of rows) {
      if (!map.has(row.post_id)) map.set(row.post_id, []);
      map.get(row.post_id).push(row);
    }
    return map;
  };

  router.post('/posts', (req, res) => {
    const content = String(req.body?.content || '').trim();
    const visibility = String(req.body?.visibility || 'followers').trim();
    const allowedVisibility = new Set(['public', 'followers', 'private']);

    const rawMedia = Array.isArray(req.body?.media)
      ? req.body.media
      : (Array.isArray(req.body?.media_urls) ? req.body.media_urls : []);
    const media = rawMedia
      .map((item) => {
        if (typeof item === 'string') {
          return { url: item.trim(), type: 'image' };
        }
        if (item && typeof item.url === 'string') {
          const type = String(item.type || 'image').toLowerCase() === 'video' ? 'video' : 'image';
          const thumbnailUrl = typeof item.thumbnailUrl === 'string' ? item.thumbnailUrl.trim() : '';
          return { url: item.url.trim(), type, thumbnailUrl };
        }
        if (item && typeof item.media_url === 'string') {
          const type = String(item.media_type || 'image').toLowerCase() === 'video' ? 'video' : 'image';
          const thumbnailUrl = typeof item.thumbnail_url === 'string' ? item.thumbnail_url.trim() : '';
          return { url: item.media_url.trim(), type, thumbnailUrl };
        }
        return { url: '', type: 'image', thumbnailUrl: '' };
      })
      .filter((item) => Boolean(item.url))
      .slice(0, 7);

    if (content.length > 2000) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'content must be <= 2000 chars' }));
    }
    if (!content && media.length === 0) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Post must have content or at least one media item' }));
    }
    if (!allowedVisibility.has(visibility)) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Invalid visibility value' }));
    }
    if (media.length > 6) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'A post can contain at most 6 media items' }));
    }
    const rateCheck = consumeRateLimit(`posts:${req.user.id}`, RATE_LIMITS.posts.limit, RATE_LIMITS.posts.windowMs);
    if (!rateCheck.ok) {
      return rejectRateLimit(res, rateCheck.retryAfterSeconds, 'Post rate limit exceeded. Please try again later.', {
        action: 'create_post',
        userId: req.user.id,
        route: '/posts',
      });
    }
    if (isDuplicateSpam(req.user.id, 'post', content)) {
      recordAbuseMetric({
        kind: 'spam',
        action: 'duplicate_post_content',
        userId: req.user.id,
        route: '/posts',
        code: 'SPAM_DETECTED',
      });
      return res.status(429).json(apiResponse(null, {
        code: 'SPAM_DETECTED',
        message: 'Repeated post content detected. Please vary your content and try again later.',
      }));
    }

    try {
      const postId = uuidv4();
      const tx = db.transaction(() => {
        db.prepare(`
          INSERT INTO social_posts
          (id, user_id, store_id, content, visibility, like_count, comment_count, created_at, updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, 0, 0, datetime('now'), datetime('now'), NULL)
        `).run(postId, req.user.id, req.user.store_id || 'unknown', content, visibility);
        for (let i = 0; i < media.length; i++) {
          const mediaType = media[i].type === 'video' ? 'video' : 'image';
          const thumbnailUrl = mediaType === 'video' && media[i].thumbnailUrl
            ? media[i].thumbnailUrl
            : null;
          db.prepare(`
            INSERT INTO social_post_media
            (id, post_id, media_url, media_type, thumbnail_url, sort_order, created_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
          `).run(uuidv4(), postId, media[i].url, mediaType, thumbnailUrl, i);
        }
      });
      tx();

      const row = db.prepare(`
        SELECT p.*,
               EXISTS(SELECT 1 FROM social_post_likes l WHERE l.post_id = p.id AND l.user_id = ?) AS liked_by_me
        FROM social_posts p
        WHERE p.id = ?
        LIMIT 1
      `).get(req.user.id, postId);
      const mediaRows = db.prepare(`
        SELECT id, post_id, media_url, media_type, thumbnail_url, sort_order
        FROM social_post_media
        WHERE post_id = ?
        ORDER BY sort_order ASC, created_at ASC, id ASC
      `).all(postId);
      return res.status(201).json(apiResponse(mapPostRow(req.user.id, row, mediaRows)));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.get('/feed', (req, res) => {
    const limit = parseLimit(req.query.limit, 20, 50);
    const cursor = decodeCursor(req.query.cursor);
    try {
      const recentFollowed = db.prepare(`
        SELECT COUNT(DISTINCT p.user_id) AS cnt
        FROM social_posts p
        JOIN social_follows f
          ON f.followed_user_id = p.user_id
         AND f.follower_user_id = ?
         AND f.status = 'active'
        WHERE p.deleted_at IS NULL
          AND p.created_at >= datetime('now', '-30 days')
      `).get(req.user.id);
      const fallbackEnabled = Number(recentFollowed?.cnt || 0) < 5;

      let whereCursor = '';
      const params = [req.user.id];
      if (cursor) {
        whereCursor = `
          AND (
            p.created_at < ?
            OR (p.created_at = ? AND p.id < ?)
          )
        `;
        params.push(cursor.createdAt, cursor.createdAt, cursor.id);
      }
      params.push(req.user.id, req.user.id);
      if (fallbackEnabled) params.push(req.user.store_id || 'unknown');
      params.push(req.user.id);
      params.push(req.user.id);
      params.push(req.user.id, req.user.id);
      params.push(limit + 1);

      const rows = db.prepare(`
        SELECT
          p.*,
          EXISTS(SELECT 1 FROM social_post_likes l WHERE l.post_id = p.id AND l.user_id = ?) AS liked_by_me
        FROM social_posts p
        JOIN social_users su ON su.user_id = p.user_id
        WHERE p.deleted_at IS NULL
          AND p.flagged_at IS NULL
          ${whereCursor}
          AND (
            p.user_id = ?
            OR EXISTS (
              SELECT 1
              FROM social_follows f
              WHERE f.follower_user_id = ?
                AND f.followed_user_id = p.user_id
                AND f.status = 'active'
            )
            ${fallbackEnabled ? 'OR p.store_id = ?' : ''}
          )
          AND (
            p.visibility = 'public'
            OR p.user_id = ?
            OR (p.visibility = 'followers' AND EXISTS (
              SELECT 1
              FROM social_follows f2
              WHERE f2.follower_user_id = ?
                AND f2.followed_user_id = p.user_id
                AND f2.status = 'active'
            ))
          )
          AND NOT EXISTS (
            SELECT 1
            FROM social_blocks b
            WHERE (b.blocker_user_id = ? AND b.blocked_user_id = p.user_id)
               OR (b.blocker_user_id = p.user_id AND b.blocked_user_id = ?)
          )
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT ?
      `).all(...params);

      const hasMore = rows.length > limit;
      const trimmed = hasMore ? rows.slice(0, limit) : rows;
      const mediaByPost = listMediaForPosts(trimmed.map((r) => r.id));
      const items = trimmed.map((row) => mapPostRow(req.user.id, row, mediaByPost.get(row.id) || []));
      const last = trimmed[trimmed.length - 1];
      const nextCursor = hasMore && last ? encodeCursor(last.created_at, last.id) : null;
      return res.json(apiResponse({ items, nextCursor }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.get('/posts/:postId', (req, res) => {
    const postId = String(req.params.postId || '').trim();
    if (!postId) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'postId is required' }));
    }
    try {
      const row = db.prepare(`
        SELECT p.*,
               EXISTS(SELECT 1 FROM social_post_likes l WHERE l.post_id = p.id AND l.user_id = ?) AS liked_by_me
        FROM social_posts p
        WHERE p.id = ?
        LIMIT 1
      `).get(req.user.id, postId);
      if (!row || !canViewPost(req.user.id, row)) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Post not found' }));
      }
      const mediaRows = db.prepare(`
        SELECT id, post_id, media_url, media_type, thumbnail_url, sort_order
        FROM social_post_media
        WHERE post_id = ?
        ORDER BY sort_order ASC, created_at ASC, id ASC
      `).all(postId);
      return res.json(apiResponse(mapPostRow(req.user.id, row, mediaRows)));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.delete('/posts/:postId', (req, res) => {
    const postId = String(req.params.postId || '').trim();
    if (!postId) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'postId is required' }));
    }
    try {
      const row = db.prepare(`
        SELECT id, user_id, deleted_at
        FROM social_posts
        WHERE id = ?
        LIMIT 1
      `).get(postId);
      if (!row) return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Post not found' }));
      if (row.user_id !== req.user.id) {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Only post owner can delete this post' }));
      }
      if (!row.deleted_at) {
        db.prepare(`
          UPDATE social_posts
          SET deleted_at = datetime('now'),
              updated_at = datetime('now')
          WHERE id = ?
        `).run(postId);
      }
      const deleted = db.prepare('SELECT id, deleted_at FROM social_posts WHERE id = ? LIMIT 1').get(postId);
      return res.json(apiResponse({
        id: deleted.id,
        deletedAt: toIso(deleted.deleted_at),
        isDeleted: true,
      }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.post('/posts/:postId/like', (req, res) => {
    const postId = String(req.params.postId || '').trim();
    if (!postId) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'postId is required' }));
    }
    try {
      const post = db.prepare('SELECT id, user_id, deleted_at FROM social_posts WHERE id = ? LIMIT 1').get(postId);
      if (!post || post.deleted_at) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Post not found' }));
      }

      const result = db.prepare(`
        INSERT INTO social_post_likes (post_id, user_id, created_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(post_id, user_id) DO NOTHING
      `).run(postId, req.user.id);

      if (result.changes > 0) {
        db.prepare(`
          UPDATE social_posts
          SET like_count = like_count + 1,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(postId);
        insertNotification({
          userId: post.user_id,
          type: 'like',
          actorUserId: req.user.id,
          objectType: 'post',
          objectId: postId,
          payload: { post_id: postId },
        });
      }
      const row = db.prepare('SELECT like_count FROM social_posts WHERE id = ? LIMIT 1').get(postId);
      return res.status(201).json(apiResponse({ success: true, liked: true, likeCount: Number(row?.like_count || 0) }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.delete('/posts/:postId/like', (req, res) => {
    const postId = String(req.params.postId || '').trim();
    if (!postId) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'postId is required' }));
    }
    try {
      const post = db.prepare('SELECT id, deleted_at FROM social_posts WHERE id = ? LIMIT 1').get(postId);
      if (!post || post.deleted_at) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Post not found' }));
      }

      const result = db.prepare(`
        DELETE FROM social_post_likes
        WHERE post_id = ? AND user_id = ?
      `).run(postId, req.user.id);

      if (result.changes > 0) {
        db.prepare(`
          UPDATE social_posts
          SET like_count = MAX(0, like_count - 1),
              updated_at = datetime('now')
          WHERE id = ?
        `).run(postId);
      }
      const row = db.prepare('SELECT like_count FROM social_posts WHERE id = ? LIMIT 1').get(postId);
      return res.json(apiResponse({ success: true, liked: false, likeCount: Number(row?.like_count || 0) }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.get('/posts/:postId/comments', (req, res) => {
    const postId = String(req.params.postId || '').trim();
    const limit = parseLimit(req.query.limit, 30, 100);
    const cursor = decodeCursor(req.query.cursor);
    if (!postId) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'postId is required' }));
    }
    try {
      const post = db.prepare('SELECT id, user_id, visibility, deleted_at, flagged_at FROM social_posts WHERE id = ? LIMIT 1').get(postId);
      if (!post || !canViewPost(req.user.id, post)) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Post not found' }));
      }

      let whereCursor = '';
      const params = [postId];
      if (cursor) {
        whereCursor = `
          AND (
            c.created_at > ?
            OR (c.created_at = ? AND c.id > ?)
          )
        `;
        params.push(cursor.createdAt, cursor.createdAt, cursor.id);
      }
      params.push(limit + 1);
      const rows = db.prepare(`
        SELECT c.id, c.post_id, c.user_id, c.content, c.created_at, c.updated_at, c.deleted_at
        FROM social_post_comments c
        WHERE c.post_id = ?
          AND c.flagged_at IS NULL
          ${whereCursor}
        ORDER BY c.created_at ASC, c.id ASC
        LIMIT ?
      `).all(...params);

      const hasMore = rows.length > limit;
      const trimmed = hasMore ? rows.slice(0, limit) : rows;
      const items = trimmed.map((row) => ({
        id: row.id,
        postId: row.post_id,
        userId: row.user_id,
        content: row.deleted_at ? null : row.content,
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
        deletedAt: toIso(row.deleted_at),
        isDeleted: Boolean(row.deleted_at),
        author: mapProfileFor(req.user.id, row.user_id),
      }));
      const last = trimmed[trimmed.length - 1];
      const nextCursor = hasMore && last ? encodeCursor(last.created_at, last.id) : null;
      return res.json(apiResponse({ items, nextCursor }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.post('/posts/:postId/comments', (req, res) => {
    const postId = String(req.params.postId || '').trim();
    const content = String(req.body?.content || '').trim();
    if (!postId || !content || content.length > 500) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'content is required and must be <= 500 chars' }));
    }
    const rateCheck = consumeRateLimit(`comments:${req.user.id}`, RATE_LIMITS.comments.limit, RATE_LIMITS.comments.windowMs);
    if (!rateCheck.ok) {
      return rejectRateLimit(res, rateCheck.retryAfterSeconds, 'Comment rate limit exceeded. Please try again later.', {
        action: 'create_comment',
        userId: req.user.id,
        route: '/posts/:postId/comments',
      });
    }
    if (isDuplicateSpam(req.user.id, 'comment', content)) {
      recordAbuseMetric({
        kind: 'spam',
        action: 'duplicate_comment_content',
        userId: req.user.id,
        route: '/posts/:postId/comments',
        code: 'SPAM_DETECTED',
      });
      return res.status(429).json(apiResponse(null, {
        code: 'SPAM_DETECTED',
        message: 'Repeated comment content detected. Please vary your comments and try again later.',
      }));
    }
    try {
      const post = db.prepare(`
        SELECT id, user_id, deleted_at, flagged_at
        FROM social_posts
        WHERE id = ?
        LIMIT 1
      `).get(postId);
      if (!post || post.deleted_at) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Post not found' }));
      }
      if (post.flagged_at) {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Post is under moderation review' }));
      }
      if (isBlockedBetween(req.user.id, post.user_id)) {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Cannot comment due to block relationship' }));
      }
      const ownerSettings = db.prepare(`
        SELECT comments_privacy
        FROM social_users
        WHERE user_id = ?
        LIMIT 1
      `).get(post.user_id);
      const commentsPrivacy = ownerSettings?.comments_privacy || 'followers';
      if (commentsPrivacy === 'nobody' && post.user_id !== req.user.id) {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Comments are disabled for this post owner' }));
      }
      if (commentsPrivacy === 'followers' && post.user_id !== req.user.id) {
        const isFollower = db.prepare(`
          SELECT 1 AS hit
          FROM social_follows
          WHERE follower_user_id = ?
            AND followed_user_id = ?
            AND status = 'active'
          LIMIT 1
        `).get(req.user.id, post.user_id);
        if (!isFollower?.hit) {
          return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Follow is required to comment' }));
        }
      }

      const commentId = uuidv4();
      const tx = db.transaction(() => {
        db.prepare(`
          INSERT INTO social_post_comments
          (id, post_id, user_id, content, created_at, updated_at, deleted_at)
          VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), NULL)
        `).run(commentId, postId, req.user.id, content);
        db.prepare(`
          UPDATE social_posts
          SET comment_count = comment_count + 1,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(postId);
      });
      tx();
      insertNotification({
        userId: post.user_id,
        type: 'comment',
        actorUserId: req.user.id,
        objectType: 'comment',
        objectId: commentId,
        payload: { post_id: postId, comment_id: commentId, preview: content.slice(0, 80) },
      });

      const row = db.prepare(`
        SELECT id, post_id, user_id, content, created_at, updated_at, deleted_at
        FROM social_post_comments
        WHERE id = ?
        LIMIT 1
      `).get(commentId);
      return res.status(201).json(apiResponse({
        id: row.id,
        postId: row.post_id,
        userId: row.user_id,
        content: row.content,
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
        deletedAt: toIso(row.deleted_at),
        isDeleted: false,
        author: mapProfileFor(req.user.id, row.user_id),
      }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.delete('/comments/:commentId', (req, res) => {
    const commentId = String(req.params.commentId || '').trim();
    if (!commentId) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'commentId is required' }));
    }
    try {
      const row = db.prepare(`
        SELECT id, post_id, user_id, deleted_at
        FROM social_post_comments
        WHERE id = ?
        LIMIT 1
      `).get(commentId);
      if (!row) return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Comment not found' }));
      if (row.user_id !== req.user.id) {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Only comment owner can delete this comment' }));
      }
      if (!row.deleted_at) {
        const tx = db.transaction(() => {
          db.prepare(`
            UPDATE social_post_comments
            SET deleted_at = datetime('now'),
                updated_at = datetime('now')
            WHERE id = ?
          `).run(commentId);
          db.prepare(`
            UPDATE social_posts
            SET comment_count = MAX(0, comment_count - 1),
                updated_at = datetime('now')
            WHERE id = ?
          `).run(row.post_id);
        });
        tx();
      }
      const deleted = db.prepare(`
        SELECT id, deleted_at
        FROM social_post_comments
        WHERE id = ?
        LIMIT 1
      `).get(commentId);
      return res.json(apiResponse({
        id: deleted.id,
        deletedAt: toIso(deleted.deleted_at),
        isDeleted: true,
      }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.get('/users/search', (req, res) => {
    const q = String(req.query.q || '').trim();
    const limit = parseLimit(req.query.limit, 20, 50);
    if (!q) return res.json(apiResponse({ items: [], nextCursor: null }));
    try {
      const rows = db.prepare(`
        SELECT id
        FROM users
        WHERE id != ?
          AND is_active = 1
          AND name LIKE ? ESCAPE '\\'
        ORDER BY name COLLATE NOCASE ASC, id ASC
        LIMIT ?
      `).all(req.user.id, `%${q.replace(/[\\%_]/g, '\\$&')}%`, limit);
      const items = rows
        .map((r) => mapProfileFor(req.user.id, r.id))
        .filter(Boolean);
      return res.json(apiResponse({ items, nextCursor: null }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.get('/me/suggested-contacts', (req, res) => {
    const limit = parseLimit(req.query.limit, 20, 50);
    try {
      const rows = db.prepare(`
        SELECT
          u.id,
          EXISTS(
            SELECT 1
            FROM social_follows fy
            WHERE fy.follower_user_id = u.id
              AND fy.followed_user_id = ?
              AND fy.status = 'active'
          ) AS follows_you,
          (
            SELECT COUNT(1)
            FROM social_follows myf
            JOIN social_follows theirf
              ON theirf.follower_user_id = myf.followed_user_id
             AND theirf.followed_user_id = u.id
             AND theirf.status = 'active'
            WHERE myf.follower_user_id = ?
              AND myf.status = 'active'
          ) AS mutual_connection_count,
          (
            SELECT COUNT(1)
            FROM social_posts p
            WHERE p.user_id = u.id
              AND p.deleted_at IS NULL
          ) AS post_count,
          COALESCE((
            SELECT MAX(p.created_at)
            FROM social_posts p
            WHERE p.user_id = u.id
              AND p.deleted_at IS NULL
          ), u.created_at) AS last_activity_at
        FROM users u
        WHERE u.id != ?
          AND u.is_active = 1
          AND NOT EXISTS (
            SELECT 1 FROM social_follows f
            WHERE f.follower_user_id = ? AND f.followed_user_id = u.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM social_blocks b
            WHERE (b.blocker_user_id = ? AND b.blocked_user_id = u.id)
               OR (b.blocker_user_id = u.id AND b.blocked_user_id = ?)
          )
        ORDER BY
          follows_you DESC,
          mutual_connection_count DESC,
          post_count DESC,
          last_activity_at DESC,
          u.created_at DESC,
          u.id DESC
        LIMIT ?
      `).all(req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, limit);
      const items = rows
        .map((r) => mapProfileFor(req.user.id, r.id))
        .filter(Boolean);
      return res.json(apiResponse({ items, nextCursor: null }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.get('/users/:userId/profile', (req, res) => {
    const userId = String(req.params.userId || '').trim();
    const profile = mapProfileFor(req.user.id, userId);
    if (!profile) {
      return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'User not found' }));
    }
    return res.json(apiResponse(profile));
  });

  router.get('/users/:userId/posts', (req, res) => {
    const userId = String(req.params.userId || '').trim();
    if (!userId) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'userId is required' }));
    }
    if (isBlockedBetween(req.user.id, userId)) {
      return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Blocked' }));
    }
    const limit = parseLimit(req.query.limit, 20, 50);
    const cursor = decodeCursor(req.query.cursor);
    try {
      let whereCursor = '';
      const params = [req.user.id, userId];
      if (cursor) {
        whereCursor = `AND (p.created_at < ? OR (p.created_at = ? AND p.id < ?))`;
        params.push(cursor.createdAt, cursor.createdAt, cursor.id);
      }
      params.push(limit + 1);
      const rows = db.prepare(`
        SELECT p.*,
               EXISTS(SELECT 1 FROM social_post_likes l WHERE l.post_id = p.id AND l.user_id = ?) AS liked_by_me
        FROM social_posts p
        WHERE p.user_id = ?
          AND p.deleted_at IS NULL
          ${whereCursor}
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT ?
      `).all(...params);
      const hasMore = rows.length > limit;
      const trimmed = hasMore ? rows.slice(0, limit) : rows;
      const mediaByPost = listMediaForPosts(trimmed.map((r) => r.id));
      const items = trimmed
        .filter((row) => canViewPost(req.user.id, row))
        .map((row) => mapPostRow(req.user.id, row, mediaByPost.get(row.id) || []));
      const last = trimmed[trimmed.length - 1];
      const nextCursor = hasMore && last ? encodeCursor(String(last.created_at || '').replace('T', ' ').replace('Z', ''), last.id) : null;
      return res.json(apiResponse({ items, nextCursor }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.get('/users/:userId/followers', (req, res) => {
    const userId = String(req.params.userId || '').trim();
    if (!userId) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'userId is required' }));
    }
    if (isBlockedBetween(req.user.id, userId)) {
      return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Blocked' }));
    }
    const limit = parseLimit(req.query.limit, 30, 100);
    const cursor = decodeCursor(req.query.cursor);
    try {
      let whereCursor = '';
      const params = [userId];
      if (cursor) {
        whereCursor = `AND (f.created_at < ? OR (f.created_at = ? AND f.id < ?))`;
        params.push(cursor.createdAt, cursor.createdAt, cursor.id);
      }
      params.push(limit + 1);
      const rows = db.prepare(`
        SELECT f.id, f.follower_user_id, f.created_at
        FROM social_follows f
        WHERE f.followed_user_id = ?
          AND f.status = 'active'
          ${whereCursor}
        ORDER BY f.created_at DESC, f.id DESC
        LIMIT ?
      `).all(...params);
      const hasMore = rows.length > limit;
      const trimmed = hasMore ? rows.slice(0, limit) : rows;
      const items = trimmed
        .map((row) => mapProfileFor(req.user.id, row.follower_user_id))
        .filter(Boolean);
      const last = trimmed[trimmed.length - 1];
      const nextCursor = hasMore && last ? encodeCursor(String(last.created_at || '').replace('T', ' ').replace('Z', ''), last.id) : null;
      return res.json(apiResponse({ items, nextCursor }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.get('/users/:userId/following', (req, res) => {
    const userId = String(req.params.userId || '').trim();
    if (!userId) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'userId is required' }));
    }
    if (isBlockedBetween(req.user.id, userId)) {
      return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Blocked' }));
    }
    const limit = parseLimit(req.query.limit, 30, 100);
    const cursor = decodeCursor(req.query.cursor);
    try {
      let whereCursor = '';
      const params = [userId];
      if (cursor) {
        whereCursor = `AND (f.created_at < ? OR (f.created_at = ? AND f.id < ?))`;
        params.push(cursor.createdAt, cursor.createdAt, cursor.id);
      }
      params.push(limit + 1);
      const rows = db.prepare(`
        SELECT f.id, f.followed_user_id, f.created_at
        FROM social_follows f
        WHERE f.follower_user_id = ?
          AND f.status = 'active'
          ${whereCursor}
        ORDER BY f.created_at DESC, f.id DESC
        LIMIT ?
      `).all(...params);
      const hasMore = rows.length > limit;
      const trimmed = hasMore ? rows.slice(0, limit) : rows;
      const items = trimmed
        .map((row) => mapProfileFor(req.user.id, row.followed_user_id))
        .filter(Boolean);
      const last = trimmed[trimmed.length - 1];
      const nextCursor = hasMore && last ? encodeCursor(String(last.created_at || '').replace('T', ' ').replace('Z', ''), last.id) : null;
      return res.json(apiResponse({ items, nextCursor }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.post('/meetups', (req, res) => {
    const title = String(req.body?.title || '').trim();
    const description = req.body?.description != null ? String(req.body.description).trim() : null;
    const locationText = String(
      req.body?.locationText
      || req.body?.location_text
      || req.body?.locationName
      || req.body?.location_name
      || req.body?.locationAddress
      || req.body?.location_address
      || ''
    ).trim();
    const visibilityRaw = String(req.body?.visibility || 'public').trim().toLowerCase();
    const startAtSql = toSqlDateTime(req.body?.startAt || req.body?.start_at);
    const endAtSql = toSqlDateTime(req.body?.endAt || req.body?.end_at);
    const maxAttendeesRaw = req.body?.maxAttendees ?? req.body?.max_attendees ?? req.body?.capacity;
    const maxAttendees = maxAttendeesRaw == null || maxAttendeesRaw === ''
      ? null
      : Math.max(1, Math.floor(Number(maxAttendeesRaw)));
    const lat = req.body?.lat == null || req.body?.lat === '' ? null : Number(req.body.lat);
    const lng = req.body?.lng == null || req.body?.lng === '' ? null : Number(req.body.lng);
    const coverImageUrl = req.body?.coverImageUrl ?? req.body?.cover_image_url ?? null;
    const visibility = ['public', 'followers', 'private'].includes(visibilityRaw) ? visibilityRaw : '';

    if (!title || title.length < 3 || title.length > 120) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'title must be 3-120 characters' }));
    }
    if (description && description.length > 2000) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'description must be <= 2000 characters' }));
    }
    if (!locationText || locationText.length > 200) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'locationText is required and must be <= 200 characters' }));
    }
    if (!visibility) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Invalid visibility value' }));
    }
    if (!startAtSql || !endAtSql || startAtSql >= endAtSql) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Invalid start/end time range' }));
    }
    if (startAtSql <= new Date().toISOString().slice(0, 19).replace('T', ' ')) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Meetup start time must be in the future' }));
    }
    if (Number.isFinite(lat) && (lat < -90 || lat > 90)) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'lat must be between -90 and 90' }));
    }
    if (Number.isFinite(lng) && (lng < -180 || lng > 180)) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'lng must be between -180 and 180' }));
    }
    if (maxAttendees != null && (!Number.isFinite(maxAttendees) || maxAttendees < 1)) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'maxAttendees must be a positive integer' }));
    }

    const createRate = consumeRateLimit(`meetups:create:${req.user.id}`, RATE_LIMITS.meetupsCreate.limit, RATE_LIMITS.meetupsCreate.windowMs);
    if (!createRate.ok) {
      return rejectRateLimit(res, createRate.retryAfterSeconds, 'Meetup creation limit exceeded. Please try again later.', {
        action: 'create_meetup',
        userId: req.user.id,
        route: '/meetups',
      });
    }

    try {
      const meetupId = uuidv4();
      db.prepare(`
        INSERT INTO social_meetups
        (id, host_user_id, store_id, title, description, location_text, lat, lng, start_at, end_at, max_attendees, visibility, status, cover_image_url, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, datetime('now'), datetime('now'))
      `).run(
        meetupId,
        req.user.id,
        req.user.store_id || 'unknown',
        title,
        description,
        locationText,
        Number.isFinite(lat) ? lat : null,
        Number.isFinite(lng) ? lng : null,
        startAtSql,
        endAtSql,
        maxAttendees,
        visibility,
        coverImageUrl || null
      );
      db.prepare(`
        INSERT INTO social_meetup_attendees
        (meetup_id, user_id, status, joined_at, created_at, updated_at)
        VALUES (?, ?, 'going', datetime('now'), datetime('now'), datetime('now'))
      `).run(meetupId, req.user.id);

      const row = db.prepare('SELECT * FROM social_meetups WHERE id = ? LIMIT 1').get(meetupId);
      return res.status(201).json(apiResponse(mapMeetupRow(req.user.id, row)));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.get('/meetups', (req, res) => {
    const limit = parseLimit(req.query.limit, 20, 50);
    const cursor = decodeCursor(req.query.cursor);
    const hostUserId = req.query.host_user_id ? String(req.query.host_user_id).trim() : '';
    const query = String(req.query.query || req.query.q || '').trim().toLowerCase();
    const mine = String(req.query.mine || '').trim().toLowerCase() === 'true';
    const visibilityFilter = req.query.visibility ? String(req.query.visibility).trim().toLowerCase() : '';
    const startFrom = toSqlDateTime(req.query.start_from);
    const startTo = toSqlDateTime(req.query.start_to);

    try {
      let whereCursor = '';
      const params = [];
      let where = `
        WHERE m.status = 'scheduled'
          AND m.end_at >= datetime('now')
      `;
      if (mine) {
        where += ' AND m.host_user_id = ?';
        params.push(req.user.id);
      } else if (hostUserId) {
        where += ' AND m.host_user_id = ?';
        params.push(hostUserId);
      }
      if (visibilityFilter && ['public', 'followers', 'private'].includes(visibilityFilter)) {
        where += ' AND m.visibility = ?';
        params.push(visibilityFilter);
      }
      if (startFrom) {
        where += ' AND m.start_at >= ?';
        params.push(startFrom);
      }
      if (startTo) {
        where += ' AND m.start_at <= ?';
        params.push(startTo);
      }
      if (query) {
        where += `
          AND (
            LOWER(m.title) LIKE ?
            OR LOWER(COALESCE(m.description, '')) LIKE ?
            OR LOWER(COALESCE(m.location_text, '')) LIKE ?
          )
        `;
        params.push(`%${query}%`, `%${query}%`, `%${query}%`);
      }
      if (cursor) {
        whereCursor = ' AND (m.start_at > ? OR (m.start_at = ? AND m.id > ?))';
        params.push(cursor.createdAt, cursor.createdAt, cursor.id);
      }
      params.push(limit + 1);

      const rows = db.prepare(`
        SELECT m.*
        FROM social_meetups m
        ${where}
        ${whereCursor}
        ORDER BY m.start_at ASC, m.id ASC
        LIMIT ?
      `).all(...params);

      const filtered = rows.filter((row) => canViewMeetupRow(req.user.id, row));
      const hasMore = rows.length > limit;
      const trimmed = filtered.slice(0, limit);
      const items = trimmed.map((row) => mapMeetupRow(req.user.id, row));
      const last = rows[Math.min(rows.length, limit) - 1];
      const nextCursor = hasMore && last ? encodeCursor(last.start_at, last.id) : null;
      return res.json(apiResponse({ items, nextCursor }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.get('/meetups/me', (req, res) => {
    const limit = parseLimit(req.query.limit, 20, 50);
    const cursor = decodeCursor(req.query.cursor);
    try {
      let whereCursor = '';
      const params = [req.user.id];
      if (cursor) {
        whereCursor = ' AND (m.start_at > ? OR (m.start_at = ? AND m.id > ?))';
        params.push(cursor.createdAt, cursor.createdAt, cursor.id);
      }
      params.push(limit + 1);
      const rows = db.prepare(`
        SELECT m.*
        FROM social_meetup_attendees a
        JOIN social_meetups m ON m.id = a.meetup_id
        WHERE a.user_id = ?
          AND a.status IN ('going', 'requested')
          AND m.end_at >= datetime('now')
          ${whereCursor}
        ORDER BY m.start_at ASC, m.id ASC
        LIMIT ?
      `).all(...params);
      const hasMore = rows.length > limit;
      const trimmed = hasMore ? rows.slice(0, limit) : rows;
      const items = trimmed
        .filter((row) => canViewMeetupRow(req.user.id, row))
        .map((row) => mapMeetupRow(req.user.id, row));
      const last = rows[Math.min(rows.length, limit) - 1];
      const nextCursor = hasMore && last ? encodeCursor(last.start_at, last.id) : null;
      return res.json(apiResponse({ items, nextCursor }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.get('/meetups/:id', (req, res) => {
    const meetupId = String(req.params.id || '').trim();
    if (!meetupId) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'meetup id is required' }));
    }
    try {
      const row = db.prepare('SELECT * FROM social_meetups WHERE id = ? LIMIT 1').get(meetupId);
      if (!row) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Meetup not found' }));
      }
      if (!canViewMeetupRow(req.user.id, row)) {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Cannot access this meetup' }));
      }
      const attendees = db.prepare(`
        SELECT a.user_id, a.status, a.joined_at, a.updated_at
        FROM social_meetup_attendees a
        WHERE a.meetup_id = ?
          AND a.status IN ('going', 'requested')
        ORDER BY CASE WHEN a.status = 'going' THEN 0 ELSE 1 END, a.updated_at DESC, a.user_id ASC
        LIMIT 100
      `).all(meetupId).map((rowAttendee) => {
        const profile = mapProfileFor(req.user.id, rowAttendee.user_id);
        return {
          userId: rowAttendee.user_id,
          status: rowAttendee.status,
          joinedAt: toIso(rowAttendee.joined_at),
          updatedAt: toIso(rowAttendee.updated_at),
          displayName: profile?.displayName || 'User',
          avatarUrl: profile?.avatarUrl || null,
        };
      });
      const pendingRequests = attendees.filter((attendee) => attendee.status === 'requested');
      return res.json(apiResponse({
        ...mapMeetupRow(req.user.id, row),
        attendees,
        pendingRequests,
      }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.post('/meetups/:id/join', (req, res) => {
    const meetupId = String(req.params.id || '').trim();
    if (!meetupId) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'meetup id is required' }));
    }
    const joinRate = consumeRateLimit(`meetups:join:${req.user.id}`, RATE_LIMITS.meetupsJoin.limit, RATE_LIMITS.meetupsJoin.windowMs);
    if (!joinRate.ok) {
      return rejectRateLimit(res, joinRate.retryAfterSeconds, 'Meetup join limit exceeded. Please try again later.', {
        action: 'join_meetup',
        userId: req.user.id,
        route: '/meetups/:id/join',
      });
    }
    try {
      const tx = db.transaction(() => {
        const meetup = db.prepare('SELECT * FROM social_meetups WHERE id = ? LIMIT 1').get(meetupId);
        if (!meetup) return { code: 404, body: apiResponse(null, { code: 'NOT_FOUND', message: 'Meetup not found' }) };
        if (String(meetup.status) !== 'scheduled') return { code: 400, body: apiResponse(null, { code: 'VALIDATION', message: 'Meetup is not joinable' }) };
        if (meetup.host_user_id === req.user.id) return { code: 400, body: apiResponse(null, { code: 'VALIDATION', message: 'Host is already attending' }) };
        if (isBlockedBetween(req.user.id, meetup.host_user_id)) return { code: 403, body: apiResponse(null, { code: 'FORBIDDEN', message: 'Cannot join due to block relationship' }) };
        if (String(meetup.start_at) <= new Date().toISOString().slice(0, 19).replace('T', ' ')) {
          return { code: 400, body: apiResponse(null, { code: 'VALIDATION', message: 'Meetup already started' }) };
        }

        const isFollower = isActiveFollower(req.user.id, meetup.host_user_id);
        const desiredStatus = (meetup.visibility === 'private' || (meetup.visibility === 'followers' && !isFollower))
          ? 'requested'
          : 'going';
        const previousAttendance = db.prepare(`
          SELECT status
          FROM social_meetup_attendees
          WHERE meetup_id = ?
            AND user_id = ?
          LIMIT 1
        `).get(meetupId, req.user.id);

        if (desiredStatus === 'going' && meetup.max_attendees != null) {
          const countRow = db.prepare(`
            SELECT COUNT(1) AS cnt
            FROM social_meetup_attendees
            WHERE meetup_id = ?
              AND status = 'going'
          `).get(meetupId);
          if (Number(countRow?.cnt || 0) >= Number(meetup.max_attendees)) {
            return { code: 409, body: apiResponse(null, { code: 'CAPACITY_REACHED', message: 'Meetup capacity reached' }) };
          }
        }

        db.prepare(`
          INSERT INTO social_meetup_attendees
          (meetup_id, user_id, status, joined_at, left_at, created_at, updated_at)
          VALUES (?, ?, ?, CASE WHEN ? = 'going' THEN datetime('now') ELSE NULL END, NULL, datetime('now'), datetime('now'))
          ON CONFLICT(meetup_id, user_id) DO UPDATE SET
            status = excluded.status,
            joined_at = CASE WHEN excluded.status = 'going' THEN datetime('now') ELSE social_meetup_attendees.joined_at END,
            left_at = CASE WHEN excluded.status = 'left' THEN datetime('now') ELSE NULL END,
            updated_at = datetime('now')
        `).run(meetupId, req.user.id, desiredStatus, desiredStatus);

        const previousStatus = String(previousAttendance?.status || '');
        if (desiredStatus === 'requested' && previousStatus !== 'requested') {
          insertNotification({
            userId: meetup.host_user_id,
            type: 'meetup_request_received',
            actorUserId: req.user.id,
            objectType: 'meetup',
            objectId: meetup.id,
            payload: {
              meetup_id: meetup.id,
              meetup_title: meetup.title,
            },
          });
        } else if (desiredStatus === 'going' && previousStatus !== 'going') {
          insertNotification({
            userId: meetup.host_user_id,
            type: 'meetup_attendee_joined',
            actorUserId: req.user.id,
            objectType: 'meetup',
            objectId: meetup.id,
            payload: {
              meetup_id: meetup.id,
              meetup_title: meetup.title,
            },
          });
        }

        return { code: 200, body: apiResponse({ success: true, status: desiredStatus }) };
      });

      const result = tx();
      return res.status(result.code).json(result.body);
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.post('/meetups/:id/leave', (req, res) => {
    const meetupId = String(req.params.id || '').trim();
    if (!meetupId) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'meetup id is required' }));
    }
    try {
      const meetup = db.prepare('SELECT id, host_user_id FROM social_meetups WHERE id = ? LIMIT 1').get(meetupId);
      if (!meetup) return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Meetup not found' }));
      if (meetup.host_user_id === req.user.id) {
        return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Host cannot leave own meetup; cancel instead' }));
      }
      const result = db.prepare(`
        UPDATE social_meetup_attendees
        SET status = 'left',
            left_at = datetime('now'),
            updated_at = datetime('now')
        WHERE meetup_id = ?
          AND user_id = ?
          AND status IN ('going', 'requested')
      `).run(meetupId, req.user.id);
      if (result.changes === 0) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Attendance not found' }));
      }
      return res.json(apiResponse({ success: true }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.post('/meetups/:id/cancel', (req, res) => {
    const meetupId = String(req.params.id || '').trim();
    const cancelReason = req.body?.cancel_reason != null ? String(req.body.cancel_reason).trim() : null;
    if (!meetupId) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'meetup id is required' }));
    }
    try {
      const tx = db.transaction(() => {
        const meetup = db.prepare('SELECT id, host_user_id, status, title FROM social_meetups WHERE id = ? LIMIT 1').get(meetupId);
        if (!meetup) return { code: 404, body: apiResponse(null, { code: 'NOT_FOUND', message: 'Meetup not found' }) };
        if (meetup.host_user_id !== req.user.id) {
          return { code: 403, body: apiResponse(null, { code: 'FORBIDDEN', message: 'Only host can cancel meetup' }) };
        }
        if (meetup.status !== 'scheduled') {
          return { code: 400, body: apiResponse(null, { code: 'VALIDATION', message: 'Meetup is not in scheduled state' }) };
        }
        db.prepare(`
          UPDATE social_meetups
          SET status = 'cancelled',
              cancel_reason = ?,
              cancelled_at = datetime('now'),
              updated_at = datetime('now')
          WHERE id = ?
        `).run(cancelReason, meetupId);

        const attendees = db.prepare(`
          SELECT user_id
          FROM social_meetup_attendees
          WHERE meetup_id = ?
            AND status = 'going'
        `).all(meetupId);
        for (const attendee of attendees) {
          insertNotification({
            userId: attendee.user_id,
            type: 'meetup_cancelled',
            actorUserId: req.user.id,
            objectType: 'meetup',
            objectId: meetup.id,
            payload: {
              meetup_id: meetup.id,
              meetup_title: meetup.title,
              cancel_reason: cancelReason,
            },
          });
        }
        return { code: 200, body: apiResponse({ success: true }) };
      });
      const result = tx();
      return res.status(result.code).json(result.body);
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.post('/meetups/:id/requests/:userId/approve', (req, res) => {
    const meetupId = String(req.params.id || '').trim();
    const targetUserId = String(req.params.userId || '').trim();
    if (!meetupId || !targetUserId) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'meetup id and userId are required' }));
    }
    try {
      const tx = db.transaction(() => {
        const meetup = db.prepare('SELECT * FROM social_meetups WHERE id = ? LIMIT 1').get(meetupId);
        if (!meetup) return { code: 404, body: apiResponse(null, { code: 'NOT_FOUND', message: 'Meetup not found' }) };
        if (meetup.host_user_id !== req.user.id) return { code: 403, body: apiResponse(null, { code: 'FORBIDDEN', message: 'Only host can approve requests' }) };
        if (meetup.status !== 'scheduled') return { code: 400, body: apiResponse(null, { code: 'VALIDATION', message: 'Meetup is not in scheduled state' }) };

        if (meetup.max_attendees != null) {
          const countRow = db.prepare(`
            SELECT COUNT(1) AS cnt
            FROM social_meetup_attendees
            WHERE meetup_id = ?
              AND status = 'going'
          `).get(meetupId);
          if (Number(countRow?.cnt || 0) >= Number(meetup.max_attendees)) {
            return { code: 409, body: apiResponse(null, { code: 'CAPACITY_REACHED', message: 'Meetup capacity reached' }) };
          }
        }

        const result = db.prepare(`
          UPDATE social_meetup_attendees
          SET status = 'going',
              joined_at = datetime('now'),
              left_at = NULL,
              updated_at = datetime('now')
          WHERE meetup_id = ?
            AND user_id = ?
            AND status = 'requested'
        `).run(meetupId, targetUserId);
        if (result.changes === 0) {
          return { code: 404, body: apiResponse(null, { code: 'NOT_FOUND', message: 'Join request not found' }) };
        }

        insertNotification({
          userId: targetUserId,
          type: 'meetup_request_approved',
          actorUserId: req.user.id,
          objectType: 'meetup',
          objectId: meetup.id,
          payload: {
            meetup_id: meetup.id,
            meetup_title: meetup.title,
          },
        });
        return { code: 200, body: apiResponse({ success: true }) };
      });
      const result = tx();
      return res.status(result.code).json(result.body);
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.post('/meetups/:id/requests/:userId/reject', (req, res) => {
    const meetupId = String(req.params.id || '').trim();
    const targetUserId = String(req.params.userId || '').trim();
    if (!meetupId || !targetUserId) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'meetup id and userId are required' }));
    }
    try {
      const tx = db.transaction(() => {
        const meetup = db.prepare('SELECT id, host_user_id, title FROM social_meetups WHERE id = ? LIMIT 1').get(meetupId);
        if (!meetup) return { code: 404, body: apiResponse(null, { code: 'NOT_FOUND', message: 'Meetup not found' }) };
        if (meetup.host_user_id !== req.user.id) {
          return { code: 403, body: apiResponse(null, { code: 'FORBIDDEN', message: 'Only host can reject requests' }) };
        }
        const result = db.prepare(`
          UPDATE social_meetup_attendees
          SET status = 'declined',
              left_at = datetime('now'),
              updated_at = datetime('now')
          WHERE meetup_id = ?
            AND user_id = ?
            AND status = 'requested'
        `).run(meetupId, targetUserId);
        if (result.changes === 0) {
          return { code: 404, body: apiResponse(null, { code: 'NOT_FOUND', message: 'Join request not found' }) };
        }

        insertNotification({
          userId: targetUserId,
          type: 'meetup_request_rejected',
          actorUserId: req.user.id,
          objectType: 'meetup',
          objectId: meetup.id,
          payload: {
            meetup_id: meetup.id,
            meetup_title: meetup.title,
          },
        });
        return { code: 200, body: apiResponse({ success: true }) };
      });
      const result = tx();
      return res.status(result.code).json(result.body);
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.post('/meetups/:id/report', (req, res) => {
    const meetupId = String(req.params.id || '').trim();
    const reasonCode = String(req.body?.reason_code || req.body?.reasonCode || '').trim();
    const details = req.body?.details != null ? String(req.body.details).trim() : null;
    if (!meetupId || !reasonCode) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'meetup id and reason_code are required' }));
    }
    const reportRateCheck = consumeRateLimit(`reports:${req.user.id}`, RATE_LIMITS.reports.limit, RATE_LIMITS.reports.windowMs);
    if (!reportRateCheck.ok) {
      return rejectRateLimit(res, reportRateCheck.retryAfterSeconds, 'Report rate limit exceeded. Please try again later.', {
        action: 'submit_meetup_report',
        userId: req.user.id,
        route: '/meetups/:id/report',
      });
    }
    try {
      const meetup = db.prepare('SELECT id FROM social_meetups WHERE id = ? LIMIT 1').get(meetupId);
      if (!meetup) return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Meetup not found' }));

      const dup = db.prepare(`
        SELECT COUNT(1) AS cnt
        FROM social_meetup_reports
        WHERE reporter_user_id = ?
          AND meetup_id = ?
          AND created_at >= datetime('now', '-24 hours')
      `).get(req.user.id, meetupId);
      if (Number(dup?.cnt || 0) >= 3) {
        recordAbuseMetric({
          kind: 'spam',
          action: 'report_bombing_meetup',
          userId: req.user.id,
          route: '/meetups/:id/report',
          code: 'SPAM_DETECTED',
          details: { meetup_id: meetupId },
        });
        return res.status(429).json(apiResponse(null, {
          code: 'SPAM_DETECTED',
          message: 'Too many reports on the same meetup in a short period. Please wait for moderation review.',
        }));
      }

      db.prepare(`
        INSERT INTO social_meetup_reports
        (id, reporter_user_id, meetup_id, reason_code, details, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
      `).run(uuidv4(), req.user.id, meetupId, reasonCode, details);

      return res.status(201).json(apiResponse({ success: true }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.post('/follows/:userId', (req, res) => {
    const targetUserId = String(req.params.userId || '').trim();
    if (!targetUserId || targetUserId === req.user.id) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Invalid follow target' }));
    }
    const followRateCheck = consumeRateLimit(`follows:${req.user.id}`, RATE_LIMITS.follows.limit, RATE_LIMITS.follows.windowMs);
    if (!followRateCheck.ok) {
      return rejectRateLimit(res, followRateCheck.retryAfterSeconds, 'Follow action rate limit exceeded. Please try again later.', {
        action: 'follow_user',
        userId: req.user.id,
        route: '/follows/:userId',
      });
    }
    const churnCheck = consumeRateLimit(`follow-churn:${req.user.id}:${targetUserId}`, 8, 30 * 60 * 1000);
    if (!churnCheck.ok) {
      recordAbuseMetric({
        kind: 'spam',
        action: 'follow_unfollow_churn',
        userId: req.user.id,
        route: '/follows/:userId',
        code: 'SPAM_DETECTED',
        retryAfterSeconds: churnCheck.retryAfterSeconds,
        details: { target_user_id: targetUserId },
      });
      return res.status(429).json(apiResponse(null, {
        code: 'SPAM_DETECTED',
        message: 'Follow/unfollow churn detected. Please wait before changing this relationship again.',
        retry_after_seconds: churnCheck.retryAfterSeconds,
      }));
    }
    try {
      if (isBlockedBetween(req.user.id, targetUserId)) {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Cannot follow blocked user' }));
      }
      const target = db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1 LIMIT 1').get(targetUserId);
      if (!target) return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'User not found' }));
      const targetSocialSettings = db.prepare(`
        SELECT profile_visibility
        FROM social_users
        WHERE user_id = ?
        LIMIT 1
      `).get(targetUserId);
      const followStatus = (targetSocialSettings?.profile_visibility === 'followers_only' || targetSocialSettings?.profile_visibility === 'private')
        ? 'requested'
        : 'active';

      db.prepare(`
        INSERT INTO social_follows (id, follower_user_id, followed_user_id, status, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(follower_user_id, followed_user_id)
        DO UPDATE SET status = excluded.status
      `).run(uuidv4(), req.user.id, targetUserId, followStatus);
      insertNotification({
        userId: targetUserId,
        type: 'follow',
        actorUserId: req.user.id,
        objectType: 'follow',
        objectId: req.user.id,
        payload: { follower_id: req.user.id, status: followStatus },
      });
      return res.status(201).json(apiResponse({ success: true, status: followStatus }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.get('/me/follow-requests', (req, res) => {
    const limit = parseLimit(req.query.limit, 30, 100);
    try {
      const rows = db.prepare(`
        SELECT follower_user_id
        FROM social_follows
        WHERE followed_user_id = ?
          AND status = 'requested'
        ORDER BY created_at DESC
        LIMIT ?
      `).all(req.user.id, limit);
      const items = rows
        .map((row) => mapProfileFor(req.user.id, row.follower_user_id))
        .filter(Boolean);
      return res.json(apiResponse({ items, nextCursor: null }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.post('/follows/:userId/accept', (req, res) => {
    const requesterUserId = String(req.params.userId || '').trim();
    if (!requesterUserId || requesterUserId === req.user.id) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Invalid requester user id' }));
    }
    const followRateCheck = consumeRateLimit(`follows:${req.user.id}`, RATE_LIMITS.follows.limit, RATE_LIMITS.follows.windowMs);
    if (!followRateCheck.ok) {
      return rejectRateLimit(res, followRateCheck.retryAfterSeconds, 'Follow action rate limit exceeded. Please try again later.', {
        action: 'accept_follow_request',
        userId: req.user.id,
        route: '/follows/:userId/accept',
      });
    }
    try {
      const result = db.prepare(`
        UPDATE social_follows
        SET status = 'active'
        WHERE follower_user_id = ?
          AND followed_user_id = ?
          AND status = 'requested'
      `).run(requesterUserId, req.user.id);
      if (result.changes === 0) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Follow request not found' }));
      }
      insertNotification({
        userId: requesterUserId,
        type: 'follow_accepted',
        actorUserId: req.user.id,
        objectType: 'follow',
        objectId: req.user.id,
        payload: { followed_id: req.user.id },
      });
      return res.json(apiResponse({ success: true }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.post('/follow-requests/:userId/accept', (req, res) => {
    const requesterUserId = String(req.params.userId || '').trim();
    if (!requesterUserId || requesterUserId === req.user.id) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Invalid requester user id' }));
    }
    const followRateCheck = consumeRateLimit(`follows:${req.user.id}`, RATE_LIMITS.follows.limit, RATE_LIMITS.follows.windowMs);
    if (!followRateCheck.ok) {
      return rejectRateLimit(res, followRateCheck.retryAfterSeconds, 'Follow action rate limit exceeded. Please try again later.', {
        action: 'accept_follow_request',
        userId: req.user.id,
        route: '/follow-requests/:userId/accept',
      });
    }
    try {
      const result = db.prepare(`
        UPDATE social_follows
        SET status = 'active'
        WHERE follower_user_id = ?
          AND followed_user_id = ?
          AND status = 'requested'
      `).run(requesterUserId, req.user.id);
      if (result.changes === 0) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Follow request not found' }));
      }
      insertNotification({
        userId: requesterUserId,
        type: 'follow_accepted',
        actorUserId: req.user.id,
        objectType: 'follow',
        objectId: req.user.id,
        payload: { followed_id: req.user.id },
      });
      return res.json(apiResponse({ success: true }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.delete('/follows/:userId/reject', (req, res) => {
    const requesterUserId = String(req.params.userId || '').trim();
    if (!requesterUserId || requesterUserId === req.user.id) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Invalid requester user id' }));
    }
    const followRateCheck = consumeRateLimit(`follows:${req.user.id}`, RATE_LIMITS.follows.limit, RATE_LIMITS.follows.windowMs);
    if (!followRateCheck.ok) {
      return rejectRateLimit(res, followRateCheck.retryAfterSeconds, 'Follow action rate limit exceeded. Please try again later.', {
        action: 'reject_follow_request',
        userId: req.user.id,
        route: '/follows/:userId/reject',
      });
    }
    try {
      const result = db.prepare(`
        DELETE FROM social_follows
        WHERE follower_user_id = ?
          AND followed_user_id = ?
          AND status = 'requested'
      `).run(requesterUserId, req.user.id);
      if (result.changes === 0) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Follow request not found' }));
      }
      return res.json(apiResponse({ success: true }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.delete('/follow-requests/:userId/reject', (req, res) => {
    const requesterUserId = String(req.params.userId || '').trim();
    if (!requesterUserId || requesterUserId === req.user.id) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Invalid requester user id' }));
    }
    const followRateCheck = consumeRateLimit(`follows:${req.user.id}`, RATE_LIMITS.follows.limit, RATE_LIMITS.follows.windowMs);
    if (!followRateCheck.ok) {
      return rejectRateLimit(res, followRateCheck.retryAfterSeconds, 'Follow action rate limit exceeded. Please try again later.', {
        action: 'reject_follow_request',
        userId: req.user.id,
        route: '/follow-requests/:userId/reject',
      });
    }
    try {
      const result = db.prepare(`
        DELETE FROM social_follows
        WHERE follower_user_id = ?
          AND followed_user_id = ?
          AND status = 'requested'
      `).run(requesterUserId, req.user.id);
      if (result.changes === 0) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Follow request not found' }));
      }
      return res.json(apiResponse({ success: true }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.delete('/follows/:userId', (req, res) => {
    const targetUserId = String(req.params.userId || '').trim();
    const followRateCheck = consumeRateLimit(`follows:${req.user.id}`, RATE_LIMITS.follows.limit, RATE_LIMITS.follows.windowMs);
    if (!followRateCheck.ok) {
      return rejectRateLimit(res, followRateCheck.retryAfterSeconds, 'Follow action rate limit exceeded. Please try again later.', {
        action: 'unfollow_user',
        userId: req.user.id,
        route: '/follows/:userId',
      });
    }
    const churnCheck = consumeRateLimit(`follow-churn:${req.user.id}:${targetUserId}`, 8, 30 * 60 * 1000);
    if (!churnCheck.ok) {
      recordAbuseMetric({
        kind: 'spam',
        action: 'follow_unfollow_churn',
        userId: req.user.id,
        route: '/follows/:userId',
        code: 'SPAM_DETECTED',
        retryAfterSeconds: churnCheck.retryAfterSeconds,
        details: { target_user_id: targetUserId },
      });
      return res.status(429).json(apiResponse(null, {
        code: 'SPAM_DETECTED',
        message: 'Follow/unfollow churn detected. Please wait before changing this relationship again.',
        retry_after_seconds: churnCheck.retryAfterSeconds,
      }));
    }
    try {
      db.prepare('DELETE FROM social_follows WHERE follower_user_id = ? AND followed_user_id = ?').run(req.user.id, targetUserId);
      return res.json(apiResponse({ success: true }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.post('/blocks/:userId', (req, res) => {
    const targetUserId = String(req.params.userId || '').trim();
    if (!targetUserId || targetUserId === req.user.id) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Invalid block target' }));
    }
    try {
      db.prepare(`
        INSERT INTO social_blocks (blocker_user_id, blocked_user_id, reason, created_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(blocker_user_id, blocked_user_id)
        DO NOTHING
      `).run(req.user.id, targetUserId, null);
      return res.status(201).json(apiResponse({ success: true }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.delete('/blocks/:userId', (req, res) => {
    const targetUserId = String(req.params.userId || '').trim();
    try {
      db.prepare('DELETE FROM social_blocks WHERE blocker_user_id = ? AND blocked_user_id = ?').run(req.user.id, targetUserId);
      return res.json(apiResponse({ success: true }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.post('/threads/direct', (req, res) => {
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
        FROM social_users
        WHERE user_id = ?
      `).get(otherUserId) || { message_privacy: 'everyone', is_messaging_enabled: 1 };

      if (!settings.is_messaging_enabled || settings.message_privacy === 'nobody') {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'User is not accepting messages' }));
      }
      if (settings.message_privacy === 'followers_only') {
        const follow = db.prepare(`
          SELECT 1 AS hit
          FROM social_follows
          WHERE follower_user_id = ? AND followed_user_id = ? AND status = 'active'
          LIMIT 1
        `).get(req.user.id, otherUserId);
        if (!follow?.hit) {
          return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Follow is required to message this user' }));
        }
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
        // V1 thread list unread is intentionally binary (thread has unread or not) for lightweight query cost.
        // Global unread badge uses conversation count, not exact per-thread message counts.
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
        FROM social_users
        WHERE user_id = ?
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
      const recipients = db.prepare(`
        SELECT user_id
        FROM social_thread_members
        WHERE thread_id = ?
          AND user_id != ?
          AND left_at IS NULL
      `).all(req.threadId, req.user.id);
      for (const target of recipients) {
        insertNotification({
          userId: target.user_id,
          type: 'message',
          actorUserId: req.user.id,
          objectType: 'thread',
          objectId: req.threadId,
          payload: { thread_id: req.threadId, preview: messageType === 'image' ? '[image]' : body.slice(0, 80) },
        });
      }

      const created = db.prepare(`
        SELECT id, thread_id, sender_user_id, message_type, body, media_url, client_msg_id, created_at, edited_at, deleted_at
        FROM social_messages
        WHERE id = ?
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

  router.post('/threads/:threadId/pin', requireThreadMember, (req, res) => {
    try {
      db.prepare(`
        UPDATE social_thread_members
        SET is_pinned = 1
        WHERE thread_id = ? AND user_id = ?
      `).run(req.threadId, req.user.id);
      return res.json(apiResponse({ success: true, isPinned: true }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.delete('/threads/:threadId/pin', requireThreadMember, (req, res) => {
    try {
      db.prepare(`
        UPDATE social_thread_members
        SET is_pinned = 0
        WHERE thread_id = ? AND user_id = ?
      `).run(req.threadId, req.user.id);
      return res.json(apiResponse({ success: true, isPinned: false }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.post('/threads/:threadId/mute', requireThreadMember, (req, res) => {
    try {
      db.prepare(`
        UPDATE social_thread_members
        SET is_muted = 1
        WHERE thread_id = ? AND user_id = ?
      `).run(req.threadId, req.user.id);
      return res.json(apiResponse({ success: true, isMuted: true }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.delete('/threads/:threadId/mute', requireThreadMember, (req, res) => {
    try {
      db.prepare(`
        UPDATE social_thread_members
        SET is_muted = 0
        WHERE thread_id = ? AND user_id = ?
      `).run(req.threadId, req.user.id);
      return res.json(apiResponse({ success: true, isMuted: false }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.get('/threads/:threadId/typing', requireThreadMember, (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT st.user_id, st.updated_at, u.name, u.avatar_url
        FROM social_typing st
        LEFT JOIN users u ON u.id = st.user_id
        WHERE st.thread_id = ?
          AND st.user_id != ?
          AND st.updated_at >= datetime('now', '-5 seconds')
        ORDER BY st.updated_at DESC
      `).all(req.threadId, req.user.id);
      const items = rows.map((row) => ({
        userId: row.user_id,
        displayName: row.name || 'User',
        avatarUrl: row.avatar_url || null,
        updatedAt: toIso(row.updated_at),
      }));
      return res.json(apiResponse({ items }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.post('/threads/:threadId/typing', requireThreadMember, (req, res) => {
    try {
      db.prepare(`
        INSERT INTO social_typing (thread_id, user_id, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(thread_id, user_id) DO UPDATE SET updated_at = datetime('now')
      `).run(req.threadId, req.user.id);
      return res.json(apiResponse({ success: true }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.delete('/threads/:threadId/members/me', requireThreadMember, (req, res) => {
    try {
      db.prepare(`
        UPDATE social_thread_members
        SET is_hidden = 1,
            left_at = datetime('now')
        WHERE thread_id = ? AND user_id = ?
      `).run(req.threadId, req.user.id);
      return res.json(apiResponse({ success: true }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.post('/reports', (req, res) => {
    const targetType = String(req.body?.target_type || '').trim();
    const targetId = String(req.body?.target_id || '').trim();
    const reasonCode = String(req.body?.reason_code || '').trim();
    const details = req.body?.details != null ? String(req.body.details).trim() : null;
    if (!['user', 'message', 'post', 'comment'].includes(targetType) || !targetId || !reasonCode) {
      return res.status(400).json(apiResponse(null, {
        code: 'VALIDATION',
        message: 'target_type, target_id, and reason_code are required',
      }));
    }
    const reportRateCheck = consumeRateLimit(`reports:${req.user.id}`, RATE_LIMITS.reports.limit, RATE_LIMITS.reports.windowMs);
    if (!reportRateCheck.ok) {
      return rejectRateLimit(res, reportRateCheck.retryAfterSeconds, 'Report rate limit exceeded. Please try again later.', {
        action: 'submit_report',
        userId: req.user.id,
        route: '/reports',
      });
    }
    try {
      let targetRow = null;
      if (targetType === 'user') {
        targetRow = db.prepare(`
          SELECT id
          FROM users
          WHERE id = ?
          LIMIT 1
        `).get(targetId);
      } else if (targetType === 'message') {
        targetRow = db.prepare(`
          SELECT id, sender_user_id AS owner_user_id, deleted_at
          FROM social_messages
          WHERE id = ?
          LIMIT 1
        `).get(targetId);
      } else if (targetType === 'post') {
        targetRow = db.prepare(`
          SELECT id, user_id AS owner_user_id, deleted_at, flagged_at
          FROM social_posts
          WHERE id = ?
          LIMIT 1
        `).get(targetId);
      } else if (targetType === 'comment') {
        targetRow = db.prepare(`
          SELECT id, user_id AS owner_user_id, deleted_at, flagged_at
          FROM social_post_comments
          WHERE id = ?
          LIMIT 1
        `).get(targetId);
      }
      if (!targetRow || targetRow.deleted_at) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Report target not found' }));
      }
      if (targetRow.owner_user_id && targetRow.owner_user_id === req.user.id) {
        return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Cannot report your own content' }));
      }

      const reportBombRow = db.prepare(`
        SELECT COUNT(1) AS cnt
        FROM social_reports
        WHERE reporter_user_id = ?
          AND target_type = ?
          AND target_id = ?
          AND created_at >= datetime('now', '-24 hours')
      `).get(req.user.id, targetType, targetId);
      if (Number(reportBombRow?.cnt || 0) >= 3) {
        recordAbuseMetric({
          kind: 'spam',
          action: 'report_bombing',
          userId: req.user.id,
          route: '/reports',
          code: 'SPAM_DETECTED',
          details: { target_type: targetType, target_id: targetId },
        });
        return res.status(429).json(apiResponse(null, {
          code: 'SPAM_DETECTED',
          message: 'Too many reports on the same target in a short period. Please wait for moderation review.',
        }));
      }
      db.prepare(`
        INSERT INTO social_reports
        (id, reporter_user_id, target_type, target_id, reason_code, details, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
      `).run(uuidv4(), req.user.id, targetType, targetId, reasonCode, details);

      if (targetType === 'post' || targetType === 'comment') {
        const counters = db.prepare(`
          SELECT
            COUNT(1) AS total_reports,
            COUNT(DISTINCT reporter_user_id) AS distinct_reporters
          FROM social_reports
          WHERE target_type = ?
            AND target_id = ?
            AND created_at >= datetime('now', '-30 days')
        `).get(targetType, targetId);
        const totalReports = Number(counters?.total_reports || 0);
        const distinctReporters = Number(counters?.distinct_reporters || 0);
        const shouldAutoFlag = distinctReporters >= AUTO_FLAG_REPORT_THRESHOLD;
        if (targetType === 'post') {
          db.prepare(`
            UPDATE social_posts
            SET flagged_report_count = ?,
                flagged_at = CASE WHEN flagged_at IS NULL AND ? THEN datetime('now') ELSE flagged_at END,
                flagged_reason_code = CASE WHEN flagged_at IS NULL AND ? THEN 'auto_report_threshold' ELSE flagged_reason_code END,
                updated_at = datetime('now')
            WHERE id = ?
          `).run(totalReports, shouldAutoFlag ? 1 : 0, shouldAutoFlag ? 1 : 0, targetId);
        } else {
          db.prepare(`
            UPDATE social_post_comments
            SET flagged_report_count = ?,
                flagged_at = CASE WHEN flagged_at IS NULL AND ? THEN datetime('now') ELSE flagged_at END,
                flagged_reason_code = CASE WHEN flagged_at IS NULL AND ? THEN 'auto_report_threshold' ELSE flagged_reason_code END,
                updated_at = datetime('now')
            WHERE id = ?
          `).run(totalReports, shouldAutoFlag ? 1 : 0, shouldAutoFlag ? 1 : 0, targetId);
        }
      }

      return res.status(201).json(apiResponse({ success: true }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.get('/admin/reports', (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Admin role required' }));
    }
    const limit = parseLimit(req.query.limit, 30, 100);
    const cursor = decodeCursor(req.query.cursor);
    const status = String(req.query.status || '').trim();
    const allowedStatus = new Set(['pending', 'reviewed', 'actioned']);
    if (status && !allowedStatus.has(status)) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Invalid status filter' }));
    }
    try {
      let whereCursor = '';
      const paramsBase = [];
      if (status) paramsBase.push(status);
      if (cursor) {
        whereCursor = `
          AND (
            created_at < ?
            OR (created_at = ? AND id < ?)
          )
        `;
        paramsBase.push(cursor.createdAt, cursor.createdAt, cursor.id);
      }
      const perSourceLimit = Math.max(20, limit + 1);
      const socialRows = db.prepare(`
        SELECT
          r.id, r.reporter_user_id, r.target_type, r.target_id, r.reason_code, r.details, r.status, r.created_at, r.updated_at,
          CASE
            WHEN r.target_type = 'post' THEN (SELECT p.flagged_at FROM social_posts p WHERE p.id = r.target_id)
            WHEN r.target_type = 'comment' THEN (SELECT c.flagged_at FROM social_post_comments c WHERE c.id = r.target_id)
            ELSE NULL
          END AS target_flagged_at,
          u.name AS reporter_name,
          'social' AS report_source
        FROM social_reports r
        LEFT JOIN users u ON u.id = r.reporter_user_id
        WHERE 1 = 1
          ${status ? 'AND r.status = ?' : ''}
          ${whereCursor}
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT ?
      `).all(...paramsBase, perSourceLimit);
      const meetupRows = db.prepare(`
        SELECT
          mr.id, mr.reporter_user_id, 'meetup' AS target_type, mr.meetup_id AS target_id, mr.reason_code, mr.details, mr.status, mr.created_at, mr.updated_at,
          u.name AS reporter_name,
          'meetup' AS report_source
        FROM social_meetup_reports mr
        LEFT JOIN users u ON u.id = mr.reporter_user_id
        WHERE 1 = 1
          ${status ? 'AND mr.status = ?' : ''}
          ${whereCursor}
        ORDER BY mr.created_at DESC, mr.id DESC
        LIMIT ?
      `).all(...paramsBase, perSourceLimit);
      const merged = [...socialRows, ...meetupRows]
        .sort((a, b) => {
          if (a.created_at === b.created_at) return String(b.id).localeCompare(String(a.id));
          return String(b.created_at).localeCompare(String(a.created_at));
        });
      const hasMore = merged.length > limit;
      const trimmed = hasMore ? merged.slice(0, limit) : merged;
      const items = trimmed.map((row) => ({
        id: row.id,
        reportSource: row.report_source,
        reporterUserId: row.reporter_user_id,
        reporterDisplayName: row.reporter_name || null,
        targetType: row.target_type,
        targetId: row.target_id,
        reasonCode: row.reason_code,
        details: row.details,
        status: row.status,
        targetFlaggedAt: toIso(row.target_flagged_at),
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
      }));
      const last = trimmed[trimmed.length - 1];
      const nextCursor = hasMore && last ? encodeCursor(String(last.createdAt || '').replace('T', ' ').replace('Z', ''), last.id) : null;
      return res.json(apiResponse({ items, nextCursor }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.post('/admin/reports/:id/resolve', (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Admin role required' }));
    }
    const reportId = String(req.params.id || '').trim();
    const status = String(req.body?.status || 'reviewed').trim();
    if (!reportId || !['reviewed', 'actioned'].includes(status)) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Invalid report id or status' }));
    }
    try {
      const socialReport = db.prepare(`
        SELECT id, target_type, target_id
        FROM social_reports
        WHERE id = ?
        LIMIT 1
      `).get(reportId);
      const meetupReport = socialReport
        ? null
        : db.prepare(`
          SELECT id
          FROM social_meetup_reports
          WHERE id = ?
          LIMIT 1
        `).get(reportId);
      if (!socialReport && !meetupReport) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Report not found' }));
      }

      const tx = db.transaction(() => {
        if (socialReport) {
          db.prepare(`
            UPDATE social_reports
            SET status = ?,
                updated_at = datetime('now')
            WHERE id = ?
          `).run(status, reportId);

          if ((socialReport.target_type === 'post' || socialReport.target_type === 'comment') && status === 'reviewed') {
            const pendingCount = Number(db.prepare(`
              SELECT COUNT(1) AS cnt
              FROM social_reports
              WHERE target_type = ?
                AND target_id = ?
                AND status = 'pending'
                AND id != ?
            `).get(socialReport.target_type, socialReport.target_id, reportId)?.cnt || 0);
            if (pendingCount === 0) {
              if (socialReport.target_type === 'post') {
                db.prepare(`
                  UPDATE social_posts
                  SET flagged_at = NULL,
                      flagged_reason_code = NULL,
                      updated_at = datetime('now')
                  WHERE id = ?
                `).run(socialReport.target_id);
              } else {
                db.prepare(`
                  UPDATE social_post_comments
                  SET flagged_at = NULL,
                      flagged_reason_code = NULL,
                      updated_at = datetime('now')
                  WHERE id = ?
                `).run(socialReport.target_id);
              }
            }
          }
          return;
        }

        db.prepare(`
          UPDATE social_meetup_reports
          SET status = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(status, reportId);
      });
      tx();

      return res.json(apiResponse({ success: true }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.post('/admin/meetups/:id/remove', (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Admin role required' }));
    }
    const meetupId = String(req.params.id || '').trim();
    const reportId = req.body?.report_id != null ? String(req.body.report_id).trim() : null;
    const actionNote = req.body?.action_note != null ? String(req.body.action_note).trim() : null;
    if (!meetupId) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'meetup id is required' }));
    }
    try {
      const meetup = db.prepare(`
        SELECT id, host_user_id, status, title
        FROM social_meetups
        WHERE id = ?
        LIMIT 1
      `).get(meetupId);
      if (!meetup) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Meetup not found' }));
      }

      const tx = db.transaction(() => {
        if (String(meetup.status) !== 'cancelled') {
          db.prepare(`
            UPDATE social_meetups
            SET status = 'cancelled',
                cancel_reason = ?,
                cancelled_at = datetime('now'),
                updated_at = datetime('now')
            WHERE id = ?
          `).run('[ADMIN] Removed by moderation action', meetupId);
        }

        db.prepare(`
          INSERT INTO social_moderation_actions
          (id, report_id, target_user_id, target_meetup_id, action_type, duration_hours, action_note, actor_user_id, created_at)
          VALUES (?, ?, ?, ?, 'remove_meetup', NULL, ?, ?, datetime('now'))
        `).run(
          uuidv4(),
          reportId,
          meetup.host_user_id,
          meetupId,
          actionNote,
          req.user.id
        );

        if (reportId) {
          db.prepare(`
            UPDATE social_meetup_reports
            SET status = 'actioned',
                updated_at = datetime('now')
            WHERE id = ?
          `).run(reportId);
        }
      });
      tx();

      return res.json(apiResponse({ success: true }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.post('/admin/moderation-actions', (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Admin role required' }));
    }
    const reportId = req.body?.report_id != null ? String(req.body.report_id).trim() : null;
    const targetUserId = String(req.body?.target_user_id || '').trim();
    const actionType = String(req.body?.action_type || '').trim();
    const actionNote = req.body?.action_note != null ? String(req.body.action_note).trim() : null;
    const durationHoursRaw = req.body?.duration_hours;
    const durationHours = durationHoursRaw != null && Number.isFinite(Number(durationHoursRaw))
      ? Math.max(1, Math.floor(Number(durationHoursRaw)))
      : null;
    if (!targetUserId || !['warn', 'mute', 'suspend', 'ban'].includes(actionType)) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'target_user_id and valid action_type are required' }));
    }
    try {
      const targetUser = db.prepare(`
        SELECT id
        FROM users
        WHERE id = ?
        LIMIT 1
      `).get(targetUserId);
      if (!targetUser) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Target user not found' }));
      }

      db.prepare(`
        INSERT INTO social_users
        (user_id, message_privacy, profile_visibility, dog_profile_visibility, is_messaging_enabled, created_at, updated_at)
        VALUES (?, 'everyone', 'public', 'followers_only', 1, datetime('now'), datetime('now'))
        ON CONFLICT(user_id) DO NOTHING
      `).run(targetUserId);

      const tx = db.transaction(() => {
        db.prepare(`
          INSERT INTO social_moderation_actions
          (id, report_id, target_user_id, action_type, duration_hours, action_note, actor_user_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(uuidv4(), reportId, targetUserId, actionType, durationHours, actionNote, req.user.id);

        if (actionType === 'mute') {
          const hours = durationHours || 24;
          db.prepare(`
            UPDATE social_users
            SET messaging_muted_until = datetime('now', '+' || ? || ' hours'),
                updated_at = datetime('now')
            WHERE user_id = ?
          `).run(hours, targetUserId);
        } else if (actionType === 'suspend') {
          const hours = durationHours || 24;
          db.prepare(`
            UPDATE social_users
            SET suspended_until = datetime('now', '+' || ? || ' hours'),
                updated_at = datetime('now')
            WHERE user_id = ?
          `).run(hours, targetUserId);
        } else if (actionType === 'ban') {
          db.prepare(`
            UPDATE social_users
            SET suspended_until = '9999-12-31 23:59:59',
                is_messaging_enabled = 0,
                updated_at = datetime('now')
            WHERE user_id = ?
          `).run(targetUserId);
        }

        if (reportId) {
          db.prepare(`
            UPDATE social_reports
            SET status = 'actioned',
                updated_at = datetime('now')
            WHERE id = ?
          `).run(reportId);
        }
      });
      tx();

      return res.status(201).json(apiResponse({ success: true }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.get('/admin/moderation-actions', (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Admin role required' }));
    }
    const limit = parseLimit(req.query.limit, 30, 100);
    const cursor = decodeCursor(req.query.cursor);
    try {
      let whereCursor = '';
      const params = [];
      if (cursor) {
        whereCursor = `AND (ma.created_at < ? OR (ma.created_at = ? AND ma.id < ?))`;
        params.push(cursor.createdAt, cursor.createdAt, cursor.id);
      }
      params.push(limit + 1);
      const rows = db.prepare(`
        SELECT
          ma.id, ma.report_id, ma.target_user_id, ma.target_meetup_id, ma.action_type, ma.duration_hours,
          ma.action_note, ma.actor_user_id, ma.created_at,
          tu.name AS target_name, au.name AS actor_name, sm.title AS meetup_title
        FROM social_moderation_actions ma
        LEFT JOIN users tu ON tu.id = ma.target_user_id
        LEFT JOIN users au ON au.id = ma.actor_user_id
        LEFT JOIN social_meetups sm ON sm.id = ma.target_meetup_id
        WHERE 1 = 1
          ${whereCursor}
        ORDER BY ma.created_at DESC, ma.id DESC
        LIMIT ?
      `).all(...params);
      const hasMore = rows.length > limit;
      const trimmed = hasMore ? rows.slice(0, limit) : rows;
      const items = trimmed.map((row) => ({
        id: row.id,
        reportId: row.report_id || null,
        targetUserId: row.target_user_id || null,
        targetMeetupId: row.target_meetup_id || null,
        targetDisplayName: row.target_name || row.meetup_title || null,
        actionType: row.action_type,
        durationHours: row.duration_hours || null,
        actionNote: row.action_note || null,
        actorUserId: row.actor_user_id,
        actorDisplayName: row.actor_name || null,
        createdAt: toIso(row.created_at),
      }));
      const last = trimmed[trimmed.length - 1];
      const nextCursor = hasMore && last ? encodeCursor(String(last.created_at || '').replace('T', ' ').replace('Z', ''), last.id) : null;
      return res.json(apiResponse({ items, nextCursor }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.get('/admin/abuse-stats', (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Admin role required' }));
    }
    const hoursRaw = Number(req.query.hours);
    const hours = Number.isFinite(hoursRaw) ? Math.min(168, Math.max(1, Math.floor(hoursRaw))) : 24;
    const recentLimit = parseLimit(req.query.recent_limit, 50, 200);
    const maxRows = parseLimit(req.query.max_rows, 1000, 5000);
    const windowExpr = `-${hours} hours`;
    try {
      const rows = db.prepare(`
        SELECT id, event_key, event_type, fingerprint, created_at
        FROM social_abuse_events
        WHERE event_type = 'abuse_signal'
          AND created_at >= datetime('now', ?)
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      `).all(windowExpr, maxRows);

      const byCode = new Map();
      const byAction = new Map();
      const byRoute = new Map();
      const byUser = new Map();
      const recentEvents = [];

      for (const row of rows) {
        const payload = parseFingerprintPayload(row.fingerprint) || {};
        const keyParts = String(row.event_key || '').split(':');
        const code = payload.code || keyParts[0] || 'UNKNOWN';
        const action = payload.action || keyParts.slice(1).join(':') || 'unknown';
        const route = payload.route || 'unknown';
        const userId = payload.user_id || null;
        bumpCounter(byCode, code);
        bumpCounter(byAction, action);
        bumpCounter(byRoute, route);
        if (userId) {
          bumpCounter(byUser, userId);
        }
        if (recentEvents.length < recentLimit) {
          recentEvents.push({
            code,
            action,
            route,
            userId,
            retryAfterSeconds: payload.retry_after_seconds ?? null,
            details: payload.details ?? null,
            createdAt: toIso(row.created_at),
          });
        }
      }

      const rateLimitRows = db.prepare(`
        SELECT event_key, COUNT(1) AS cnt
        FROM social_abuse_events
        WHERE event_type = 'rate_limit'
          AND created_at >= datetime('now', ?)
        GROUP BY event_key
        ORDER BY cnt DESC, event_key ASC
        LIMIT 30
      `).all(windowExpr);

      const contentFingerprintRows = db.prepare(`
        SELECT event_key, COUNT(1) AS cnt
        FROM social_abuse_events
        WHERE event_type = 'content_fingerprint'
          AND created_at >= datetime('now', ?)
        GROUP BY event_key
        ORDER BY cnt DESC, event_key ASC
        LIMIT 30
      `).all(windowExpr);

      return res.json(apiResponse({
        windowHours: hours,
        sampledRows: rows.length,
        totals: {
          inWindow: rows.length,
          processLifetime: abuseCounters.total,
        },
        alerting: {
          windowMs: ABUSE_ALERT_WINDOW_MS,
          cooldownMs: ABUSE_ALERT_COOLDOWN_MS,
          thresholds: {
            total: ABUSE_ALERT_THRESHOLD_TOTAL,
            rateLimited: ABUSE_ALERT_THRESHOLD_RATE_LIMITED,
            spamDetected: ABUSE_ALERT_THRESHOLD_SPAM_DETECTED,
          },
          currentWindow: {
            startedAt: new Date(abuseAlertState.windowStartedAt).toISOString(),
            total: abuseAlertState.totalInWindow,
            rateLimited: abuseAlertState.rateLimitedInWindow,
            spamDetected: abuseAlertState.spamDetectedInWindow,
          },
        },
        breakdown: {
          byCode: mapToSortedCounts(byCode, 20),
          byAction: mapToSortedCounts(byAction, 20),
          byRoute: mapToSortedCounts(byRoute, 20),
          topUsers: mapToSortedCounts(byUser, 20),
        },
        processSinceStart: {
          byCode: mapToSortedCounts(abuseCounters.byCode, 20),
          byAction: mapToSortedCounts(abuseCounters.byAction, 20),
          byRoute: mapToSortedCounts(abuseCounters.byRoute, 20),
          topUsers: mapToSortedCounts(abuseCounters.byUser, 20),
          recent: abuseCounters.recent.slice(-20),
        },
        rawSignals: {
          rateLimitEventsByKey: rateLimitRows.map((row) => ({
            key: row.event_key,
            count: Number(row.cnt || 0),
          })),
          contentFingerprintsByKey: contentFingerprintRows.map((row) => ({
            key: row.event_key,
            count: Number(row.cnt || 0),
          })),
        },
        recentEvents,
      }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.get('/me/settings', (req, res) => {
    try {
      const row = db.prepare(`
        SELECT user_id, message_privacy, profile_visibility, dog_profile_visibility, is_messaging_enabled,
               messaging_muted_until, suspended_until, created_at, updated_at
        FROM social_users
        WHERE user_id = ?
      `).get(req.user.id);
      return res.json(apiResponse(row));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.put('/me/settings', (req, res) => {
    const allowedMessagePrivacy = new Set(['everyone', 'followers_only', 'nobody']);
    const allowedVisibility = new Set(['public', 'followers_only', 'private']);
    const patch = req.body || {};
    const nextMessagePrivacy = patch.message_privacy;
    const nextProfileVisibility = patch.profile_visibility;
    const nextDogProfileVisibility = patch.dog_profile_visibility;
    const nextMessagingEnabled = patch.is_messaging_enabled;

    if (nextMessagePrivacy != null && !allowedMessagePrivacy.has(String(nextMessagePrivacy))) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Invalid message_privacy value' }));
    }
    if (nextProfileVisibility != null && !allowedVisibility.has(String(nextProfileVisibility))) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Invalid profile_visibility value' }));
    }
    if (nextDogProfileVisibility != null && !allowedVisibility.has(String(nextDogProfileVisibility))) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Invalid dog_profile_visibility value' }));
    }
    if (nextMessagingEnabled != null && typeof nextMessagingEnabled !== 'boolean' && nextMessagingEnabled !== 0 && nextMessagingEnabled !== 1) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Invalid is_messaging_enabled value' }));
    }

    try {
      db.prepare(`
        UPDATE social_users
        SET message_privacy = COALESCE(?, message_privacy),
            profile_visibility = COALESCE(?, profile_visibility),
            dog_profile_visibility = COALESCE(?, dog_profile_visibility),
            is_messaging_enabled = COALESCE(?, is_messaging_enabled),
            updated_at = datetime('now')
        WHERE user_id = ?
      `).run(
        nextMessagePrivacy != null ? String(nextMessagePrivacy) : null,
        nextProfileVisibility != null ? String(nextProfileVisibility) : null,
        nextDogProfileVisibility != null ? String(nextDogProfileVisibility) : null,
        nextMessagingEnabled != null ? (nextMessagingEnabled ? 1 : 0) : null,
        req.user.id
      );

      const row = db.prepare(`
        SELECT user_id, message_privacy, profile_visibility, dog_profile_visibility, is_messaging_enabled,
               messaging_muted_until, suspended_until, created_at, updated_at
        FROM social_users
        WHERE user_id = ?
      `).get(req.user.id);
      return res.json(apiResponse(row));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.get('/notifications', (req, res) => {
    const limit = parseLimit(req.query.limit, 30, 100);
    const cursor = decodeCursor(req.query.cursor);
    const unreadOnly = String(req.query.unread_only || '').toLowerCase() === 'true';
    try {
      let whereCursor = '';
      const params = [req.user.id];
      if (unreadOnly) params.push(1);
      if (cursor) {
        whereCursor = `
          AND (
            n.created_at < ?
            OR (n.created_at = ? AND n.id < ?)
          )
        `;
        params.push(cursor.createdAt, cursor.createdAt, cursor.id);
      }
      params.push(limit + 1);
      const rows = db.prepare(`
        SELECT
          n.id, n.user_id, n.type, n.actor_user_id, n.object_type, n.object_id, n.payload_json, n.is_read, n.created_at,
          u.name AS actor_name, u.avatar_url AS actor_avatar_url
        FROM social_notifications n
        LEFT JOIN users u ON u.id = n.actor_user_id
        WHERE n.user_id = ?
          ${unreadOnly ? 'AND n.is_read = ?' : ''}
          ${whereCursor}
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT ?
      `).all(...params);
      const hasMore = rows.length > limit;
      const trimmed = hasMore ? rows.slice(0, limit) : rows;
      const items = trimmed.map((row) => ({
        id: row.id,
        type: row.type,
        userId: row.user_id,
        actorUserId: row.actor_user_id,
        actorDisplayName: row.actor_name || null,
        actorAvatarUrl: row.actor_avatar_url || null,
        objectType: row.object_type,
        objectId: row.object_id,
        payload: row.payload_json ? (() => {
          try { return JSON.parse(row.payload_json); } catch { return null; }
        })() : null,
        isRead: Boolean(row.is_read),
        createdAt: toIso(row.created_at),
      }));
      const last = trimmed[trimmed.length - 1];
      const nextCursor = hasMore && last ? encodeCursor(String(last.createdAt || '').replace('T', ' ').replace('Z', ''), last.id) : null;
      return res.json(apiResponse({ items, nextCursor }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.post('/notifications/read-all', (req, res) => {
    try {
      const result = db.prepare(`
        UPDATE social_notifications
        SET is_read = 1
        WHERE user_id = ?
          AND is_read = 0
      `).run(req.user.id);
      return res.json(apiResponse({ success: true, updated: Number(result.changes || 0) }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.post('/notifications/:id/read', (req, res) => {
    const notificationId = String(req.params.id || '').trim();
    if (!notificationId) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'notification id is required' }));
    }
    try {
      const result = db.prepare(`
        UPDATE social_notifications
        SET is_read = 1
        WHERE id = ?
          AND user_id = ?
      `).run(notificationId, req.user.id);
      if (result.changes === 0) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Notification not found' }));
      }
      return res.json(apiResponse({ success: true }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  router.get('/notifications/unread-count', (req, res) => {
    try {
      const row = db.prepare(`
        SELECT COUNT(1) AS unread_count
        FROM social_notifications
        WHERE user_id = ?
          AND is_read = 0
      `).get(req.user.id);
      return res.json(apiResponse({ unread_count: Number(row?.unread_count || 0) }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  // Unread badge bootstrap endpoint for app tab badges.
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

  // Lightweight health endpoint for incremental rollout validation.
  router.get('/_meta', (req, res) => {
    return res.json(apiResponse({
      feature: 'social',
      enabled: true,
      user_id: req.user.id,
      request_id: uuidv4(),
    }));
  });

  app.use('/api/v1/social', router);
}

module.exports = {
  registerSocialRoutes,
};
