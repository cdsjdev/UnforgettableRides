-- 0013_social_v2_media_thumbnail_up.sql
-- Add thumbnail_url for media previews (video thumbnails).

ALTER TABLE social_post_media ADD COLUMN thumbnail_url TEXT;
