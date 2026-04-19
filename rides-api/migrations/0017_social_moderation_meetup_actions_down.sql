-- 0017_social_moderation_meetup_actions_down.sql
-- Revert moderation actions schema to pre-meetup-removal shape.

CREATE TABLE IF NOT EXISTS social_moderation_actions_v1 (
  id             TEXT PRIMARY KEY,
  report_id      TEXT,
  target_user_id TEXT NOT NULL,
  action_type    TEXT NOT NULL CHECK(action_type IN ('warn', 'mute', 'suspend', 'ban')),
  duration_hours INTEGER,
  action_note    TEXT,
  actor_user_id  TEXT NOT NULL,
  created_at     TEXT DEFAULT (datetime('now'))
);

INSERT INTO social_moderation_actions_v1
  (id, report_id, target_user_id, action_type, duration_hours, action_note, actor_user_id, created_at)
SELECT
  id,
  report_id,
  COALESCE(target_user_id, actor_user_id) AS target_user_id,
  CASE WHEN action_type = 'remove_meetup' THEN 'warn' ELSE action_type END AS action_type,
  duration_hours,
  action_note,
  actor_user_id,
  created_at
FROM social_moderation_actions;

DROP TABLE social_moderation_actions;
ALTER TABLE social_moderation_actions_v1 RENAME TO social_moderation_actions;

CREATE INDEX IF NOT EXISTS idx_social_actions_target_created
  ON social_moderation_actions(target_user_id, created_at DESC);
