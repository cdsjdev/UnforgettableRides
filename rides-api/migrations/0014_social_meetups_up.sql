-- 0014_social_meetups_up.sql
-- Social V2 Phase 4: meetups and meetup-specific moderation/reporting.
-- Depends on: 0013_social_v2_media_thumbnail_up.sql

CREATE TABLE IF NOT EXISTS social_meetups (
  id             TEXT PRIMARY KEY,
  host_user_id   TEXT NOT NULL,
  store_id       TEXT NOT NULL,
  title          TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 120),
  description    TEXT NULL CHECK(description IS NULL OR length(description) <= 2000),
  location_text  TEXT NOT NULL CHECK(length(location_text) BETWEEN 2 AND 200),
  lat            REAL NULL,
  lng            REAL NULL,
  start_at       TEXT NOT NULL,
  end_at         TEXT NOT NULL,
  max_attendees  INTEGER NULL CHECK(max_attendees IS NULL OR max_attendees > 0),
  visibility     TEXT NOT NULL DEFAULT 'public'
                 CHECK(visibility IN ('public', 'followers', 'private')),
  status         TEXT NOT NULL DEFAULT 'scheduled'
                 CHECK(status IN ('scheduled', 'cancelled', 'completed')),
  cancel_reason  TEXT NULL,
  cancelled_at   TEXT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS social_meetup_attendees (
  meetup_id       TEXT NOT NULL REFERENCES social_meetups(id),
  user_id         TEXT NOT NULL,
  status          TEXT NOT NULL
                  CHECK(status IN ('going', 'requested', 'declined', 'left')),
  joined_at       TEXT NULL,
  left_at         TEXT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (meetup_id, user_id)
);

CREATE TABLE IF NOT EXISTS social_meetup_reports (
  id               TEXT PRIMARY KEY,
  reporter_user_id TEXT NOT NULL,
  meetup_id        TEXT NOT NULL REFERENCES social_meetups(id),
  reason_code      TEXT NOT NULL,
  details          TEXT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK(status IN ('pending', 'reviewed', 'actioned')),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_social_meetups_store_status_start
  ON social_meetups(store_id, status, start_at ASC);
CREATE INDEX IF NOT EXISTS idx_social_meetups_host_status_start
  ON social_meetups(host_user_id, status, start_at ASC);
CREATE INDEX IF NOT EXISTS idx_social_meetups_visibility_status_start
  ON social_meetups(visibility, status, start_at ASC);
CREATE INDEX IF NOT EXISTS idx_social_meetup_attendees_user_status_updated
  ON social_meetup_attendees(user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_meetup_attendees_meetup_status
  ON social_meetup_attendees(meetup_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_meetup_reports_status_created
  ON social_meetup_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_meetup_reports_meetup_created
  ON social_meetup_reports(meetup_id, created_at DESC);
