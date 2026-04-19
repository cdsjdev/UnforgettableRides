-- 0017_social_moderation_meetup_actions_up.sql
-- Extend moderation actions to support meetup removals with audit linkage.
-- Depends on: 0016_social_meetup_notification_types_up.sql

CREATE TABLE IF NOT EXISTS social_moderation_actions_v2 (
  id               TEXT PRIMARY KEY,
  report_id        TEXT,
  target_user_id   TEXT,
  target_meetup_id TEXT,
  action_type      TEXT NOT NULL CHECK(action_type IN ('warn', 'mute', 'suspend', 'ban', 'remove_meetup')),
  duration_hours   INTEGER,
  action_note      TEXT,
  actor_user_id    TEXT NOT NULL,
  created_at       TEXT DEFAULT (datetime('now'))
);

INSERT INTO social_moderation_actions_v2
  (id, report_id, target_user_id, target_meetup_id, action_type, duration_hours, action_note, actor_user_id, created_at)
SELECT
  id,
  report_id,
  target_user_id,
  NULL AS target_meetup_id,
  action_type,
  duration_hours,
  action_note,
  actor_user_id,
  created_at
FROM social_moderation_actions;

DROP TABLE social_moderation_actions;
ALTER TABLE social_moderation_actions_v2 RENAME TO social_moderation_actions;

CREATE INDEX IF NOT EXISTS idx_social_actions_target_created
  ON social_moderation_actions(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_actions_target_meetup_created
  ON social_moderation_actions(target_meetup_id, created_at DESC);
