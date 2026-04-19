-- 0018_social_flagged_content_down.sql
-- SQLite cannot safely drop columns in-place; keep flagged columns.

DROP INDEX IF EXISTS idx_social_post_comments_flagged_post_created;
DROP INDEX IF EXISTS idx_social_posts_flagged_created;