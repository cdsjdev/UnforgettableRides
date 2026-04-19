-- 0015_social_meetups_cover_up.sql
-- Add optional cover image to meetups.
-- Depends on: 0014_social_meetups_up.sql

ALTER TABLE social_meetups ADD COLUMN cover_image_url TEXT NULL;
