-- 0010_social_up.sql
CREATE TABLE IF NOT EXISTS social_users (
  user_id TEXT PRIMARY KEY,
  message_privacy TEXT NOT NULL DEFAULT 'everyone' CHECK(message_privacy IN ('everyone', 'followers_only', 'nobody')),
  profile_visibility TEXT NOT NULL DEFAULT 'public' CHECK(profile_visibility IN ('public', 'followers_only', 'private')),
  dog_profile_visibility TEXT NOT NULL DEFAULT 'followers_only' CHECK(dog_profile_visibility IN ('public', 'followers_only', 'private')),
  is_messaging_enabled INTEGER NOT NULL DEFAULT 1,
  messaging_muted_until TEXT,
  suspended_until TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS social_follows (
  id TEXT PRIMARY KEY,
  follower_user_id TEXT NOT NULL,
  followed_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'requested')),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(follower_user_id, followed_user_id)
);

CREATE TABLE IF NOT EXISTS social_blocks (
  blocker_user_id TEXT NOT NULL,
  blocked_user_id TEXT NOT NULL,
  reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (blocker_user_id, blocked_user_id)
);

CREATE TABLE IF NOT EXISTS social_threads (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'direct' CHECK(type IN ('direct', 'group')),
  created_by TEXT NOT NULL,
  last_message_id TEXT,
  last_message_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS social_thread_members (
  thread_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member', 'owner')),
  last_read_message_id TEXT,
  last_read_at TEXT,
  is_muted INTEGER NOT NULL DEFAULT 0,
  is_hidden INTEGER NOT NULL DEFAULT 0,
  left_at TEXT,
  joined_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (thread_id, user_id)
);

CREATE TABLE IF NOT EXISTS social_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  sender_user_id TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK(message_type IN ('text', 'image', 'system')),
  body TEXT,
  media_url TEXT,
  client_msg_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  edited_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS social_reports (
  id TEXT PRIMARY KEY,
  reporter_user_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('user', 'message')),
  target_id TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'reviewed', 'actioned')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS social_moderation_actions (
  id TEXT PRIMARY KEY,
  report_id TEXT,
  target_user_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK(action_type IN ('warn', 'mute', 'suspend', 'ban')),
  duration_hours INTEGER,
  action_note TEXT,
  actor_user_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_messages_thread_sender_client
  ON social_messages(thread_id, sender_user_id, client_msg_id);
CREATE INDEX IF NOT EXISTS idx_social_messages_thread_created
  ON social_messages(thread_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_social_thread_members_user_thread
  ON social_thread_members(user_id, is_hidden, left_at, thread_id);
CREATE INDEX IF NOT EXISTS idx_social_follows_follower_status_created
  ON social_follows(follower_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_follows_followed_status_created
  ON social_follows(followed_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_reports_status_created
  ON social_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_reports_target
  ON social_reports(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_actions_target_created
  ON social_moderation_actions(target_user_id, created_at DESC);
