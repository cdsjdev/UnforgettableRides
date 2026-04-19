DROP INDEX IF EXISTS idx_social_notifications_user_unread_created;

ALTER TABLE social_notifications RENAME TO social_notifications_old;

CREATE TABLE social_notifications (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  type          TEXT NOT NULL
                CHECK(type IN (
                  'like',
                  'comment',
                  'follow',
                  'follow_accepted',
                  'message',
                  'meetup_request_received',
                  'meetup_request_approved',
                  'meetup_request_rejected',
                  'meetup_attendee_joined',
                  'meetup_cancelled'
                )),
  actor_user_id TEXT NULL,
  object_type   TEXT NULL
                CHECK(object_type IS NULL OR object_type IN ('post', 'comment', 'thread', 'follow', 'meetup')),
  object_id     TEXT NULL,
  payload_json  TEXT NULL,
  is_read       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO social_notifications (id, user_id, type, actor_user_id, object_type, object_id, payload_json, is_read, created_at)
SELECT id, user_id, type, actor_user_id, object_type, object_id, payload_json, is_read, created_at
FROM social_notifications_old;

DROP TABLE social_notifications_old;

CREATE INDEX IF NOT EXISTS idx_social_notifications_user_unread_created
  ON social_notifications(user_id, is_read, created_at DESC);