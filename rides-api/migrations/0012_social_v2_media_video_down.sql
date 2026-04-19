-- 0012_social_v2_media_video_down.sql
-- Revert social_post_media.media_type back to image-only.
-- WARNING: video rows are dropped on downgrade.

PRAGMA foreign_keys=off;

CREATE TABLE IF NOT EXISTS social_post_media_v1 (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL REFERENCES social_posts(id),
  media_url  TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image' CHECK(media_type IN ('image')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO social_post_media_v1 (id, post_id, media_url, media_type, sort_order, created_at)
SELECT id, post_id, media_url, media_type, sort_order, created_at
FROM social_post_media
WHERE media_type = 'image';

DROP TABLE social_post_media;
ALTER TABLE social_post_media_v1 RENAME TO social_post_media;

PRAGMA foreign_keys=on;
