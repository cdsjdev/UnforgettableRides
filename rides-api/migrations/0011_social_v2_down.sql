-- 0011_social_v2_down.sql
-- Rolls back 0011_social_v2_up.sql.
-- WARNING: drops all V2 social data (posts, likes, comments, notifications, typing).

-- ---------------------------------------------------------------------------
-- New indexes (drop before tables)
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS idx_social_posts_user_created;
DROP INDEX IF EXISTS idx_social_posts_store_created;
DROP INDEX IF EXISTS idx_social_post_comments_post_created;
DROP INDEX IF EXISTS idx_social_notifications_user_unread_created;
DROP INDEX IF EXISTS idx_social_typing_thread_updated;

-- ---------------------------------------------------------------------------
-- New tables
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS social_typing;
DROP TABLE IF EXISTS social_notifications;
DROP TABLE IF EXISTS social_post_comments;
DROP TABLE IF EXISTS social_post_likes;
DROP TABLE IF EXISTS social_post_media;
DROP TABLE IF EXISTS social_posts;

-- ---------------------------------------------------------------------------
-- Revert social_reports to V1 shape
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS social_reports_v1 (
  id                TEXT PRIMARY KEY,
  reporter_user_id  TEXT NOT NULL,
  target_type       TEXT NOT NULL CHECK(target_type IN ('user', 'message')),
  target_id         TEXT NOT NULL,
  reason_code       TEXT NOT NULL,
  details           TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending', 'reviewed', 'actioned')),
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now'))
);

-- Only migrate back rows with V1-compatible target_type values
INSERT INTO social_reports_v1
  SELECT id, reporter_user_id, target_type, target_id,
         reason_code, details, status, created_at, updated_at
  FROM social_reports
  WHERE target_type IN ('user', 'message');

DROP TABLE social_reports;

ALTER TABLE social_reports_v1 RENAME TO social_reports;

-- Restore V1 indexes on social_reports
CREATE INDEX IF NOT EXISTS idx_social_reports_status_created
  ON social_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_reports_target
  ON social_reports(target_type, target_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Revert social_users columns
-- SQLite does not support DROP COLUMN before v3.35; recreate without V2 columns.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS social_users_v1 (
  user_id                 TEXT PRIMARY KEY,
  message_privacy         TEXT NOT NULL DEFAULT 'everyone'
                          CHECK(message_privacy IN ('everyone', 'followers_only', 'nobody')),
  profile_visibility      TEXT NOT NULL DEFAULT 'public'
                          CHECK(profile_visibility IN ('public', 'followers_only', 'private')),
  dog_profile_visibility  TEXT NOT NULL DEFAULT 'followers_only'
                          CHECK(dog_profile_visibility IN ('public', 'followers_only', 'private')),
  is_messaging_enabled    INTEGER NOT NULL DEFAULT 1,
  messaging_muted_until   TEXT,
  suspended_until         TEXT,
  created_at              TEXT DEFAULT (datetime('now')),
  updated_at              TEXT DEFAULT (datetime('now'))
);

INSERT INTO social_users_v1
  SELECT user_id, message_privacy, profile_visibility, dog_profile_visibility,
         is_messaging_enabled, messaging_muted_until, suspended_until,
         created_at, updated_at
  FROM social_users;

DROP TABLE social_users;

ALTER TABLE social_users_v1 RENAME TO social_users;

-- ---------------------------------------------------------------------------
-- Revert social_thread_members: remove is_pinned column (recreate without it)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS social_thread_members_v1 (
  thread_id           TEXT NOT NULL,
  user_id             TEXT NOT NULL,
  role                TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member', 'owner')),
  last_read_message_id TEXT,
  last_read_at        TEXT,
  is_muted            INTEGER NOT NULL DEFAULT 0,
  is_hidden           INTEGER NOT NULL DEFAULT 0,
  left_at             TEXT,
  joined_at           TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (thread_id, user_id)
);

INSERT INTO social_thread_members_v1
  SELECT thread_id, user_id, role, last_read_message_id, last_read_at,
         is_muted, is_hidden, left_at, joined_at
  FROM social_thread_members;

DROP TABLE social_thread_members;

ALTER TABLE social_thread_members_v1 RENAME TO social_thread_members;

-- Restore V1 index on social_thread_members
CREATE INDEX IF NOT EXISTS idx_social_thread_members_user_thread
  ON social_thread_members(user_id, is_hidden, left_at, thread_id);
