-- 0014_social_meetups_down.sql
-- Roll back social meetups tables and indexes.

DROP INDEX IF EXISTS idx_social_meetup_reports_meetup_created;
DROP INDEX IF EXISTS idx_social_meetup_reports_status_created;
DROP INDEX IF EXISTS idx_social_meetup_attendees_meetup_status;
DROP INDEX IF EXISTS idx_social_meetup_attendees_user_status_updated;
DROP INDEX IF EXISTS idx_social_meetups_visibility_status_start;
DROP INDEX IF EXISTS idx_social_meetups_host_status_start;
DROP INDEX IF EXISTS idx_social_meetups_store_status_start;

DROP TABLE IF EXISTS social_meetup_reports;
DROP TABLE IF EXISTS social_meetup_attendees;
DROP TABLE IF EXISTS social_meetups;
