-- 0010_social_down.sql
DROP INDEX IF EXISTS idx_social_actions_target_created;
DROP INDEX IF EXISTS idx_social_reports_target;
DROP INDEX IF EXISTS idx_social_reports_status_created;
DROP INDEX IF EXISTS idx_social_follows_followed_status_created;
DROP INDEX IF EXISTS idx_social_follows_follower_status_created;
DROP INDEX IF EXISTS idx_social_thread_members_user_thread;
DROP INDEX IF EXISTS idx_social_messages_thread_created;
DROP INDEX IF EXISTS idx_social_messages_thread_sender_client;

DROP TABLE IF EXISTS social_moderation_actions;
DROP TABLE IF EXISTS social_reports;
DROP TABLE IF EXISTS social_messages;
DROP TABLE IF EXISTS social_thread_members;
DROP TABLE IF EXISTS social_threads;
DROP TABLE IF EXISTS social_blocks;
DROP TABLE IF EXISTS social_follows;
DROP TABLE IF EXISTS social_users;
