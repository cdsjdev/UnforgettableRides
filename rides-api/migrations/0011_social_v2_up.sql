-- 0011_social_v2_up.sql
-- Social V2: feed, notifications, typing, and extensions to V1 tables.
-- Depends on: 0010_social_up.sql

-- ---------------------------------------------------------------------------
-- New tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS social_posts (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  store_id      TEXT NOT NULL,
  content       TEXT NOT NULL CHECK(length(content) <= 2000),
  visibility    TEXT NOT NULL DEFAULT 'followers'
                CHECK(visibility IN ('public', 'followers', 'private')),
  like_count    INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at    TEXT NULL
);

CREATE TABLE IF NOT EXISTS social_post_media (
  id         TEXT PRIMARY KEY,
  -- Intentionally no ON DELETE CASCADE in V2 because posts are soft-deleted.
  -- If hard-delete cleanup is introduced in V3, add ON DELETE CASCADE (or explicit cleanup job).
  post_id    TEXT NOT NULL REFERENCES social_posts(id),
  media_url  TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image' CHECK(media_type IN ('image')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS social_post_likes (
  post_id    TEXT NOT NULL REFERENCES social_posts(id),
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS social_post_comments (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL REFERENCES social_posts(id),
  user_id    TEXT NOT NULL,
  content    TEXT NOT NULL CHECK(length(content) <= 500),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT NULL
);

CREATE TABLE IF NOT EXISTS social_notifications (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  type          TEXT NOT NULL
                CHECK(type IN ('like', 'comment', 'follow', 'follow_accepted', 'message')),
  actor_user_id TEXT NULL,
  object_type   TEXT NULL
                CHECK(object_type IN ('post', 'comment', 'thread', 'follow', NULL)),
  object_id     TEXT NULL,
  -- payload_json shape by type:
  --   like:            { "post_id": "...", "preview": "<first 80 chars>" }
  --   comment:         { "post_id": "...", "comment_id": "...", "preview": "..." }
  --   follow:          { "follower_id": "..." }
  --   follow_accepted: { "followed_id": "..." }
  --   message:         { "thread_id": "...", "preview": "..." }
  payload_json  TEXT NULL,
  is_read       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ephemeral typing presence. Rows older than 5s are ignored by the API.
CREATE TABLE IF NOT EXISTS social_typing (
  thread_id  TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (thread_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Extensions to V1 tables
-- ---------------------------------------------------------------------------

-- social_thread_members: add pin support (is_muted/is_hidden/left_at already in V1)
ALTER TABLE social_thread_members ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;

-- social_users: feed and comment privacy defaults
ALTER TABLE social_users ADD COLUMN feed_privacy TEXT NOT NULL DEFAULT 'followers'
  CHECK(feed_privacy IN ('public', 'followers', 'private'));
ALTER TABLE social_users ADD COLUMN comments_privacy TEXT NOT NULL DEFAULT 'followers'
  CHECK(comments_privacy IN ('everyone', 'followers', 'nobody'));

-- social_reports: expand target_type to cover posts and comments.
-- SQLite does not support ALTER TABLE ... MODIFY COLUMN, so we recreate the table.
CREATE TABLE IF NOT EXISTS social_reports_v2 (
  id                TEXT PRIMARY KEY,
  reporter_user_id  TEXT NOT NULL,
  target_type       TEXT NOT NULL
                    CHECK(target_type IN ('user', 'message', 'post', 'comment')),
  target_id         TEXT NOT NULL,
  reason_code       TEXT NOT NULL,
  details           TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending', 'reviewed', 'actioned')),
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now'))
);

INSERT INTO social_reports_v2
  SELECT id, reporter_user_id, target_type, target_id,
         reason_code, details, status, created_at, updated_at
  FROM social_reports;

DROP TABLE social_reports;

ALTER TABLE social_reports_v2 RENAME TO social_reports;

-- Recreate V1 indexes that were on social_reports (dropped with the table)
CREATE INDEX IF NOT EXISTS idx_social_reports_status_created
  ON social_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_reports_target
  ON social_reports(target_type, target_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- New indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_social_posts_user_created
  ON social_posts(user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_social_posts_store_created
  ON social_posts(store_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_social_post_comments_post_created
  ON social_post_comments(post_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_social_notifications_user_unread_created
  ON social_notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_typing_thread_updated
  ON social_typing(thread_id, updated_at DESC);
