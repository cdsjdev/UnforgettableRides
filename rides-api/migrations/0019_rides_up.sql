-- ============================================================
-- Migration 0019: Drop pet/ML/social-feed/commerce/appointment
-- tables and create classic car hire marketplace tables.
-- ============================================================

-- ── Dog domain ────────────────────────────────────────────────
DROP TABLE IF EXISTS dogs;
DROP TABLE IF EXISTS dog_photos;
DROP TABLE IF EXISTS wash_records;
DROP TABLE IF EXISTS care_logs;
DROP TABLE IF EXISTS breed_predictions;
DROP TABLE IF EXISTS weight_entries;
DROP TABLE IF EXISTS vaccinations;
DROP TABLE IF EXISTS medications;
DROP TABLE IF EXISTS grooming_preferences;
DROP TABLE IF EXISTS wash_cycles;

-- ── ML analytics ──────────────────────────────────────────────
DROP TABLE IF EXISTS dog_detections;
DROP TABLE IF EXISTS dog_entries;
DROP TABLE IF EXISTS analytics_trigger_frames;
DROP TABLE IF EXISTS dog_track_events;
DROP TABLE IF EXISTS analytics_validation_snapshots;

-- ── RAG / advisor ─────────────────────────────────────────────
DROP TABLE IF EXISTS advisor_knowledge_docs;
DROP TABLE IF EXISTS advisor_knowledge_chunks;

-- ── Social feed (keep threads/messages tables) ────────────────
DROP TABLE IF EXISTS social_posts;
DROP TABLE IF EXISTS social_post_media;
DROP TABLE IF EXISTS social_comments;
DROP TABLE IF EXISTS social_likes;
DROP TABLE IF EXISTS social_follows;
DROP TABLE IF EXISTS social_meetups;
DROP TABLE IF EXISTS social_meetup_attendees;
DROP TABLE IF EXISTS social_notifications;

-- ── Business membership ───────────────────────────────────────
DROP TABLE IF EXISTS business_membership_applications;
DROP TABLE IF EXISTS business_memberships;
DROP TABLE IF EXISTS business_membership_plans;
DROP TABLE IF EXISTS store_promotions;
DROP TABLE IF EXISTS user_coupons;

-- ── Physical stores ───────────────────────────────────────────
DROP TABLE IF EXISTS store_services;
DROP TABLE IF EXISTS store_settings_by_store;
DROP TABLE IF EXISTS stores;
DROP TABLE IF EXISTS user_store_links;

-- ── E-commerce ────────────────────────────────────────────────
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS products;

-- ── Old appointments ──────────────────────────────────────────
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS appointment_charges;
DROP TABLE IF EXISTS appointment_deposits;
DROP TABLE IF EXISTS appointment_deposit_payments;

-- ============================================================
-- New tables for classic car hire marketplace
-- ============================================================

CREATE TABLE IF NOT EXISTS classic_cars (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL,
  color TEXT NOT NULL,
  description TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  price_per_hour_cents INTEGER,
  price_per_day_cents INTEGER,
  location TEXT,
  latitude REAL,
  longitude REAL,
  available_for_hire INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS car_images (
  id TEXT PRIMARY KEY,
  car_id TEXT NOT NULL REFERENCES classic_cars(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS car_availability (
  id TEXT PRIMARY KEY,
  car_id TEXT NOT NULL REFERENCES classic_cars(id) ON DELETE CASCADE,
  blocked_date TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  car_id TEXT NOT NULL REFERENCES classic_cars(id),
  customer_id TEXT NOT NULL REFERENCES users(id),
  event_type TEXT NOT NULL,
  event_date TEXT NOT NULL,
  duration_hours REAL,
  duration_days INTEGER,
  pickup_location TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  total_price_cents INTEGER,
  price_breakdown TEXT,
  stripe_payment_intent_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  car_id TEXT NOT NULL REFERENCES classic_cars(id),
  customer_id TEXT NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  proposed_price_cents INTEGER,
  event_type TEXT,
  event_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  car_id TEXT NOT NULL REFERENCES classic_cars(id),
  booking_id TEXT REFERENCES bookings(id),
  reviewer_id TEXT NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  text TEXT,
  photo_urls TEXT DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  period_start TEXT,
  period_end TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  stripe_transfer_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Indexes ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_classic_cars_owner ON classic_cars(owner_id, is_active);
CREATE INDEX IF NOT EXISTS idx_classic_cars_active ON classic_cars(is_active, available_for_hire);
CREATE INDEX IF NOT EXISTS idx_classic_cars_make ON classic_cars(make, year);
CREATE INDEX IF NOT EXISTS idx_classic_cars_location ON classic_cars(location);

CREATE INDEX IF NOT EXISTS idx_car_images_car ON car_images(car_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_car_images_primary ON car_images(car_id, is_primary);

CREATE INDEX IF NOT EXISTS idx_car_availability_car ON car_availability(car_id, blocked_date);

CREATE INDEX IF NOT EXISTS idx_bookings_car ON bookings(car_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_event_date ON bookings(event_date);

CREATE INDEX IF NOT EXISTS idx_quotes_car ON quotes(car_id, status);
CREATE INDEX IF NOT EXISTS idx_quotes_customer ON quotes(customer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reviews_car ON reviews(car_id, is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON reviews(reviewer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_booking ON reviews(booking_id);

CREATE INDEX IF NOT EXISTS idx_payouts_owner ON payouts(owner_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status, created_at DESC);
