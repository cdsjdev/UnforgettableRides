-- ============================================================
-- Migration 0019 rollback: drop the 7 new marketplace tables
-- ============================================================

DROP TABLE IF EXISTS payouts;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS quotes;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS car_availability;
DROP TABLE IF EXISTS car_images;
DROP TABLE IF EXISTS classic_cars;
