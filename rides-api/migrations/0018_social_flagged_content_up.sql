-- 0018_social_flagged_content_up.sql
-- Add flagged-content lifecycle fields for auto-moderation on posts/comments.

ALTER TABLE social_posts ADD COLUMN flagged_at TEXT NULL;
ALTER TABLE social_posts ADD COLUMN flagged_reason_code TEXT NULL;
ALTER TABLE social_posts ADD COLUMN flagged_report_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE social_post_comments ADD COLUMN flagged_at TEXT NULL;
ALTER TABLE social_post_comments ADD COLUMN flagged_reason_code TEXT NULL;
ALTER TABLE social_post_comments ADD COLUMN flagged_report_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_social_posts_flagged_created
  ON social_posts(flagged_at, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_social_post_comments_flagged_post_created
  ON social_post_comments(flagged_at, post_id, created_at DESC)
  WHERE deleted_at IS NULL;