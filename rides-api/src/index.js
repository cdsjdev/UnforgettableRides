const dotenv = require('dotenv');
dotenv.config();
dotenv.config({ path: require('path').resolve(__dirname, '../../.env.local'), override: true });
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const { version: API_VERSION } = require('../package.json');
const QRCode = require('qrcode');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');
const fs = require('fs');
const nodeCrypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { registerPaymentsRoutes } = require('./routes/payments');
const { registerAnalyticsRoutes } = require('./routes/analytics');
const { registerAuthRoutes } = require('./routes/auth');
const { registerCarsRoutes } = require('./routes/cars');
const { registerBookingsRoutes } = require('./routes/bookings');
const { registerQuotesRoutes } = require('./routes/quotes');
const { registerPayoutsRoutes } = require('./routes/payouts');
const { registerMessagingRoutes } = require('./routes/messaging');

const Database = require('better-sqlite3');

const app = express();

// Trust reverse proxy only when explicitly configured (prevents X-Forwarded-For spoofing)
// TRUST_PROXY=true|1 ? trust first hop; TRUST_PROXY=loopback ? trust loopback; unset/false/0 ? disabled
const _trustProxy = (process.env.TRUST_PROXY || '').trim().toLowerCase();
if (_trustProxy && _trustProxy !== 'false' && _trustProxy !== '0') {
  // 'true' or pure digits ? numeric hop count; otherwise pass as subnet/string rule
  const numVal = parseInt(_trustProxy, 10);
  app.set('trust proxy', _trustProxy === 'true' ? 1 : (!isNaN(numVal) && String(numVal) === _trustProxy) ? numVal : _trustProxy);
}

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const API_BUILD_NUMBER = process.env.BUILD_NUMBER || process.env.RELEASE_NUMBER || process.env.RELEASE_VERSION || API_VERSION;
const API_BUILD_DATE = process.env.BUILD_DATE || process.env.RELEASE_DATE || 'unknown';
const rawApiBuildSha = process.env.GIT_SHA || process.env.COMMIT_SHA || 'unknown';
const API_BUILD_SHA = rawApiBuildSha === 'unknown' ? rawApiBuildSha : rawApiBuildSha.slice(0, 7);

const EMAIL_NOTIFICATION_WEBHOOK_URL = process.env.EMAIL_NOTIFICATION_WEBHOOK_URL || '';
const SMS_NOTIFICATION_WEBHOOK_URL = process.env.SMS_NOTIFICATION_WEBHOOK_URL || '';
const SMTP_HOST = String(process.env.SMTP_HOST || '').trim();
const SMTP_USER = String(process.env.SMTP_USER || '').trim();
const SMTP_PASS = String(process.env.SMTP_PASS || '').trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USE_TLS = String(process.env.SMTP_USE_TLS || 'true').toLowerCase() === 'true';
const SMTP_USE_SSL = String(process.env.SMTP_USE_SSL || 'false').toLowerCase() === 'true';
const EMAIL_FROM_ADDRESS = String(process.env.EMAIL_FROM_ADDRESS || SMTP_USER || '').trim();
const EMAIL_FROM_NAME = String(process.env.EMAIL_FROM_NAME || 'UnforgettableRides').trim();
const SETTINGS_ENCRYPTION_KEY_SOURCE = String(process.env.SETTINGS_ENCRYPTION_KEY || process.env.JWT_SECRET || process.env.INTERNAL_API_KEY || 'rides-dev-settings-key');
const EMAIL_DELIVERY_CONFIGURED = Boolean(
  EMAIL_NOTIFICATION_WEBHOOK_URL || (SMTP_HOST && SMTP_USER && SMTP_PASS)
);
const parsedAuthCodeExpiresMin = Number(process.env.AUTH_CODE_EXPIRES_MIN);
const AUTH_CODE_EXPIRES_MIN = Number.isFinite(parsedAuthCodeExpiresMin) && parsedAuthCodeExpiresMin > 0
  ? parsedAuthCodeExpiresMin
  : 10;
const parsedAuthCodeMaxAttempts = Number(process.env.AUTH_CODE_MAX_ATTEMPTS);
const AUTH_CODE_MAX_ATTEMPTS = Number.isFinite(parsedAuthCodeMaxAttempts) && parsedAuthCodeMaxAttempts > 0
  ? Math.floor(parsedAuthCodeMaxAttempts)
  : 5;
const parsedDeviceTrustDays = Number(process.env.DEVICE_TRUST_DAYS);
const DEVICE_TRUST_DAYS = Number.isFinite(parsedDeviceTrustDays) && parsedDeviceTrustDays > 0
  ? parsedDeviceTrustDays
  : 45;
const AUTH_DEVICE_CHALLENGE_ENABLED_DEFAULT = String(process.env.AUTH_DEVICE_CHALLENGE_ENABLED || 'true').toLowerCase() === 'true';
const AUTH_REQUIRE_VERIFIED_FOR_SENSITIVE = String(process.env.AUTH_REQUIRE_VERIFIED_FOR_SENSITIVE || 'false').toLowerCase() === 'true';

// Payment configuration
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const PAYMENT_CURRENCY = (process.env.PAYMENT_CURRENCY || 'usd').toLowerCase();
const SALES_TAX_RATE = Math.max(0, parseFloat(process.env.SALES_TAX_RATE || '0') || 0);
const stripe = STRIPE_SECRET_KEY ? require('stripe')(STRIPE_SECRET_KEY) : null;
if (!EMAIL_DELIVERY_CONFIGURED && NODE_ENV !== 'test') {
  console.warn('[TODO][TEMP] Email delivery is not configured. Verification/password emails will not be delivered until webhook or SMTP is set.');
}

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max per file
    files: 5, // Max 5 files
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

// Middleware
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : undefined;
app.use(cors(allowedOrigins ? {
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    const corsError = new Error('Not allowed by CORS');
    corsError.status = 403;
    corsError.code = 'CORS_FORBIDDEN';
    cb(corsError);
  },
  credentials: true,
} : undefined));
// Stripe webhook needs raw body ? must be before JSON parser
app.use('/api/v1/payments/webhook', bodyParser.raw({ type: 'application/json' }));
app.use(bodyParser.json({ limit: '2mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '2mb' }));

// -- Rate limiter (in-memory sliding window) ----------------------------------
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000); // 15 minutes
const RATE_LIMIT_MAX_LOGIN = Number(process.env.RATE_LIMIT_MAX_LOGIN || 10);              // max login attempts per IP per window
const RATE_LIMIT_MAX_SIGNUP = Number(process.env.RATE_LIMIT_MAX_SIGNUP || 5);             // max signup attempts per IP per window
const rateLimitStore = new Map(); // key ? { count, resetAt }

function rateLimit(key, max, options = {}) {
  const { peek = false, reset = false } = options || {};
  if (reset) {
    rateLimitStore.delete(key);
    return null;
  }
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  if (!entry || now > entry.resetAt) {
    if (!peek) {
      rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    }
    return null;
  }
  if (peek) {
    if (entry.count >= max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      return retryAfter;
    }
    return null;
  }
  entry.count++;
  if (entry.count > max) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return retryAfter;
  }
  return null;
}

// Cleanup stale entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(key);
  }
}, 10 * 60 * 1000).unref();

// Serve uploaded images as static files
app.use('/uploads', express.static(uploadsDir));

// Configure disk storage for profile photo uploads
const profilePhotoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `photo-${uuidv4()}${ext}`);
  },
});

const profileUpload = multer({
  storage: profilePhotoStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

function datetimeUtcIsoOffset(days = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

// ============================================================================
// SQLite Database
// ============================================================================

const analyticsDbPath = process.env.ANALYTICS_DB_PATH || path.join(__dirname, 'data', 'analytics.db');
const db = new Database(analyticsDbPath);

// Enable WAL mode for better concurrent read/write performance
db.pragma('journal_mode = WAL');

// Create base tables
db.exec(`
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    stripe_payment_intent_id TEXT UNIQUE,
    provider TEXT DEFAULT 'stripe',
    provider_payment_id TEXT,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    status TEXT NOT NULL DEFAULT 'pending',
    payment_method TEXT,
    receipt_url TEXT,
    failure_reason TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_payments_stripe_pi ON payments(stripe_payment_intent_id);
  CREATE INDEX IF NOT EXISTS idx_payments_provider_payment_id ON payments(provider_payment_id);

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    phone_number TEXT,
    avatar_url TEXT,
    default_shipping_address TEXT,
    notification_email_enabled INTEGER NOT NULL DEFAULT 1,
    notification_sms_enabled INTEGER NOT NULL DEFAULT 0,
    role TEXT NOT NULL DEFAULT 'customer',
    store_id TEXT,
    email_verified_at TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

  CREATE TABLE IF NOT EXISTS user_shipping_addresses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    label TEXT,
    recipient_name TEXT NOT NULL,
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    country TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_user_shipping_addresses_user ON user_shipping_addresses(user_id, is_default DESC, updated_at DESC);

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens(expires_at);

  CREATE TABLE IF NOT EXISTS email_verification_codes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    purpose TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    metadata_json TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_email_verification_user_purpose ON email_verification_codes(user_id, purpose, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_email_verification_expires ON email_verification_codes(expires_at);

  CREATE TABLE IF NOT EXISTS trusted_devices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    device_fingerprint TEXT NOT NULL,
    label TEXT,
    first_seen_ip TEXT,
    last_seen_ip TEXT,
    last_seen_user_agent TEXT,
    verified_at TEXT NOT NULL,
    expires_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    last_seen_at TEXT DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_trusted_devices_user_fingerprint ON trusted_devices(user_id, device_fingerprint);
  CREATE INDEX IF NOT EXISTS idx_trusted_devices_expires ON trusted_devices(expires_at);

  CREATE TABLE IF NOT EXISTS store_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS store_settings_by_store (
    store_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (store_id, key)
  );

  CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    timezone TEXT DEFAULT 'America/Los_Angeles',
    is_active INTEGER DEFAULT 1,
    settings_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_store_links (
    user_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, store_id)
  );
  CREATE INDEX IF NOT EXISTS idx_user_store_links_user ON user_store_links(user_id, is_active);
  CREATE INDEX IF NOT EXISTS idx_user_store_links_store ON user_store_links(store_id, is_active);

  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'reviewed', 'resolved')),
    admin_note TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_feedback_status_created ON feedback(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_feedback_user_created ON feedback(user_id, created_at DESC);
`);

// Legacy payment tables kept for backward compat with payments routes
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    customer_email TEXT,
    status TEXT DEFAULT 'pending',
    subtotal REAL,
    discount_amount REAL DEFAULT 0,
    discount_reason TEXT,
    business_membership_id TEXT,
    points_awarded INTEGER DEFAULT 0,
    total REAL NOT NULL,
    tax_amount REAL DEFAULT 0,
    notes TEXT,
    shipping_address TEXT,
    store_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    pack_option_id TEXT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'other',
    price REAL NOT NULL,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    image_url TEXT,
    image_urls TEXT,
    pack_options TEXT,
    is_active INTEGER DEFAULT 1,
    store_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
  CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
  CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    phone_number TEXT,
    avatar_url TEXT,
    default_shipping_address TEXT,
    notification_email_enabled INTEGER NOT NULL DEFAULT 1,
    notification_sms_enabled INTEGER NOT NULL DEFAULT 0,
    role TEXT NOT NULL DEFAULT 'staff',
    store_id TEXT,
    email_verified_at TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

  CREATE TABLE IF NOT EXISTS user_shipping_addresses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    label TEXT,
    recipient_name TEXT NOT NULL,
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    country TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_user_shipping_addresses_user ON user_shipping_addresses(user_id, is_default DESC, updated_at DESC);

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens(expires_at);

  CREATE TABLE IF NOT EXISTS email_verification_codes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    purpose TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    metadata_json TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_email_verification_user_purpose ON email_verification_codes(user_id, purpose, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_email_verification_expires ON email_verification_codes(expires_at);

  CREATE TABLE IF NOT EXISTS trusted_devices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    device_fingerprint TEXT NOT NULL,
    label TEXT,
    first_seen_ip TEXT,
    last_seen_ip TEXT,
    last_seen_user_agent TEXT,
    verified_at TEXT NOT NULL,
    expires_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    last_seen_at TEXT DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_trusted_devices_user_fingerprint ON trusted_devices(user_id, device_fingerprint);
  CREATE INDEX IF NOT EXISTS idx_trusted_devices_expires ON trusted_devices(expires_at);

  CREATE TABLE IF NOT EXISTS store_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Per-store settings overrides (falls back to global store_settings)
  CREATE TABLE IF NOT EXISTS store_settings_by_store (
    store_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (store_id, key)
  );

  -- Multi-store foundation (Phase A groundwork)
  CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    timezone TEXT DEFAULT 'Asia/Taipei',
    is_active INTEGER DEFAULT 1,
    settings_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_store_links (
    user_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, store_id)
  );
  CREATE INDEX IF NOT EXISTS idx_user_store_links_user ON user_store_links(user_id, is_active);
  CREATE INDEX IF NOT EXISTS idx_user_store_links_store ON user_store_links(store_id, is_active);

  CREATE TABLE IF NOT EXISTS business_memberships (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    code TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    discount_percent REAL NOT NULL DEFAULT 0,
    max_discount_amount REAL NOT NULL DEFAULT 0,
    monthly_usage_limit INTEGER NOT NULL DEFAULT 10,
    points_multiplier_referral REAL NOT NULL DEFAULT 1.0,
    points_multiplier_self REAL NOT NULL DEFAULT 0.3,
    starts_at TEXT,
    ends_at TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    points_balance INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS business_member_applications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    applicant_name TEXT NOT NULL,
    applicant_phone TEXT,
    shop_name TEXT,
    city TEXT,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    reviewed_by_user_id TEXT,
    review_note TEXT,
    reviewed_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS customer_business_links (
    id TEXT PRIMARY KEY,
    customer_user_id TEXT NOT NULL,
    business_membership_id TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    linked_at TEXT DEFAULT (datetime('now')),
    unlinked_at TEXT,
    linked_by_user_id TEXT,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS business_points_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_membership_id TEXT NOT NULL,
    customer_user_id TEXT,
    order_id TEXT,
    appointment_charge_id TEXT,
    source_type TEXT NOT NULL,
    points_delta INTEGER NOT NULL,
    memo TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS service_prices (
    id TEXT PRIMARY KEY,
    service_type TEXT UNIQUE NOT NULL,
    base_price REAL NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Store-level service catalog (extends legacy flat service_price_* settings)
  CREATE TABLE IF NOT EXISTS store_services (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL,
    service_type TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    base_price_cents INTEGER,
    member_price_cents INTEGER,
    price_on_assessment INTEGER NOT NULL DEFAULT 0,
    size_variants_json TEXT NOT NULL DEFAULT '[]',
    duration_minutes INTEGER,
    requires_prior_session INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS store_membership_plans (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price_monthly_cents INTEGER NOT NULL,
    price_yearly_cents INTEGER,
    included_service_types_json TEXT NOT NULL DEFAULT '[]',
    perks_json TEXT NOT NULL DEFAULT '[]',
    is_highlighted INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_memberships (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    dog_id TEXT,
    store_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'cancelled', 'expired')),
    started_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS store_promotions (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL CHECK(type IN ('pct_off', 'fixed_off', 'free_service', 'info')),
    discount_percent INTEGER,
    discount_value_cents INTEGER,
    max_discount_cents INTEGER,
    applies_to_service_ids_json TEXT NOT NULL DEFAULT '[]',
    eligibility TEXT NOT NULL DEFAULT 'all' CHECK(eligibility IN ('all', 'members_only', 'new_customers')),
    coupon_code TEXT,
    is_stackable INTEGER NOT NULL DEFAULT 0,
    priority INTEGER NOT NULL DEFAULT 0,
    usage_limit_total INTEGER,
    usage_limit_per_user INTEGER,
    valid_from TEXT NOT NULL,
    valid_until TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_coupons (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    promotion_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
    coupon_code TEXT,
    claimed_at TEXT DEFAULT (datetime('now')),
    used_at TEXT,
    expires_at TEXT,
    status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available', 'used', 'expired')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS appointment_charges (
    id TEXT PRIMARY KEY,
    appointment_id TEXT UNIQUE NOT NULL,
    user_id TEXT,
    business_membership_id TEXT,
    service_type TEXT NOT NULL,
    base_price REAL NOT NULL,
    discount_amount REAL NOT NULL DEFAULT 0,
    final_price REAL NOT NULL,
    points_awarded INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'charged',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS advisor_knowledge_docs (
    id TEXT PRIMARY KEY,
    store_id TEXT,
    title TEXT NOT NULL,
    source TEXT,
    content TEXT NOT NULL,
    metadata_json TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS advisor_knowledge_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    content_lower TEXT NOT NULL,
    token_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (doc_id) REFERENCES advisor_knowledge_docs(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'reviewed', 'resolved')),
    admin_note TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_business_memberships_code ON business_memberships(code);
  CREATE INDEX IF NOT EXISTS idx_business_member_applications_status ON business_member_applications(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_business_member_applications_user ON business_member_applications(user_id, created_at);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_business_member_applications_one_pending
    ON business_member_applications(user_id) WHERE status = 'pending';
  CREATE INDEX IF NOT EXISTS idx_customer_business_links_customer ON customer_business_links(customer_user_id, is_active);
  CREATE INDEX IF NOT EXISTS idx_customer_business_links_member ON customer_business_links(business_membership_id, is_active);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_business_links_one_active ON customer_business_links(customer_user_id) WHERE is_active = 1;
  CREATE INDEX IF NOT EXISTS idx_business_points_ledger_member ON business_points_ledger(business_membership_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_appointment_charges_appointment ON appointment_charges(appointment_id);
  CREATE INDEX IF NOT EXISTS idx_feedback_status_created ON feedback(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_feedback_user_created ON feedback(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_advisor_knowledge_docs_active ON advisor_knowledge_docs(is_active, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_advisor_knowledge_chunks_doc_idx ON advisor_knowledge_chunks(doc_id, chunk_index);
  CREATE INDEX IF NOT EXISTS idx_store_services_store_active ON store_services(store_id, is_active, sort_order);
  CREATE INDEX IF NOT EXISTS idx_store_membership_plans_store_active ON store_membership_plans(store_id, is_active, sort_order);
  CREATE INDEX IF NOT EXISTS idx_user_memberships_user_store_status ON user_memberships(user_id, store_id, status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_user_memberships_dog_store_status ON user_memberships(dog_id, store_id, status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_store_promotions_store_active_window ON store_promotions(store_id, is_active, valid_from, valid_until, priority DESC);
  CREATE INDEX IF NOT EXISTS idx_user_coupons_user_store_status ON user_coupons(user_id, store_id, status, claimed_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_user_coupons_unique_claim ON user_coupons(user_id, promotion_id);
`);

function runSqlMigrations() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  if (!fs.existsSync(migrationsDir)) {
    return;
  }

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((name) => /^\d+_.*_up\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b));

  const isAppliedStmt = db.prepare('SELECT 1 FROM schema_migrations WHERE filename = ?');
  const markAppliedStmt = db.prepare('INSERT INTO schema_migrations (filename, applied_at) VALUES (?, datetime(\'now\'))');

  for (const filename of migrationFiles) {
    const alreadyApplied = isAppliedStmt.get(filename);
    if (alreadyApplied) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
    const applyMigration = db.transaction(() => {
      db.exec(sql);
      markAppliedStmt.run(filename);
    });
    applyMigration();
    console.log(`[db:migrations] applied ${filename}`);
  }
}

runSqlMigrations();

// Seed default store settings if empty
const settingsCount = db.prepare('SELECT COUNT(*) as count FROM store_settings').get().count;
if (settingsCount === 0) {
  const defaultSettings = {
    store_open_hour: '9',
    store_close_hour: '18',
    max_concurrent_appointments: '3',
    appointment_slot_minutes: '30',
    store_name: 'UnforgettableRides',
    store_phone: '',
    store_address: '',
  };
  const insertSetting = db.prepare('INSERT OR IGNORE INTO store_settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(defaultSettings)) {
    insertSetting.run(k, v);
  }
}

// Legacy store/link seeds — skipped (tables removed in migration 0019)

// Migrate existing databases: add user_id columns if missing
try { db.prepare('ALTER TABLE orders ADD COLUMN user_id TEXT').run(); } catch (e) { /* column already exists */ }
try { db.prepare('ALTER TABLE appointments ADD COLUMN user_id TEXT').run(); } catch (e) { /* column already exists */ }
try { db.prepare('ALTER TABLE appointments ADD COLUMN customer_email TEXT').run(); } catch (e) { /* column already exists */ }

// Multi-store migration: add store_id columns (nullable — single-store remains default)
try { db.prepare('ALTER TABLE appointments ADD COLUMN store_id TEXT').run(); } catch (e) { /* exists */ }
try { db.prepare('ALTER TABLE orders ADD COLUMN store_id TEXT').run(); } catch (e) { /* exists */ }
try { db.prepare('ALTER TABLE products ADD COLUMN store_id TEXT').run(); } catch (e) { /* exists */ }
try { db.prepare('ALTER TABLE products ADD COLUMN image_urls TEXT').run(); } catch (e) { /* exists */ }
try { db.prepare('ALTER TABLE products ADD COLUMN pack_options TEXT').run(); } catch (e) { /* exists */ }
try { db.prepare('ALTER TABLE order_items ADD COLUMN pack_option_id TEXT').run(); } catch (e) { /* exists */ }
try { db.prepare('ALTER TABLE dog_detections ADD COLUMN store_id TEXT').run(); } catch (e) { /* exists */ }
try { db.prepare('ALTER TABLE dog_entries ADD COLUMN store_id TEXT').run(); } catch (e) { /* exists */ }
try { db.prepare('ALTER TABLE dog_track_events ADD COLUMN store_id TEXT').run(); } catch (e) { /* exists */ }
try { db.prepare('CREATE INDEX IF NOT EXISTS idx_detections_store ON dog_detections(store_id, timestamp)').run(); } catch (e) { /* exists */ }
try { db.prepare('CREATE INDEX IF NOT EXISTS idx_entries_store ON dog_entries(store_id, timestamp)').run(); } catch (e) { /* exists */ }
try { db.prepare('CREATE INDEX IF NOT EXISTS idx_track_events_store ON dog_track_events(store_id, timestamp)').run(); } catch (e) { /* exists */ }
try { db.prepare('ALTER TABLE orders ADD COLUMN subtotal REAL').run(); } catch (e) { /* exists */ }
try { db.prepare('ALTER TABLE orders ADD COLUMN discount_amount REAL DEFAULT 0').run(); } catch (e) { /* exists */ }
try { db.prepare('ALTER TABLE orders ADD COLUMN discount_reason TEXT').run(); } catch (e) { /* exists */ }
try { db.prepare('ALTER TABLE orders ADD COLUMN business_membership_id TEXT').run(); } catch (e) { /* exists */ }
try { db.prepare('ALTER TABLE orders ADD COLUMN points_awarded INTEGER DEFAULT 0').run(); } catch (e) { /* exists */ }
try { db.prepare('ALTER TABLE orders ADD COLUMN customer_email TEXT').run(); } catch (e) { /* exists */ }
try { db.prepare('ALTER TABLE orders ADD COLUMN tax_amount REAL DEFAULT 0').run(); } catch (e) { /* exists */ }
try { db.prepare('ALTER TABLE orders ADD COLUMN shipping_address TEXT').run(); } catch (e) { /* exists */ }
try { db.prepare('ALTER TABLE users ADD COLUMN phone_number TEXT').run(); } catch (e) { /* exists */ }
try { db.prepare('ALTER TABLE users ADD COLUMN avatar_url TEXT').run(); } catch (e) { /* exists */ }
try { db.prepare('ALTER TABLE users ADD COLUMN default_shipping_address TEXT').run(); } catch (e) { /* exists */ }
try { db.prepare('ALTER TABLE users ADD COLUMN notification_email_enabled INTEGER NOT NULL DEFAULT 1').run(); } catch (e) { /* exists */ }
try { db.prepare('ALTER TABLE users ADD COLUMN notification_sms_enabled INTEGER NOT NULL DEFAULT 0').run(); } catch (e) { /* exists */ }
try { db.prepare('ALTER TABLE users ADD COLUMN email_verified_at TEXT').run(); } catch (e) { /* exists */ }
try { db.prepare('ALTER TABLE advisor_knowledge_docs ADD COLUMN store_id TEXT').run(); } catch (e) { /* exists */ }
try { db.prepare("ALTER TABLE payments ADD COLUMN provider TEXT DEFAULT 'stripe'").run(); } catch (e) { /* exists */ }
try { db.prepare('ALTER TABLE payments ADD COLUMN provider_payment_id TEXT').run(); } catch (e) { /* exists */ }
try { db.prepare('CREATE INDEX IF NOT EXISTS idx_advisor_knowledge_docs_store_active ON advisor_knowledge_docs(store_id, is_active, updated_at DESC)').run(); } catch (e) { /* exists */ }
try { db.prepare('CREATE INDEX IF NOT EXISTS idx_payments_provider_payment_id ON payments(provider_payment_id)').run(); } catch (e) { /* exists */ }

console.log('Analytics database initialized (SQLite)');

// Seed sample classic cars on first run
try {
  const carsCount = db.prepare('SELECT COUNT(*) as count FROM classic_cars').get().count;
  if (carsCount === 0) {
    const sampleCarsPath = path.join(__dirname, 'data', 'sample-cars.json');
    if (fs.existsSync(sampleCarsPath)) {
      const sampleCars = JSON.parse(fs.readFileSync(sampleCarsPath, 'utf8'));
      const insertCar = db.prepare(
        `INSERT INTO classic_cars (id, owner_id, make, model, year, color, description, tags, price_per_day_cents, price_per_hour_cents, location, available_for_hire, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, datetime('now'), datetime('now'))`
      );
      const insertImage = db.prepare(
        `INSERT INTO car_images (id, car_id, url, is_primary, sort_order, created_at) VALUES (?, ?, ?, 1, 0, datetime('now'))`
      );
      const adminUser = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
      const demoOwnerId = adminUser?.id;
      if (demoOwnerId) {
        const seedTx = db.transaction(() => {
          for (const car of sampleCars) {
            const carId = uuidv4();
            insertCar.run(
              carId, demoOwnerId, car.make, car.model, car.year, car.color,
              car.description || null, JSON.stringify(car.tags || []),
              car.price_per_day_cents || null, car.price_per_hour_cents || null,
              car.location || null
            );
            if (car.image_url) {
              insertImage.run(uuidv4(), carId, car.image_url);
            }
          }
        });
        seedTx();
        console.log(`Seeded ${sampleCars.length} sample classic cars`);
      }
    }
  }
} catch (e) {
  console.warn('Sample car seed skipped:', e.message);
}

// Legacy store seed removed — tables dropped in migration 0019

// Legacy analytics/advisor prepared statements — wrapped to avoid crash when tables are dropped
let insertDetection = null, insertEntry = null, insertTriggerFrame = null, insertTrackEvent = null;
let upsertValidationSnapshot = null, deleteValidationSnapshotsOlderThan = null;
let selectOldTriggerFrames = null, selectTriggerFrameById = null, deleteTriggerFrameById = null;
let insertAndPruneTriggerFramesTx = null, insertAppointment = null;
let insertAdvisorKnowledgeDoc = null, insertAdvisorKnowledgeChunk = null;
let selectAdvisorKnowledgeDocs = null, selectAdvisorKnowledgeDocById = null;
let selectAdvisorKnowledgeChunks = null, selectAdvisorKnowledgeStats = null;
let deleteAdvisorKnowledgeChunksByDocId = null, deleteAdvisorKnowledgeDocById = null;
try {
  // Legacy analytics prepared statements were removed.
  // Keep only advisor prepared statements for compatibility with existing admin tools.
  insertAdvisorKnowledgeDoc = db.prepare("INSERT INTO advisor_knowledge_docs (id, store_id, title, source, content, metadata_json, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))");
  insertAdvisorKnowledgeChunk = db.prepare("INSERT INTO advisor_knowledge_chunks (doc_id, chunk_index, content, content_lower, token_count, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))");
  deleteAdvisorKnowledgeChunksByDocId = db.prepare("DELETE FROM advisor_knowledge_chunks WHERE doc_id = ?");
  deleteAdvisorKnowledgeDocById = db.prepare("DELETE FROM advisor_knowledge_docs WHERE id = ?");
} catch(e) { /* best-effort compatibility layer */ }
const storeTriggerFrame = () => null;

function removeTriggerFrameFileByUrl(frameUrl) {
  if (!frameUrl || typeof frameUrl !== 'string') return;
  try {
    const stalePath = path.join(__dirname, '..', frameUrl.replace('/uploads/', 'uploads/'));
    if (fs.existsSync(stalePath)) {
      fs.unlinkSync(stalePath);
    }
  } catch (error) {
    // Best-effort file cleanup; DB row might already be deleted.
  }
}

// Utility function for API responses
const apiResponse = (data, error = null) => {
  return {
    success: !error,
    data: error ? undefined : data,
    error: error || undefined,
    meta: {
      timestamp: new Date().toISOString(),
      request_id: uuidv4(),
    },
  };
};

// ============================================================================
// Auth Configuration
// ============================================================================

const JWT_SECRET = process.env.JWT_SECRET || 'rides-dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const PASSWORD_RESET_TOKEN_EXPIRES_MIN = parseInt(process.env.PASSWORD_RESET_TOKEN_EXPIRES_MIN || '30', 10);
const PASSWORD_RESET_BASE_URL = process.env.PASSWORD_RESET_BASE_URL || 'http://localhost:5173';
const PUBLIC_APP_BASE_URL = process.env.PUBLIC_APP_BASE_URL
  || process.env.EMAIL_VERIFY_BASE_URL
  || PASSWORD_RESET_BASE_URL
  || 'http://localhost:5173';

// Warn loudly if using default JWT secret in non-dev environment
if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET must be set in production. Exiting.');
    process.exit(1);
  }
  console.warn('WARNING: Using default JWT_SECRET - set JWT_SECRET env var before deploying to production');
}

// Seed initial admin user on startup (only if no admin exists yet)
// Uses ADMIN_EMAIL / ADMIN_PASSWORD env vars, falls back to defaults in dev only
const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get();
if (adminCount.count === 0) {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@unforgettablerides.com';
  const adminPassword = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? null : 'admin123');
  if (!adminPassword) {
    console.error('ERROR: No admin exists and ADMIN_PASSWORD not set. Set ADMIN_EMAIL and ADMIN_PASSWORD env vars.');
  } else {
    const adminId = uuidv4();
    const hash = bcrypt.hashSync(adminPassword, 10);
    db.prepare(
      'INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)'
    ).run(adminId, adminEmail.toLowerCase().trim(), hash, 'Admin', 'admin');
    console.log(`Seeded admin user (${adminEmail})`);
  }
}

// JWT auth middleware — attaches req.user if valid token present
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json(apiResponse(null, { code: 'UNAUTHORIZED', message: 'Authentication required' }));
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, email, name, phone_number, avatar_url, notification_email_enabled, notification_sms_enabled, role, store_id, email_verified_at, is_active, created_at, updated_at FROM users WHERE id = ?').get(decoded.userId);
    if (!user || !user.is_active) {
      return res.status(401).json(apiResponse(null, { code: 'UNAUTHORIZED', message: 'User not found or inactive' }));
    }
    req.user = user;
    req.user_store_ids = getAssignedStoreIdsForUser(user);
    if (enforceRequestedStoreAccess(req, res)) return;
    next();
  } catch (err) {
    return res.status(401).json(apiResponse(null, { code: 'UNAUTHORIZED', message: 'Invalid or expired token' }));
  }
}

// Role guard — restricts access to specified roles
function roleGuard(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json(apiResponse(null, { code: 'UNAUTHORIZED', message: 'Authentication required' }));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Insufficient permissions' }));
    }
    next();
  };
}

// Helper: check if user has staff-level (B-end) access.
// Intentionally excludes 'business_member' to avoid staff/admin privileges bleed.
const STAFF_ROLES = ['admin', 'store_manager', 'staff'];
function isStaff(user) {
  return user && STAFF_ROLES.includes(user.role);
}

function normalizeStoreId(raw) {
  if (raw === undefined || raw === null) return null;
  const val = String(raw).trim();
  return val || null;
}

function normalizeStoreSlug(raw) {
  if (raw === undefined || raw === null) return null;
  const val = String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  return val || null;
}

function requestedStoreId(req) {
  if (typeof req.query?.store_id === 'string') return normalizeStoreId(req.query.store_id);
  if (typeof req.body?.store_id === 'string') return normalizeStoreId(req.body.store_id);
  return null;
}

function getAssignedStoreIdsForUser(user) {
  if (!user) return [];
  const links = db.prepare(`
    SELECT store_id
    FROM user_store_links
    WHERE user_id = ? AND is_active = 1
    ORDER BY store_id ASC
  `).all(user.id);
  const ids = links.map(r => normalizeStoreId(r.store_id)).filter(Boolean);
  if (ids.length > 0) return Array.from(new Set(ids));
  const legacy = normalizeStoreId(user.store_id);
  return legacy ? [legacy] : [];
}

function getUserScopedStoreIds(req) {
  if (!req.user) return [];
  if (Array.isArray(req.user_store_ids)) return req.user_store_ids;
  const ids = getAssignedStoreIdsForUser(req.user);
  req.user_store_ids = ids;
  return ids;
}

// Resolve store scope:
// - admin: optional query/body store_id filter (null => all stores)
// - manager/staff: forced to own store_id
// - others: no store scoping
function resolveStoreScope(req) {
  if (!req.user) return null;
  if (req.user.role === 'admin') return requestedStoreId(req);
  if (req.user.role === 'store_manager' || req.user.role === 'staff') {
    const ids = getUserScopedStoreIds(req);
    const requested = requestedStoreId(req);
    if (requested && ids.includes(requested)) return requested;
    return ids.length === 1 ? ids[0] : (requested || null);
  }
  return null;
}

function appendStoreScope(sql, params, req, column = 'store_id', { includeNullFallback = false } = {}) {
  if (!req.user) return sql;
  if (req.user.role === 'admin') {
    const adminStoreId = requestedStoreId(req);
    if (!adminStoreId) return sql;
    if (includeNullFallback) {
      sql += ` AND (${column} = ? OR ${column} IS NULL)`;
    } else {
      sql += ` AND ${column} = ?`;
    }
    params.push(adminStoreId);
    return sql;
  }
  if (req.user.role !== 'store_manager' && req.user.role !== 'staff') return sql;

  const ids = getUserScopedStoreIds(req);
  if (ids.length === 0) {
    return sql; // legacy single-store compatibility: no scoped links => do not force store filter
  }
  const requested = requestedStoreId(req);
  const scopedIds = requested && ids.includes(requested) ? [requested] : ids;
  if (scopedIds.length === 1) {
    if (includeNullFallback) {
      sql += ` AND (${column} = ? OR ${column} IS NULL)`;
    } else {
      sql += ` AND ${column} = ?`;
    }
    params.push(scopedIds[0]);
    return sql;
  }
  const placeholders = scopedIds.map(() => '?').join(', ');
  if (includeNullFallback) {
    sql += ` AND (${column} IN (${placeholders}) OR ${column} IS NULL)`;
  } else {
    sql += ` AND ${column} IN (${placeholders})`;
  }
  params.push(...scopedIds);
  return sql;
}

function canAccessStoreScopedRecord(req, recordStoreId, { includeNullFallback = false } = {}) {
  if (!req.user) return false;
  if (req.user.role === 'admin') return true;
  if (req.user.role !== 'store_manager' && req.user.role !== 'staff') return true;
  const ids = getUserScopedStoreIds(req);
  if (ids.length === 0) return true; // legacy compatibility
  if (!recordStoreId && includeNullFallback) return true;
  return ids.includes(normalizeStoreId(recordStoreId));
}

function resolveWriteStoreId(req) {
  const requested = requestedStoreId(req);
  if (!req.user) return { storeId: requested };
  if (req.user.role === 'admin') return { storeId: requested };
  if (req.user.role === 'store_manager' || req.user.role === 'staff') {
    const ids = getUserScopedStoreIds(req);
    if (ids.length === 0) {
      return { error: { code: 'FORBIDDEN', message: 'No stores assigned to current user' } };
    }
    if (requested) {
      if (!ids.includes(requested)) {
        return { error: { code: 'FORBIDDEN', message: 'Requested store is not assigned to current user' } };
      }
      return { storeId: requested };
    }
    if (ids.length > 1) {
      return { error: { code: 'STORE_REQUIRED', message: 'store_id is required for users assigned to multiple stores' } };
    }
    return { storeId: ids[0] };
  }
  return { storeId: requested };
}

function enforceRequestedStoreAccess(req, res) {
  if (!req.user) return false;
  if (req.user.role !== 'store_manager' && req.user.role !== 'staff') return false;
  const requested = requestedStoreId(req);
  if (!requested) return false;
  const ids = getUserScopedStoreIds(req);
  if (ids.length === 0) return false;
  if (ids.includes(requested)) return false;
  res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Requested store is not assigned to current user' }));
  return true;
}

function parseJsonArrayField(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return fallback;
  const str = String(value).trim();
  if (!str) return fallback;
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

function parseBoolInt(input, defaultValue = 0) {
  if (input === undefined || input === null || input === '') return defaultValue ? 1 : 0;
  if (typeof input === 'boolean') return input ? 1 : 0;
  const s = String(input).trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return 1;
  if (s === '0' || s === 'false' || s === 'no' || s === 'off') return 0;
  return defaultValue ? 1 : 0;
}

function parseNullableInt(input) {
  if (input === undefined || input === null || input === '') return null;
  const n = Number(input);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function parseRequiredInt(input) {
  const n = Number(input);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

async function sendNotification(userId, kind, payload = {}) {
  if (!userId) return;
  const user = db.prepare(`
    SELECT id, email, phone_number, notification_email_enabled, notification_sms_enabled
    FROM users
    WHERE id = ? AND is_active = 1
  `).get(userId);
  if (!user) return;

  const jobs = [];

  if (user.notification_email_enabled && user.email && EMAIL_NOTIFICATION_WEBHOOK_URL) {
    jobs.push(
      axios.post(EMAIL_NOTIFICATION_WEBHOOK_URL, {
        kind,
        channel: 'email',
        to: user.email,
        user_id: user.id,
        payload,
      }, { timeout: 5000 }).catch((err) => {
        console.warn('Email notification failed:', err.message);
      })
    );
  }

  if (user.notification_sms_enabled && user.phone_number && SMS_NOTIFICATION_WEBHOOK_URL) {
    jobs.push(
      axios.post(SMS_NOTIFICATION_WEBHOOK_URL, {
        kind,
        channel: 'sms',
        to: user.phone_number,
        user_id: user.id,
        payload,
      }, { timeout: 5000 }).catch((err) => {
        console.warn('SMS notification failed:', err.message);
      })
    );
  }

  if (jobs.length === 0) return;
  await Promise.all(jobs);
}

function hashPasswordResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

let _smtpTransporter = null;
let _smtpTransporterConfigKey = null;
const SETTINGS_ENCRYPTION_KEY = nodeCrypto.createHash('sha256').update(SETTINGS_ENCRYPTION_KEY_SOURCE).digest();

function encryptSettingSecret(plainText) {
  const text = String(plainText || '');
  if (!text) return '';
  const iv = nodeCrypto.randomBytes(12);
  const cipher = nodeCrypto.createCipheriv('aes-256-gcm', SETTINGS_ENCRYPTION_KEY, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc::v1:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decryptSettingSecret(cipherText) {
  const raw = String(cipherText || '');
  if (!raw) return '';
  if (!raw.startsWith('enc::v1:')) return raw;
  const encoded = raw.slice('enc::v1:'.length);
  const parts = encoded.split(':');
  if (parts.length !== 3) return '';
  try {
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const enc = Buffer.from(parts[2], 'hex');
    const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', SETTINGS_ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  } catch (_) {
    return '';
  }
}

function parseBoolSetting(raw, fallback = false) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const normalized = String(raw).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes';
}

function getRuntimeEmailConfig() {
  const modeRaw = getSetting('email_delivery_mode', '');
  const mode = String(modeRaw || '').trim().toLowerCase();
  const webhookUrl = String(getSetting('email_notification_webhook_url', EMAIL_NOTIFICATION_WEBHOOK_URL) || '').trim();
  const smtpHost = String(getSetting('smtp_host', SMTP_HOST) || '').trim();
  const smtpPort = Number(getSetting('smtp_port', String(SMTP_PORT)) || SMTP_PORT);
  const smtpUser = String(getSetting('smtp_user', SMTP_USER) || '').trim();
  const smtpPassEnc = String(getSetting('smtp_pass_enc', '') || '').trim();
  const smtpPass = decryptSettingSecret(smtpPassEnc) || SMTP_PASS;
  const smtpUseTls = parseBoolSetting(getSetting('smtp_use_tls', SMTP_USE_TLS ? '1' : '0'), SMTP_USE_TLS);
  const smtpUseSsl = parseBoolSetting(getSetting('smtp_use_ssl', SMTP_USE_SSL ? '1' : '0'), SMTP_USE_SSL);
  const fromName = String(getSetting('email_from_name', EMAIL_FROM_NAME) || '').trim() || 'UnforgettableRides';
  const fromAddress = String(getSetting('email_from_address', EMAIL_FROM_ADDRESS || SMTP_USER) || '').trim() || smtpUser;
  return {
    mode,
    webhookUrl,
    smtpHost,
    smtpPort: Number.isFinite(smtpPort) && smtpPort > 0 ? smtpPort : SMTP_PORT,
    smtpUser,
    smtpPass,
    smtpUseTls,
    smtpUseSsl,
    fromName,
    fromAddress,
  };
}

function getSmtpTransporter(emailConfig) {
  if (!emailConfig?.smtpHost || !emailConfig?.smtpUser || !emailConfig?.smtpPass) return null;
  const nextKey = JSON.stringify({
    host: emailConfig.smtpHost,
    port: emailConfig.smtpPort,
    user: emailConfig.smtpUser,
    pass: emailConfig.smtpPass,
    tls: emailConfig.smtpUseTls,
    ssl: emailConfig.smtpUseSsl,
  });
  if (_smtpTransporter && _smtpTransporterConfigKey === nextKey) return _smtpTransporter;
  _smtpTransporter = nodemailer.createTransport({
    host: emailConfig.smtpHost,
    port: emailConfig.smtpPort,
    secure: emailConfig.smtpUseSsl,
    auth: {
      user: emailConfig.smtpUser,
      pass: emailConfig.smtpPass,
    },
    requireTLS: emailConfig.smtpUseTls && !emailConfig.smtpUseSsl,
  });
  _smtpTransporterConfigKey = nextKey;
  return _smtpTransporter;
}

async function sendEmailNotification({ kind, to, payload }) {
  if (!to) return false;
  // Tests should not hit external email providers or emit async post-test logs.
  if (NODE_ENV === 'test') return true;
  // TODO(TEMP): keep webhook/SMTP fallback during rollout.
  // Before production launch, standardize on one real provider and monitor delivery metrics.
  const emailConfig = getRuntimeEmailConfig();
  const useWebhook = emailConfig.mode === 'webhook' || (!emailConfig.mode && !!emailConfig.webhookUrl);
  const useSmtp = emailConfig.mode === 'smtp' || (!emailConfig.mode && !!emailConfig.smtpHost);

  if (useWebhook && emailConfig.webhookUrl) {
    try {
      await axios.post(emailConfig.webhookUrl, {
        kind,
        channel: 'email',
        to,
        payload,
      }, { timeout: 5000 });
      return true;
    } catch (err) {
      console.warn('Email webhook send failed:', err.message);
    }
  }

  if (!useSmtp) return false;
  const transporter = getSmtpTransporter(emailConfig);
  if (!transporter) return false;
  try {
    const subject = String(payload?.subject || 'UnforgettableRides Notification');
    const text = String(payload?.message || payload?.text || 'UnforgettableRides notification');
    const html = typeof payload?.html === 'string' ? payload.html : undefined;
    const from = emailConfig.fromAddress
      ? (emailConfig.fromName ? `"${emailConfig.fromName}" <${emailConfig.fromAddress}>` : emailConfig.fromAddress)
      : emailConfig.smtpUser;
    await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });
    return true;
  } catch (err) {
    console.warn('SMTP email send failed:', err.message);
    return false;
  }
}

async function sendPasswordResetEmail({ email, resetUrl, userName, client = 'app' }) {
  const safeUser = String(userName || '').trim();
  const normalizedClient = String(client || '').trim().toLowerCase() === 'dashboard' ? 'dashboard' : 'app';

  const text = normalizedClient === 'dashboard'
    ? [
      `Hello${safeUser ? ` ${safeUser}` : ''},`,
      '',
      'A password reset was requested for your UnforgettableRides dashboard account.',
      '',
      'Reset link:',
      resetUrl,
      '',
      `This reset link/token expires in ${PASSWORD_RESET_TOKEN_EXPIRES_MIN} minutes.`,
      '',
      'If you did not request this, ignore this email.',
    ].join('\n')
    : [
      `Hello${safeUser ? ` ${safeUser}` : ''},`,
      '',
      'We received a request to reset your UnforgettableRides app password.',
      '',
      'Tap this link to reset your password:',
      resetUrl,
      `This reset link/code expires in ${PASSWORD_RESET_TOKEN_EXPIRES_MIN} minutes.`,
      '',
      'If you did not request this, you can safely ignore this email.',
    ].join('\n');

  const html = normalizedClient === 'dashboard'
    ? `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
        <p>Hello${safeUser ? ` ${safeUser}` : ''},</p>
        <p>A password reset was requested for your UnforgettableRides dashboard account.</p>
        <p><a href="${resetUrl}" target="_blank" rel="noopener noreferrer">Reset Dashboard Password</a></p>
        <p>If the link does not open, copy and paste this URL:</p>
        <p><a href="${resetUrl}" target="_blank" rel="noopener noreferrer">${resetUrl}</a></p>
        <p>This reset link/token expires in ${PASSWORD_RESET_TOKEN_EXPIRES_MIN} minutes.</p>
        <p>If you did not request this, ignore this email.</p>
      </div>
    `.trim()
    : `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0F172A;background:#F8FAFC;padding:20px;">
        <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:14px;padding:22px;">
          <h2 style="margin:0 0 10px 0;font-size:20px;font-weight:600;color:#0F172A;text-align:center;">Reset your UnforgettableRides app password</h2>
          <p style="margin:0 0 12px 0;">Hello${safeUser ? ` ${safeUser}` : ''},</p>
          <p style="margin:0 0 16px 0;">We received a request to reset your UnforgettableRides app password.</p>
          <div style="text-align:center;margin:18px 0;">
            <a href="${resetUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#3B82F6;color:#FFFFFF;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;">Reset Password</a>
          </div>
          <p style="margin:0 0 8px 0;">If the button does not open, copy this URL:</p>
          <p style="margin:0 0 14px 0;word-break:break-all;"><a href="${resetUrl}" target="_blank" rel="noopener noreferrer">${resetUrl}</a></p>
          <p style="margin:0 0 8px 0;color:#475569;">This reset link/code expires in ${PASSWORD_RESET_TOKEN_EXPIRES_MIN} minutes.</p>
          <p style="margin:0;color:#64748B;">If you did not request this, you can safely ignore this email.</p>
        </div>
      </div>
    `.trim();
  await sendEmailNotification({
    kind: 'password_reset',
    to: email,
    payload: {
      subject: normalizedClient === 'dashboard'
        ? 'UnforgettableRides dashboard password reset'
        : 'Reset your UnforgettableRides app password',
      user_name: userName || null,
      client: normalizedClient,
      reset_url: resetUrl,
      expires_minutes: PASSWORD_RESET_TOKEN_EXPIRES_MIN,
      text,
      html,
      message: text,
    },
  });
}

async function sendAuthCodeEmail({ email, userName, purpose, code, expiresMinutes }) {
  const purposeLabel = purpose === 'login_device'
    ? 'Sign-in verification code'
    : (purpose === 'email_change' ? 'Email change verification code' : 'Email verification code');
  const message = purpose === 'login_device'
    ? `Use this code to confirm sign-in on a new device: ${code}`
    : (purpose === 'email_change'
      ? `Use this code to confirm your new email address: ${code}`
      : `Use this code to verify your UnforgettableRides account email: ${code}`);
  await sendEmailNotification({
    kind: 'auth_code',
    to: email,
    payload: {
      subject: `${purposeLabel} - UnforgettableRides`,
      user_name: userName || null,
      code,
      purpose,
      expires_minutes: expiresMinutes,
      message: `${message}. It expires in ${expiresMinutes} minute(s).`,
    },
  });
}

async function sendEmailVerificationLinkEmail({ email, userName, verifyUrl, expiresMinutes }) {
  const safeUser = String(userName || '').trim();
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
      <p>Hi${safeUser ? ` ${safeUser}` : ''},</p>
      <p>Please verify your UnforgettableRides account email by clicking the link below:</p>
      <p><a href="${verifyUrl}" target="_blank" rel="noopener noreferrer">Verify Email</a></p>
      <p>If the button/link does not open, copy and paste this URL into your browser:</p>
      <p><a href="${verifyUrl}" target="_blank" rel="noopener noreferrer">${verifyUrl}</a></p>
      <p>This link expires in ${expiresMinutes} minute(s).</p>
    </div>
  `.trim();
  await sendEmailNotification({
    kind: 'email_verify_link',
    to: email,
    payload: {
      subject: 'Verify your UnforgettableRides email',
      user_name: userName || null,
      verify_url: verifyUrl,
      expires_minutes: expiresMinutes,
      html,
      message: `Verify your UnforgettableRides email: <${verifyUrl}>. This link expires in ${expiresMinutes} minute(s).`,
    },
  });
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function codeBaseFromText(input) {
  const base = String(input || '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
  return base.slice(0, 8) || 'BIZ';
}

function generateUniqueBusinessCode(seedText = 'BIZ') {
  const base = codeBaseFromText(seedText);
  for (let i = 0; i < 24; i += 1) {
    const suffix = uuidv4().slice(0, 6).toUpperCase();
    const candidate = `${base}-${suffix}`;
    const exists = db.prepare('SELECT id FROM business_memberships WHERE code = ?').get(candidate);
    if (!exists) return candidate;
  }
  throw new Error('FAILED_TO_GENERATE_CODE');
}

function getActiveBusinessMembershipByCode(code) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  const bm = db.prepare('SELECT * FROM business_memberships WHERE code = ?').get(normalized);
  if (!bm || !bm.is_active) return null;
  const now = Date.now();
  if (bm.starts_at && new Date(bm.starts_at).getTime() > now) return null;
  if (bm.ends_at && new Date(bm.ends_at).getTime() < now) return null;
  return bm;
}

function getActiveCustomerBusinessLink(customerUserId) {
  return db.prepare(`
    SELECT l.*, bm.code, bm.display_name, bm.discount_percent, bm.max_discount_amount,
           bm.monthly_usage_limit, bm.points_multiplier_referral, bm.points_multiplier_self
    FROM customer_business_links l
    JOIN business_memberships bm ON bm.id = l.business_membership_id
    WHERE l.customer_user_id = ? AND l.is_active = 1 AND bm.is_active = 1
    ORDER BY l.linked_at DESC
    LIMIT 1
  `).get(customerUserId);
}

function getBusinessMemberForCustomer(customerUserId, codeInput = null) {
  if (codeInput) {
    const byCode = getActiveBusinessMembershipByCode(codeInput);
    if (!byCode) return null;
    const existing = getActiveCustomerBusinessLink(customerUserId);
    if (existing && existing.business_membership_id !== byCode.id) {
      // Respect one active link. Keep current active link; do not switch silently.
      return existing;
    }
    return existing || { ...byCode, business_membership_id: byCode.id };
  }
  return getActiveCustomerBusinessLink(customerUserId);
}

function bindBusinessMemberForCustomer(customerUserId, codeInput, linkedByUserId, notes = null) {
  const byCode = getActiveBusinessMembershipByCode(codeInput);
  if (!byCode) return null;
  const existing = getActiveCustomerBusinessLink(customerUserId);
  if (existing) return existing;
  db.prepare(`
    INSERT INTO customer_business_links
    (id, customer_user_id, business_membership_id, is_active, linked_at, linked_by_user_id, notes)
    VALUES (?, ?, ?, 1, datetime('now'), ?, ?)
  `).run(uuidv4(), customerUserId, byCode.id, linkedByUserId || null, notes || null);
  return getActiveCustomerBusinessLink(customerUserId) || { ...byCode, business_membership_id: byCode.id };
}

function getMonthWindow(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1)).toISOString();
  const end = new Date(Date.UTC(y, m + 1, 1)).toISOString();
  return { start, end };
}

function getMonthlyUsageCount(customerUserId, businessMembershipId) {
  const { start, end } = getMonthWindow();
  const ordersCount = db.prepare(`
    SELECT COUNT(*) as c
    FROM orders
    WHERE user_id = ?
      AND business_membership_id = ?
      AND discount_amount > 0
      AND created_at >= ?
      AND created_at < ?
  `).get(customerUserId, businessMembershipId, start, end).c;
  const chargesCount = db.prepare(`
    SELECT COUNT(*) as c
    FROM appointment_charges
    WHERE user_id = ?
      AND business_membership_id = ?
      AND discount_amount > 0
      AND status = 'charged'
      AND created_at >= ?
      AND created_at < ?
  `).get(customerUserId, businessMembershipId, start, end).c;
  return Number(ordersCount || 0) + Number(chargesCount || 0);
}

function computeDiscount(subtotal, bmOrLink, customerUserId) {
  const roundedSubtotal = Math.round(Number(subtotal || 0) * 100) / 100;
  if (!bmOrLink || roundedSubtotal <= 0) {
    return {
      subtotal: roundedSubtotal,
      discount_amount: 0,
      final_total: roundedSubtotal,
      discount_reason: null,
      business_membership_id: null,
    };
  }

  const businessMembershipId = bmOrLink.business_membership_id || bmOrLink.id;
  const percent = Math.max(0, Number(bmOrLink.discount_percent || 0));
  const cap = Math.max(0, Number(bmOrLink.max_discount_amount || 0));
  const monthlyLimit = Math.max(0, Number(bmOrLink.monthly_usage_limit || 0));

  if (monthlyLimit > 0 && customerUserId) {
    const usage = getMonthlyUsageCount(customerUserId, businessMembershipId);
    if (usage >= monthlyLimit) {
      return {
        subtotal: roundedSubtotal,
        discount_amount: 0,
        final_total: roundedSubtotal,
        discount_reason: 'MONTHLY_LIMIT_REACHED',
        business_membership_id: businessMembershipId,
      };
    }
  }

  const raw = roundedSubtotal * (percent / 100);
  const discount = Math.min(raw, cap > 0 ? cap : raw);
  const roundedDiscount = Math.round(discount * 100) / 100;
  const finalTotal = Math.round((roundedSubtotal - roundedDiscount) * 100) / 100;
  return {
    subtotal: roundedSubtotal,
    discount_amount: roundedDiscount,
    final_total: finalTotal < 0 ? 0 : finalTotal,
    discount_reason: roundedDiscount > 0 ? `BUSINESS_MEMBER_${percent}%` : null,
    business_membership_id: businessMembershipId,
  };
}

function computePoints(baseAmount, multiplier) {
  const amount = Math.max(0, Number(baseAmount || 0));
  const m = Math.max(0, Number(multiplier || 0));
  return Math.floor(amount * m);
}

function awardBusinessMemberPoints({ businessMembershipId, customerUserId = null, orderId = null, appointmentChargeId = null, sourceType, points, memo = null }) {
  const p = Number(points || 0);
  if (p <= 0) return;
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO business_points_ledger
      (business_membership_id, customer_user_id, order_id, appointment_charge_id, source_type, points_delta, memo)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(businessMembershipId, customerUserId, orderId, appointmentChargeId, sourceType, p, memo);
    db.prepare(`
      UPDATE business_memberships
      SET points_balance = points_balance + ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(p, businessMembershipId);
  });
  tx();
}

// Internal service auth — HMAC-signed requests (preferred) or static key (legacy)
// HMAC: camera_worker signs request body with shared secret + timestamp to prevent replay
const crypto = require('crypto');
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || (process.env.NODE_ENV === 'production' ? null : 'rides-internal-dev-key');
const INTERNAL_HMAC_MAX_AGE_MS = parseInt(process.env.INTERNAL_HMAC_MAX_AGE_MS || '300000', 10); // 5 min default
if (!INTERNAL_API_KEY && process.env.NODE_ENV === 'production') {
  console.warn('WARNING: INTERNAL_API_KEY not set - internal service callbacks will fail');
}

// In-memory nonce set for replay protection within the HMAC time window.
// Entries are { nonce, expiresAt }; stale nonces are purged periodically.
const _usedNonces = new Map();
const _noncePurgeTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of _usedNonces) {
    if (exp <= now) _usedNonces.delete(k);
  }
}, 60_000);
_noncePurgeTimer.unref(); // don't keep process alive for this timer

/**
 * Verify HMAC-signed internal request.
 * Headers (all required):
 *   X-Internal-Signature: <hex>  — HMAC-SHA256(key, timestamp + "." + nonce + "." + body)
 *   X-Internal-Timestamp: <epoch-ms>
 *   X-Internal-Nonce: <unique-id>  — UUID per request; included in signature to prevent replay
 *
 * Nonce is part of the signed payload, so an attacker cannot swap it without
 * invalidating the signature.  The nonce set rejects duplicates within the
 * time window to cover exact replays.
 *
 * NOTE: nonce store is process-local (in-memory Map).  If the API is scaled to
 * multiple instances, replace _usedNonces with a shared store (Redis SET with
 * TTL = INTERNAL_HMAC_MAX_AGE_MS).  For a single-process SQLite deployment
 * this is sufficient.
 */
function verifyInternalHmac(req) {
  const signature = req.headers['x-internal-signature'];
  const timestamp = req.headers['x-internal-timestamp'];
  const nonce = req.headers['x-internal-nonce'];
  if (!signature || !timestamp || !nonce || !INTERNAL_API_KEY) return false;

  // Reject stale requests (time-window check)
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() - ts) > INTERNAL_HMAC_MAX_AGE_MS) return false;

  // Reject reused nonces (exact-replay protection)
  if (_usedNonces.has(nonce)) return false;

  // Compute expected signature — nonce is part of the signed payload
  const payload = `${timestamp}.${nonce}.${JSON.stringify(req.body)}`;
  const expected = crypto.createHmac('sha256', INTERNAL_API_KEY).update(payload).digest('hex');

  // Validate signature is well-formed hex of correct length before timingSafeEqual
  if (!/^[0-9a-f]+$/i.test(signature)) return false;
  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length) return false;

  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;

  // Record nonce after successful verification
  _usedNonces.set(nonce, Date.now() + INTERNAL_HMAC_MAX_AGE_MS);

  return true;
}

// Public routes that do not require authentication
// Public routes: exact match only (no prefix expansion)
const PUBLIC_ROUTES_EXACT = [
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/signup',
  'POST /api/v1/auth/password/forgot',
  'POST /api/v1/auth/password/reset',
  'GET /api/v1/auth/email/verify-link',
  'POST /api/v1/auth/login/verify-device',
  'GET /api/v1/health',
  'GET /api/v1/cars',
  'GET /api/v1/cars/featured',
  'POST /api/v1/payments/webhook',
  'GET /api/v1/payments/config',
];
// Public routes: match with one additional path segment (e.g. /cars/:id)
const PUBLIC_CARS_PREFIX = 'GET /api/v1/cars';
// Public routes: match with one additional path segment
const PUBLIC_ROUTES_WITH_ID = [];
const PUBLIC_ROUTE_SOCIAL_PUBLIC_POSTS_PREFIX = 'GET /api/v1/social/public/posts';
const INTERNAL_KEY_ROUTES = [
  'POST /api/v1/analytics/detection',
];
const LEGACY_ENDPOINT_PREFIXES = [
  '/dogs',
  '/recommendations',
  '/washes',
  '/cycles',
  '/breeds',
  '/care',
  '/advisor',
  '/appointments',
  '/products',
  '/orders',
  '/stores',
  '/memberships',
  '/business-memberships',
];

// Global auth middleware — protects all /api/v1/* routes except PUBLIC_ROUTES
app.use('/api/v1', (req, res, next) => {
  const pathOnly = String(req.path || '');
  const isLegacyEndpoint = LEGACY_ENDPOINT_PREFIXES.some((prefix) => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`));
  if (isLegacyEndpoint) {
    return res.status(410).json(apiResponse(null, {
      code: 'ENDPOINT_REMOVED',
      message: 'Legacy endpoint removed from UnforgettableRides rides platform.',
    }));
  }

  const routeKey = `${req.method} ${req.path.startsWith('/') ? '/api/v1' + req.path : req.path}`;
  const normalizedRoute = routeKey.replace(/\/$/, '');

  // Check exact matches
  const isExactPublic = PUBLIC_ROUTES_EXACT.includes(normalizedRoute);

  // Check routes that allow exactly one additional path segment (e.g. /products/:id)
  const isPublicWithId = PUBLIC_ROUTES_WITH_ID.some(pr => {
    if (!normalizedRoute.startsWith(pr + '/')) return false;
    const remainder = normalizedRoute.slice(pr.length + 1);
    return remainder.length > 0 && !remainder.includes('/');
  });
  const isPublicPostDetail = (() => {
    if (!normalizedRoute.startsWith(PUBLIC_ROUTE_SOCIAL_PUBLIC_POSTS_PREFIX + '/')) return false;
    const remainder = normalizedRoute.slice(PUBLIC_ROUTE_SOCIAL_PUBLIC_POSTS_PREFIX.length + 1);
    return remainder.length > 0 && !remainder.includes('/');
  })();
  const isPublicPostComments = (() => {
    if (!normalizedRoute.startsWith(PUBLIC_ROUTE_SOCIAL_PUBLIC_POSTS_PREFIX + '/')) return false;
    const remainder = normalizedRoute.slice(PUBLIC_ROUTE_SOCIAL_PUBLIC_POSTS_PREFIX.length + 1);
    const parts = remainder.split('/');
    return parts.length === 2 && parts[0].length > 0 && parts[1] === 'comments';
  })();

  // Public car browse/detail: GET /api/v1/cars, /cars/:id, /cars/:id/availability
  const isPublicCarRoute = normalizedRoute.startsWith(PUBLIC_CARS_PREFIX);

  if (isExactPublic || isPublicWithId || isPublicPostDetail || isPublicPostComments || isPublicCarRoute) {
    // Public route: optionally parse JWT to populate req.user (for active/inactive filtering)
    // but don't require it — unauthenticated access is allowed
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = db.prepare('SELECT id, email, name, role, store_id, is_active FROM users WHERE id = ?').get(decoded.userId);
        if (user && user.is_active) {
          req.user = user;
          req.user_store_ids = getAssignedStoreIdsForUser(user);
        }
      } catch (_) { /* invalid token on public route — ignore */ }
    }
    return next();
  }

  // Allow internal service auth only on explicitly whitelisted machine routes
  const isInternalRoute = INTERNAL_KEY_ROUTES.some(r => normalizedRoute === r);
  if (isInternalRoute) {
    // If HMAC signature header is present, ONLY use HMAC verification.
    // Never fall through to legacy key — prevents bypass of failed signature check.
    if (req.headers['x-internal-signature']) {
      if (verifyInternalHmac(req)) {
        req.user = { id: '_internal', role: 'admin', name: 'Internal Service' };
        return next();
      }
      // Signature present but invalid — hard reject, no legacy fallback
      return res.status(401).json(apiResponse(null, { code: 'UNAUTHORIZED', message: 'Invalid service signature' }));
    }
    // Legacy fallback: static X-Internal-Key ONLY when no signature header is sent
    const internalKey = req.headers['x-internal-key'];
    if (internalKey && INTERNAL_API_KEY && internalKey === INTERNAL_API_KEY) {
      req.user = { id: '_internal', role: 'admin', name: 'Internal Service' };
      return next();
    }
  }

  // Require valid JWT for all other routes
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json(apiResponse(null, { code: 'UNAUTHORIZED', message: 'Authentication required' }));
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, email, name, phone_number, avatar_url, notification_email_enabled, notification_sms_enabled, role, store_id, is_active, created_at, updated_at FROM users WHERE id = ?').get(decoded.userId);
    if (!user || !user.is_active) {
      return res.status(401).json(apiResponse(null, { code: 'UNAUTHORIZED', message: 'User not found or inactive' }));
    }
    req.user = user;
    req.user_store_ids = getAssignedStoreIdsForUser(user);
    if (enforceRequestedStoreAccess(req, res)) return;
    next();
  } catch (err) {
    return res.status(401).json(apiResponse(null, { code: 'UNAUTHORIZED', message: 'Invalid or expired token' }));
  }
});

// ============================================================================
// Auth Endpoints
// ============================================================================
const routeContext = {
  app,
  apiResponse,
  authMiddleware,
  roleGuard,
  db,
  rateLimit,
  RATE_LIMIT_MAX_LOGIN,
  RATE_LIMIT_MAX_SIGNUP,
  bcrypt,
  jwt,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  uuidv4,
  crypto,
  hashPasswordResetToken,
  PASSWORD_RESET_TOKEN_EXPIRES_MIN,
  PASSWORD_RESET_BASE_URL,
  sendPasswordResetEmail,
  sendAuthCodeEmail,
  sendEmailVerificationLinkEmail,
  AUTH_CODE_EXPIRES_MIN,
  AUTH_CODE_MAX_ATTEMPTS,
  DEVICE_TRUST_DAYS,
  multer,
  upload,
  uploadsDir,
  isAuthDeviceChallengeEnabled,
  isAuthRequireVerifiedForSensitive,
  getPublicAppBaseUrl: getPublicAppBaseUrlSetting,
  normalizeStoreId,
  getUserScopedStoreIds,
};
registerAuthRoutes(routeContext);

// ============================================================================
// Store Settings
// ============================================================================

function settingsScopeFromRequest(req) {
  if (!req?.user) return null;
  if (req.user.role === 'admin') return requestedStoreId(req);
  if (req.user.role === 'store_manager' || req.user.role === 'staff') {
    const ids = getUserScopedStoreIds(req);
    if (ids.length === 0) return null;
    const requested = requestedStoreId(req);
    if (requested && ids.includes(requested)) return requested;
    return ids[0];
  }
  return null;
}

// Helper: get a setting value with fallback (store override first, then global)
function getSetting(key, fallback = '', storeId = null) {
  const scopedStoreId = normalizeStoreId(storeId);
  if (scopedStoreId) {
    const scoped = db.prepare('SELECT value FROM store_settings_by_store WHERE store_id = ? AND key = ?').get(scopedStoreId, key);
    if (scoped) return scoped.value;
  }
  const row = db.prepare('SELECT value FROM store_settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function getAllSettings(storeId = null) {
  const settings = {};
  const globalRows = db.prepare('SELECT key, value FROM store_settings').all();
  for (const row of globalRows) {
    settings[row.key] = row.value;
  }
  const scopedStoreId = normalizeStoreId(storeId);
  if (scopedStoreId) {
    const scopedRows = db.prepare('SELECT key, value FROM store_settings_by_store WHERE store_id = ?').all(scopedStoreId);
    for (const row of scopedRows) {
      settings[row.key] = row.value;
    }
  }
  return settings;
}

const STORE_OPERATIONAL_SETTING_KEYS = [
  'store_open_hour',
  'store_close_hour',
  'max_concurrent_appointments',
  'appointment_slot_minutes',
  'appointment_max_active_per_customer',
  'appointment_max_new_per_day',
  'appointment_max_new_per_7d',
  'appointment_min_hours_between',
];

const STORE_OPERATIONAL_SETTING_DEFAULTS = {
  store_open_hour: '9',
  store_close_hour: '18',
  max_concurrent_appointments: '3',
  appointment_slot_minutes: '30',
  appointment_max_active_per_customer: '3',
  appointment_max_new_per_day: '3',
  appointment_max_new_per_7d: '5',
  appointment_min_hours_between: '2',
};

const GLOBAL_SECURITY_SETTING_KEYS = [
  'auth_device_challenge_enabled',
  'auth_require_verified_for_sensitive',
];

const GLOBAL_EMAIL_SETTING_KEYS = [
  'public_app_base_url',
  'email_delivery_mode',
  'email_notification_webhook_url',
  'smtp_host',
  'smtp_port',
  'smtp_user',
  'smtp_use_tls',
  'smtp_use_ssl',
  'email_from_name',
  'email_from_address',
];

const GLOBAL_SECURITY_SETTING_DEFAULTS = {
  auth_device_challenge_enabled: AUTH_DEVICE_CHALLENGE_ENABLED_DEFAULT ? '1' : '0',
  auth_require_verified_for_sensitive: AUTH_REQUIRE_VERIFIED_FOR_SENSITIVE ? '1' : '0',
};

const GLOBAL_EMAIL_SETTING_DEFAULTS = {
  public_app_base_url: PUBLIC_APP_BASE_URL || 'http://localhost:5173',
  email_delivery_mode: '',
  email_notification_webhook_url: EMAIL_NOTIFICATION_WEBHOOK_URL || '',
  smtp_host: SMTP_HOST || '',
  smtp_port: String(SMTP_PORT || 587),
  smtp_user: SMTP_USER || '',
  smtp_use_tls: SMTP_USE_TLS ? '1' : '0',
  smtp_use_ssl: SMTP_USE_SSL ? '1' : '0',
  email_from_name: EMAIL_FROM_NAME || 'UnforgettableRides',
  email_from_address: EMAIL_FROM_ADDRESS || SMTP_USER || '',
};

const STORE_OPERATIONAL_NUMERIC_RULES = {
  store_open_hour: { min: 0, max: 23 },
  store_close_hour: { min: 0, max: 23 },
  max_concurrent_appointments: { min: 1, max: 20 },
  appointment_slot_minutes: { min: 15, max: 120 },
  appointment_max_active_per_customer: { min: 1, max: 20 },
  appointment_max_new_per_day: { min: 1, max: 20 },
  appointment_max_new_per_7d: { min: 1, max: 50 },
  appointment_min_hours_between: { min: 0, max: 72 },
};

const ANALYTICS_TRACKING_CONFIG_DEFAULTS = {
  camera_url: '',
  tracking_enabled: '1',
  door_line_coords: '',
  door_line_direction: 'negative_to_positive_is_entry',
  metrics_default: 'tracked',
  flow_gap_threshold_pct: '20',
  rollout_stable_days: '3',
  rollout_min_daily_legacy_flow: '20',
};

const ANALYTICS_TRACKING_DIRECTION_ALLOWED = new Set([
  'negative_to_positive_is_entry',
  'positive_to_negative_is_entry',
]);
const ANALYTICS_METRICS_DEFAULT_ALLOWED = new Set(['tracked', 'legacy']);

function getStoreOperationalSettings(storeId = null) {
  const values = {};
  for (const key of STORE_OPERATIONAL_SETTING_KEYS) {
    values[key] = getSetting(key, STORE_OPERATIONAL_SETTING_DEFAULTS[key], storeId);
  }
  return values;
}

function validateOperationalSettingsPatch(patch = {}, currentValues = STORE_OPERATIONAL_SETTING_DEFAULTS) {
  const normalized = {};
  for (const key of STORE_OPERATIONAL_SETTING_KEYS) {
    if (patch[key] === undefined) continue;
    const str = String(patch[key]).trim();
    if (!/^-?\d+$/.test(str)) {
      return {
        error: {
          code: 'INVALID_VALUE',
          message: `${key} must be an integer between ${STORE_OPERATIONAL_NUMERIC_RULES[key].min} and ${STORE_OPERATIONAL_NUMERIC_RULES[key].max}`,
        },
      };
    }
    const num = Number(str);
    const rule = STORE_OPERATIONAL_NUMERIC_RULES[key];
    if (num < rule.min || num > rule.max) {
      return {
        error: {
          code: 'INVALID_VALUE',
          message: `${key} must be an integer between ${rule.min} and ${rule.max}`,
        },
      };
    }
    normalized[key] = String(num);
  }

  const effectiveOpen = Number(normalized.store_open_hour ?? currentValues.store_open_hour ?? STORE_OPERATIONAL_SETTING_DEFAULTS.store_open_hour);
  const effectiveClose = Number(normalized.store_close_hour ?? currentValues.store_close_hour ?? STORE_OPERATIONAL_SETTING_DEFAULTS.store_close_hour);
  if (effectiveClose <= effectiveOpen) {
    return {
      error: {
        code: 'INVALID_VALUE',
        message: `store_close_hour (${effectiveClose}) must be greater than store_open_hour (${effectiveOpen})`,
      },
    };
  }

  return { normalized };
}

function parseTrackingEnabledInput(value) {
  if (typeof value === 'boolean') return value ? '1' : '0';
  const raw = String(value).trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'on') return '1';
  if (raw === '0' || raw === 'false' || raw === 'off') return '0';
  return null;
}

function parseBooleanSettingInput(value) {
  if (typeof value === 'boolean') return value ? '1' : '0';
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'on') return '1';
  if (raw === '0' || raw === 'false' || raw === 'off') return '0';
  return null;
}

function getGlobalEmailSettingsForResponse() {
  const out = {};
  for (const key of GLOBAL_EMAIL_SETTING_KEYS) {
    out[key] = getSetting(key, GLOBAL_EMAIL_SETTING_DEFAULTS[key] || '');
  }
  const storedEnc = String(getSetting('smtp_pass_enc', '') || '').trim();
  out.smtp_pass_configured = storedEnc ? '1' : '0';
  return out;
}

function parseEmailSettingsPatch(patch = {}) {
  const normalized = {};
  if (patch.public_app_base_url !== undefined) {
    normalized.public_app_base_url = String(patch.public_app_base_url || '').trim();
  }
  const rawMode = patch.email_delivery_mode;
  if (rawMode !== undefined) {
    const mode = String(rawMode || '').trim().toLowerCase();
    if (mode !== '' && mode !== 'webhook' && mode !== 'smtp') {
      return { error: { code: 'INVALID_VALUE', message: 'email_delivery_mode must be empty, webhook, or smtp' } };
    }
    normalized.email_delivery_mode = mode;
  }

  if (patch.email_notification_webhook_url !== undefined) {
    normalized.email_notification_webhook_url = String(patch.email_notification_webhook_url || '').trim();
  }
  if (patch.smtp_host !== undefined) normalized.smtp_host = String(patch.smtp_host || '').trim();
  if (patch.smtp_user !== undefined) normalized.smtp_user = String(patch.smtp_user || '').trim();
  if (patch.email_from_name !== undefined) normalized.email_from_name = String(patch.email_from_name || '').trim();
  if (patch.email_from_address !== undefined) normalized.email_from_address = String(patch.email_from_address || '').trim();

  if (patch.smtp_port !== undefined) {
    const str = String(patch.smtp_port || '').trim();
    if (!/^\d+$/.test(str)) {
      return { error: { code: 'INVALID_VALUE', message: 'smtp_port must be an integer between 1 and 65535' } };
    }
    const n = Number(str);
    if (n < 1 || n > 65535) {
      return { error: { code: 'INVALID_VALUE', message: 'smtp_port must be an integer between 1 and 65535' } };
    }
    normalized.smtp_port = String(n);
  }

  if (patch.smtp_use_tls !== undefined) {
    const parsed = parseBooleanSettingInput(patch.smtp_use_tls);
    if (parsed === null) return { error: { code: 'INVALID_VALUE', message: 'smtp_use_tls must be true/false or 1/0' } };
    normalized.smtp_use_tls = parsed;
  }
  if (patch.smtp_use_ssl !== undefined) {
    const parsed = parseBooleanSettingInput(patch.smtp_use_ssl);
    if (parsed === null) return { error: { code: 'INVALID_VALUE', message: 'smtp_use_ssl must be true/false or 1/0' } };
    normalized.smtp_use_ssl = parsed;
  }

  let smtpPassEncUpdate;
  if (patch.smtp_password !== undefined) {
    // Normalize accidental whitespace (common when pasting Gmail app passwords in groups).
    const next = String(patch.smtp_password || '');
    const normalizedPass = next.replace(/\s+/g, '').trim();
    smtpPassEncUpdate = normalizedPass ? encryptSettingSecret(normalizedPass) : '';
  }
  return { normalized, smtpPassEncUpdate };
}

function getPublicAppBaseUrlSetting() {
  const configured = String(getSetting('public_app_base_url', GLOBAL_EMAIL_SETTING_DEFAULTS.public_app_base_url || '') || '').trim();
  return configured || PUBLIC_APP_BASE_URL || 'http://localhost:5173';
}

function isAuthDeviceChallengeEnabled() {
  const raw = getSetting(
    'auth_device_challenge_enabled',
    GLOBAL_SECURITY_SETTING_DEFAULTS.auth_device_challenge_enabled
  );
  const normalized = String(raw || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'on';
}

function isAuthRequireVerifiedForSensitive() {
  const raw = getSetting(
    'auth_require_verified_for_sensitive',
    GLOBAL_SECURITY_SETTING_DEFAULTS.auth_require_verified_for_sensitive
  );
  const normalized = String(raw || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'on';
}

function parseDoorLineCoordsInput(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const parts = raw.split(',').map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [x1, y1, x2, y2] = parts;
  if (x1 === x2 && y1 === y2) return null;
  return `${x1},${y1},${x2},${y2}`;
}

function parseFlowGapThresholdInput(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const intVal = Math.round(n);
  if (intVal < 1 || intVal > 100) return null;
  return String(intVal);
}

function parseRolloutStableDaysInput(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const intVal = Math.round(n);
  if (intVal < 1 || intVal > 30) return null;
  return String(intVal);
}

function parseRolloutMinDailyLegacyFlowInput(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const intVal = Math.round(n);
  if (intVal < 1 || intVal > 5000) return null;
  return String(intVal);
}

function getAnalyticsTrackingConfig(storeId = null) {
  const cameraUrlRaw = getSetting('analytics_camera_url', ANALYTICS_TRACKING_CONFIG_DEFAULTS.camera_url, storeId);
  const enabledRaw = getSetting('analytics_tracking_enabled', ANALYTICS_TRACKING_CONFIG_DEFAULTS.tracking_enabled, storeId);
  const coordsRaw = getSetting('analytics_door_line_coords', ANALYTICS_TRACKING_CONFIG_DEFAULTS.door_line_coords, storeId);
  const directionRaw = getSetting('analytics_door_line_direction', ANALYTICS_TRACKING_CONFIG_DEFAULTS.door_line_direction, storeId);
  const metricsDefaultRaw = getSetting('analytics_metrics_default', ANALYTICS_TRACKING_CONFIG_DEFAULTS.metrics_default, storeId);
  const flowGapThresholdRaw = getSetting('analytics_flow_gap_threshold_pct', ANALYTICS_TRACKING_CONFIG_DEFAULTS.flow_gap_threshold_pct, storeId);
  const rolloutStableDaysRaw = getSetting('analytics_rollout_stable_days', ANALYTICS_TRACKING_CONFIG_DEFAULTS.rollout_stable_days, storeId);
  const rolloutMinDailyLegacyFlowRaw = getSetting('analytics_rollout_min_daily_legacy_flow', ANALYTICS_TRACKING_CONFIG_DEFAULTS.rollout_min_daily_legacy_flow, storeId);
  const direction = ANALYTICS_TRACKING_DIRECTION_ALLOWED.has(String(directionRaw))
    ? String(directionRaw)
    : ANALYTICS_TRACKING_CONFIG_DEFAULTS.door_line_direction;
  const metricsDefault = ANALYTICS_METRICS_DEFAULT_ALLOWED.has(String(metricsDefaultRaw))
    ? String(metricsDefaultRaw)
    : ANALYTICS_TRACKING_CONFIG_DEFAULTS.metrics_default;
  const flowGapThreshold = parseInt(String(flowGapThresholdRaw), 10);
  const rolloutStableDays = parseInt(String(rolloutStableDaysRaw), 10);
  const rolloutMinDailyLegacyFlow = parseInt(String(rolloutMinDailyLegacyFlowRaw), 10);
  const enabled = String(enabledRaw).trim().toLowerCase();
  return {
    camera_url: String(cameraUrlRaw || ''),
    tracking_enabled: enabled === '1' || enabled === 'true' || enabled === 'on',
    door_line_coords: String(coordsRaw || ''),
    door_line_direction: direction,
    metrics_default: metricsDefault,
    flow_gap_threshold_pct: Number.isFinite(flowGapThreshold) && flowGapThreshold >= 1 && flowGapThreshold <= 100
      ? flowGapThreshold
      : parseInt(ANALYTICS_TRACKING_CONFIG_DEFAULTS.flow_gap_threshold_pct, 10),
    rollout_stable_days: Number.isFinite(rolloutStableDays) && rolloutStableDays >= 1 && rolloutStableDays <= 30
      ? rolloutStableDays
      : parseInt(ANALYTICS_TRACKING_CONFIG_DEFAULTS.rollout_stable_days, 10),
    rollout_min_daily_legacy_flow: Number.isFinite(rolloutMinDailyLegacyFlow) && rolloutMinDailyLegacyFlow >= 1 && rolloutMinDailyLegacyFlow <= 5000
      ? rolloutMinDailyLegacyFlow
      : parseInt(ANALYTICS_TRACKING_CONFIG_DEFAULTS.rollout_min_daily_legacy_flow, 10),
  };
}

function getAnalyticsScopeKey(storeId = null) {
  return storeId || '__global__';
}

function toIsoDateUtc(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function getRecentIsoDatesInclusive(endIsoDate, count) {
  const out = [];
  const end = new Date(`${endIsoDate}T00:00:00.000Z`);
  if (Number.isNaN(end.getTime()) || count < 1) return out;
  for (let i = 0; i < count; i += 1) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function upsertStoreOperationalSettings(storeId, normalizedUpdates = {}) {
  const upsertScoped = db.prepare("INSERT INTO store_settings_by_store (store_id, key, value, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at");
  const tx = db.transaction((entries) => {
    for (const [key, value] of entries) {
      if (STORE_OPERATIONAL_SETTING_KEYS.includes(key)) {
        upsertScoped.run(storeId, key, String(value));
      }
    }
  });
  tx(Object.entries(normalizedUpdates));
}

// GET /api/v1/settings - Get all store settings (manager+)
app.get('/api/v1/settings', roleGuard('admin', 'store_manager'), (req, res) => {
  const scopedStoreId = settingsScopeFromRequest(req);
  const base = {
    ...STORE_OPERATIONAL_SETTING_DEFAULTS,
    ...getAllSettings(scopedStoreId),
  };
  const settings = req.user.role === 'admin'
    ? {
      ...base,
      ...GLOBAL_SECURITY_SETTING_DEFAULTS,
      ...GLOBAL_EMAIL_SETTING_DEFAULTS,
      ...getGlobalEmailSettingsForResponse(),
    }
    : base;
  delete settings.smtp_pass_enc;
  res.json(apiResponse(settings));
});

// PUT /api/v1/settings - Update store settings (manager+)
app.put('/api/v1/settings', roleGuard('admin', 'store_manager'), (req, res) => {
  const allowed = [...STORE_OPERATIONAL_SETTING_KEYS];
  const updates = req.body;
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'Request body must be an object of key-value pairs' }));
  }

  const scopedStoreId = settingsScopeFromRequest(req);
  const validation = validateOperationalSettingsPatch(updates, getStoreOperationalSettings(scopedStoreId));
  if (validation.error) {
    return res.status(400).json(apiResponse(null, validation.error));
  }
  const normalizedUpdates = validation.normalized;
  const securityUpdates = {};
  for (const key of GLOBAL_SECURITY_SETTING_KEYS) {
    if (updates[key] === undefined) continue;
    const parsed = parseBooleanSettingInput(updates[key]);
    if (parsed === null) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_VALUE', message: `${key} must be true/false or 1/0` }));
    }
    securityUpdates[key] = parsed;
  }
  if (Object.keys(securityUpdates).length > 0 && req.user.role !== 'admin') {
    return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Only admin can update security settings' }));
  }
  const emailPatch = parseEmailSettingsPatch(updates);
  if (emailPatch.error) {
    return res.status(400).json(apiResponse(null, emailPatch.error));
  }
  const emailUpdates = emailPatch.normalized || {};
  const smtpPassEncUpdate = emailPatch.smtpPassEncUpdate;
  if ((Object.keys(emailUpdates).length > 0 || smtpPassEncUpdate !== undefined) && req.user.role !== 'admin') {
    return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Only admin can update email settings' }));
  }

  const upsertGlobal = db.prepare("INSERT INTO store_settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at");
  const upsertScoped = db.prepare("INSERT INTO store_settings_by_store (store_id, key, value, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at");
  const upsertMany = db.transaction((entries) => {
    for (const [key, value] of entries) {
      if (allowed.includes(key)) {
        if (scopedStoreId) {
          upsertScoped.run(scopedStoreId, key, String(value));
        } else {
          upsertGlobal.run(key, String(value));
        }
      }
    }
    for (const [key, value] of Object.entries(securityUpdates)) {
      upsertGlobal.run(key, String(value));
    }
    for (const [key, value] of Object.entries(emailUpdates)) {
      upsertGlobal.run(key, String(value));
    }
    if (smtpPassEncUpdate !== undefined) {
      if (smtpPassEncUpdate) upsertGlobal.run('smtp_pass_enc', smtpPassEncUpdate);
      else db.prepare('DELETE FROM store_settings WHERE key = ?').run('smtp_pass_enc');
    }
  });
  upsertMany(Object.entries(normalizedUpdates));

  // Return updated settings
  const base = {
    ...STORE_OPERATIONAL_SETTING_DEFAULTS,
    ...getAllSettings(scopedStoreId),
  };
  const settings = req.user.role === 'admin'
    ? {
      ...base,
      ...GLOBAL_SECURITY_SETTING_DEFAULTS,
      ...GLOBAL_EMAIL_SETTING_DEFAULTS,
      ...getGlobalEmailSettingsForResponse(),
    }
    : base;
  delete settings.smtp_pass_enc;
  res.json(apiResponse(settings));
});

// POST /api/v1/settings/email/test - send test email (admin only)
app.post('/api/v1/settings/email/test', roleGuard('admin'), async (req, res) => {
  try {
    const to = String(req.body?.to || req.user?.email || '').trim().toLowerCase();
    if (!to) {
      return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'Recipient email is required' }));
    }
    const payload = {
      subject: 'UnforgettableRides email configuration test',
      message: 'This is a test email from UnforgettableRides dashboard settings.',
    };
    const emailConfig = getRuntimeEmailConfig();
    const useWebhook = emailConfig.mode === 'webhook' || (!emailConfig.mode && !!emailConfig.webhookUrl);
    const useSmtp = emailConfig.mode === 'smtp' || (!emailConfig.mode && !!emailConfig.smtpHost);

    if (useWebhook && emailConfig.webhookUrl) {
      try {
        await axios.post(emailConfig.webhookUrl, {
          kind: 'email_test',
          channel: 'email',
          to,
          payload,
        }, { timeout: 5000 });
        return res.json(apiResponse({ sent: true, to }));
      } catch (err) {
        const message = String(err?.response?.data?.error?.message || err?.message || 'Email webhook test failed');
        return res.status(400).json(apiResponse(null, { code: 'EMAIL_WEBHOOK_TEST_FAILED', message }));
      }
    }

    if (useSmtp) {
      const transporter = getSmtpTransporter(emailConfig);
      if (!transporter) {
        return res.status(400).json(apiResponse(null, {
          code: 'EMAIL_NOT_CONFIGURED',
          message: 'SMTP is selected but host/user/password are not fully configured.',
        }));
      }
      try {
        await transporter.verify();
      } catch (err) {
        const message = String(err?.response || err?.message || 'SMTP verify failed');
        return res.status(400).json(apiResponse(null, { code: 'SMTP_VERIFY_FAILED', message }));
      }

      try {
        const from = emailConfig.fromAddress
          ? (emailConfig.fromName ? `"${emailConfig.fromName}" <${emailConfig.fromAddress}>` : emailConfig.fromAddress)
          : emailConfig.smtpUser;
        await transporter.sendMail({
          from,
          to,
          subject: payload.subject,
          text: payload.message,
        });
        return res.json(apiResponse({ sent: true, to }));
      } catch (err) {
        const message = String(err?.response || err?.message || 'SMTP send failed');
        return res.status(400).json(apiResponse(null, { code: 'SMTP_SEND_FAILED', message }));
      }
    }

    return res.status(400).json(apiResponse(null, {
      code: 'EMAIL_NOT_CONFIGURED',
      message: 'Email provider is not configured. Set SMTP or Webhook mode and save.',
    }));
  } catch (err) {
    return res.status(500).json(apiResponse(null, { code: 'SERVER_ERROR', message: err.message || 'Failed to send test email' }));
  }
});

// GET /api/v1/stores - list stores for scope selection
app.get('/api/v1/stores', roleGuard('admin', 'store_manager', 'staff', 'customer', 'business_member'), (req, res) => {
  const includeInactive = String(req.query.include_inactive || 'false') === 'true';
  if (req.user.role === 'customer' || req.user.role === 'business_member') {
    const rows = db.prepare(`
      SELECT *
      FROM stores
      WHERE is_active = 1
      ORDER BY name ASC
    `).all();
    return res.json(apiResponse(rows.map((row) => ({ ...row, ...getStoreOperationalSettings(row.id) }))));
  }

  if (req.user.role === 'admin') {
    let sql = 'SELECT * FROM stores WHERE 1=1';
    const params = [];
    if (!includeInactive) {
      sql += ' AND is_active = 1';
    }
    const scopedStoreId = normalizeStoreId(req.query.store_id);
    if (scopedStoreId) {
      sql += ' AND id = ?';
      params.push(scopedStoreId);
    }
    sql += ' ORDER BY name ASC';
    const rows = db.prepare(sql).all(...params);
    return res.json(apiResponse(rows.map((row) => ({ ...row, ...getStoreOperationalSettings(row.id) }))));
  }

  const assignedIds = getUserScopedStoreIds(req);
  if (assignedIds.length === 0) {
    return res.json(apiResponse([]));
  }
  const placeholders = assignedIds.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT *
    FROM stores
    WHERE id IN (${placeholders})
      AND (? OR is_active = 1)
    ORDER BY name ASC
  `).all(...assignedIds, includeInactive ? 1 : 0);
  return res.json(apiResponse(rows.map((row) => ({ ...row, ...getStoreOperationalSettings(row.id) }))));
});

// GET /api/v1/stores/:id/services - list active services for a store
app.get('/api/v1/stores/:id/services', roleGuard('admin', 'store_manager', 'staff', 'customer', 'business_member'), (req, res) => {
  const storeId = normalizeStoreId(req.params.id);
  if (!storeId) {
    return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Valid store id is required' }));
  }
  if (!canAccessStoreScopedRecord(req, storeId)) {
    return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Store access denied' }));
  }
  const store = db.prepare('SELECT id, is_active FROM stores WHERE id = ?').get(storeId);
  if (!store || !store.is_active) {
    return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Store not found' }));
  }
  const isManager = req.user?.role === 'admin' || req.user?.role === 'store_manager';
  const includeInactive = isManager && req.query.include_inactive === 'true';
  const rows = db.prepare(`
    SELECT *
    FROM store_services
    WHERE store_id = ?${includeInactive ? '' : ' AND is_active = 1'}
    ORDER BY sort_order ASC, created_at ASC
  `).all(storeId);
  return res.json(apiResponse(rows.map((row) => {
    const { size_variants_json, ...rest } = row;
    return {
      ...rest,
      size_variants: parseJsonArrayField(size_variants_json),
    };
  })));
});

// GET /api/v1/stores/:id/membership-plans - list active membership plans for a store
app.get('/api/v1/stores/:id/membership-plans', roleGuard('admin', 'store_manager', 'staff', 'customer', 'business_member'), (req, res) => {
  const storeId = normalizeStoreId(req.params.id);
  if (!storeId) {
    return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Valid store id is required' }));
  }
  if (!canAccessStoreScopedRecord(req, storeId)) {
    return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Store access denied' }));
  }
  const store = db.prepare('SELECT id, is_active FROM stores WHERE id = ?').get(storeId);
  if (!store || !store.is_active) {
    return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Store not found' }));
  }
  const isManager = req.user?.role === 'admin' || req.user?.role === 'store_manager';
  const includeInactive = isManager && req.query.include_inactive === 'true';
  const rows = db.prepare(`
    SELECT *
    FROM store_membership_plans
    WHERE store_id = ?${includeInactive ? '' : ' AND is_active = 1'}
    ORDER BY sort_order ASC, created_at ASC
  `).all(storeId);
  return res.json(apiResponse(rows.map((row) => {
    const { included_service_types_json, perks_json, ...rest } = row;
    return {
      ...rest,
      included_service_types: parseJsonArrayField(included_service_types_json),
      perks: parseJsonArrayField(perks_json),
    };
  })));
});

// GET /api/v1/stores/:id/promotions - list currently active promotions for a store
app.get('/api/v1/stores/:id/promotions', roleGuard('admin', 'store_manager', 'staff', 'customer', 'business_member'), (req, res) => {
  const storeId = normalizeStoreId(req.params.id);
  if (!storeId) {
    return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Valid store id is required' }));
  }
  if (!canAccessStoreScopedRecord(req, storeId)) {
    return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Store access denied' }));
  }
  const store = db.prepare('SELECT id, is_active FROM stores WHERE id = ?').get(storeId);
  if (!store || !store.is_active) {
    return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Store not found' }));
  }
  const isManager = req.user?.role === 'admin' || req.user?.role === 'store_manager';
  const includeInactive = isManager && req.query.include_inactive === 'true';
  const rows = db.prepare(includeInactive
    ? `SELECT * FROM store_promotions WHERE store_id = ? ORDER BY priority DESC, created_at DESC`
    : `SELECT * FROM store_promotions WHERE store_id = ? AND is_active = 1 AND valid_from <= datetime('now') AND valid_until >= datetime('now') ORDER BY priority DESC, created_at DESC`
  ).all(storeId);
  return res.json(apiResponse(rows.map((row) => {
    const { applies_to_service_ids_json, ...rest } = row;
    return {
      ...rest,
      applies_to_service_ids: parseJsonArrayField(applies_to_service_ids_json),
    };
  })));
});

// POST /api/v1/stores/:id/services - create service (admin/store_manager)
app.post('/api/v1/stores/:id/services', roleGuard('admin', 'store_manager'), (req, res) => {
  const storeId = normalizeStoreId(req.params.id);
  if (!storeId) return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Valid store id is required' }));
  if (!canAccessStoreScopedRecord(req, storeId)) {
    return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Store access denied' }));
  }
  const store = db.prepare('SELECT id FROM stores WHERE id = ? AND is_active = 1').get(storeId);
  if (!store) return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Store not found' }));

  const name = String(req.body?.name || '').trim();
  const serviceType = String(req.body?.service_type || '').trim();
  const category = String(req.body?.category || serviceType || '').trim();
  const description = String(req.body?.description || '').trim() || null;
  const basePriceCents = parseNullableInt(req.body?.base_price_cents);
  const memberPriceCents = parseNullableInt(req.body?.member_price_cents);
  const priceOnAssessment = parseBoolInt(req.body?.price_on_assessment, 0);
  const durationMinutes = parseNullableInt(req.body?.duration_minutes);
  const requiresPriorSession = parseBoolInt(req.body?.requires_prior_session, 0);
  const sortOrder = parseRequiredInt(req.body?.sort_order) ?? 0;
  const sizeVariants = Array.isArray(req.body?.size_variants) ? req.body.size_variants : [];

  if (!name || !serviceType) {
    return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'name and service_type are required' }));
  }
  if (!priceOnAssessment && (basePriceCents === null || basePriceCents < 0)) {
    return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'base_price_cents is required when price_on_assessment is false' }));
  }
  if (memberPriceCents !== null && memberPriceCents < 0) {
    return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'member_price_cents must be >= 0' }));
  }
  if (durationMinutes !== null && durationMinutes <= 0) {
    return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'duration_minutes must be > 0' }));
  }
  const id = uuidv4();
  db.prepare(`
    INSERT INTO store_services
    (id, store_id, service_type, name, category, description, base_price_cents, member_price_cents, price_on_assessment, size_variants_json, duration_minutes, requires_prior_session, is_active, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))
  `).run(
    id,
    storeId,
    serviceType,
    name,
    category,
    description,
    priceOnAssessment ? null : basePriceCents,
    memberPriceCents,
    priceOnAssessment,
    JSON.stringify(sizeVariants),
    durationMinutes,
    requiresPriorSession,
    sortOrder
  );
  const row = db.prepare('SELECT * FROM store_services WHERE id = ?').get(id);
  const { size_variants_json, ...rest } = row;
  return res.status(201).json(apiResponse({ ...rest, size_variants: parseJsonArrayField(size_variants_json) }));
});

// PUT /api/v1/stores/:id/services/:sid - update service (admin/store_manager)
app.put('/api/v1/stores/:id/services/:sid', roleGuard('admin', 'store_manager'), (req, res) => {
  const storeId = normalizeStoreId(req.params.id);
  const serviceId = String(req.params.sid || '').trim();
  if (!storeId || !serviceId) return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Valid store and service id are required' }));
  if (!canAccessStoreScopedRecord(req, storeId)) {
    return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Store access denied' }));
  }
  const existing = db.prepare('SELECT * FROM store_services WHERE id = ? AND store_id = ?').get(serviceId, storeId);
  if (!existing) return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Service not found' }));

  const updates = [];
  const params = [];
  const setField = (key, val) => { updates.push(`${key} = ?`); params.push(val); };
  if (req.body?.name !== undefined) {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'name cannot be empty' }));
    setField('name', name);
  }
  if (req.body?.service_type !== undefined) setField('service_type', String(req.body.service_type || '').trim());
  if (req.body?.category !== undefined) setField('category', String(req.body.category || '').trim());
  if (req.body?.description !== undefined) setField('description', String(req.body.description || '').trim() || null);
  if (req.body?.base_price_cents !== undefined) {
    const n = parseNullableInt(req.body.base_price_cents);
    if (n === null || n < 0) return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'base_price_cents must be >= 0' }));
    setField('base_price_cents', n);
  }
  if (req.body?.member_price_cents !== undefined) {
    const n = parseNullableInt(req.body.member_price_cents);
    if (n !== null && n < 0) return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'member_price_cents must be >= 0' }));
    setField('member_price_cents', n);
  }
  if (req.body?.price_on_assessment !== undefined) setField('price_on_assessment', parseBoolInt(req.body.price_on_assessment, 0));
  if (req.body?.duration_minutes !== undefined) {
    const n = parseNullableInt(req.body.duration_minutes);
    if (n !== null && n <= 0) return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'duration_minutes must be > 0' }));
    setField('duration_minutes', n);
  }
  if (req.body?.requires_prior_session !== undefined) setField('requires_prior_session', parseBoolInt(req.body.requires_prior_session, 0));
  if (req.body?.is_active !== undefined) setField('is_active', parseBoolInt(req.body.is_active, 1));
  if (req.body?.sort_order !== undefined) setField('sort_order', parseRequiredInt(req.body.sort_order) ?? 0);
  if (req.body?.size_variants !== undefined) {
    setField('size_variants_json', JSON.stringify(Array.isArray(req.body.size_variants) ? req.body.size_variants : []));
  }
  if (updates.length === 0) {
    return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'No valid fields to update' }));
  }
  updates.push("updated_at = datetime('now')");
  params.push(serviceId, storeId);
  db.prepare(`UPDATE store_services SET ${updates.join(', ')} WHERE id = ? AND store_id = ?`).run(...params);
  const row = db.prepare('SELECT * FROM store_services WHERE id = ? AND store_id = ?').get(serviceId, storeId);
  const { size_variants_json, ...rest } = row;
  return res.json(apiResponse({ ...rest, size_variants: parseJsonArrayField(size_variants_json) }));
});

// DELETE /api/v1/stores/:id/services/:sid - deactivate service (soft delete)
app.delete('/api/v1/stores/:id/services/:sid', roleGuard('admin', 'store_manager'), (req, res) => {
  const storeId = normalizeStoreId(req.params.id);
  const serviceId = String(req.params.sid || '').trim();
  if (!storeId || !serviceId) return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Valid store and service id are required' }));
  if (!canAccessStoreScopedRecord(req, storeId)) {
    return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Store access denied' }));
  }
  const existing = db.prepare('SELECT id FROM store_services WHERE id = ? AND store_id = ?').get(serviceId, storeId);
  if (!existing) return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Service not found' }));
  db.prepare("UPDATE store_services SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND store_id = ?").run(serviceId, storeId);
  return res.json(apiResponse({ id: serviceId, deleted: true }));
});

// POST /api/v1/stores/:id/membership-plans - create plan (admin/store_manager)
app.post('/api/v1/stores/:id/membership-plans', roleGuard('admin', 'store_manager'), (req, res) => {
  const storeId = normalizeStoreId(req.params.id);
  if (!storeId) return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Valid store id is required' }));
  if (!canAccessStoreScopedRecord(req, storeId)) {
    return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Store access denied' }));
  }
  const store = db.prepare('SELECT id FROM stores WHERE id = ? AND is_active = 1').get(storeId);
  if (!store) return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Store not found' }));

  const name = String(req.body?.name || '').trim();
  const description = String(req.body?.description || '').trim() || null;
  const monthly = parseRequiredInt(req.body?.price_monthly_cents);
  const yearly = parseNullableInt(req.body?.price_yearly_cents);
  const included = Array.isArray(req.body?.included_service_types) ? req.body.included_service_types : [];
  const perks = Array.isArray(req.body?.perks) ? req.body.perks : [];
  const highlighted = parseBoolInt(req.body?.is_highlighted, 0);
  const sortOrder = parseRequiredInt(req.body?.sort_order) ?? 0;
  if (!name || monthly === null || monthly < 0) {
    return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'name and price_monthly_cents >= 0 are required' }));
  }
  if (yearly !== null && yearly < 0) {
    return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'price_yearly_cents must be >= 0' }));
  }
  const id = uuidv4();
  db.prepare(`
    INSERT INTO store_membership_plans
    (id, store_id, name, description, price_monthly_cents, price_yearly_cents, included_service_types_json, perks_json, is_highlighted, is_active, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))
  `).run(id, storeId, name, description, monthly, yearly, JSON.stringify(included), JSON.stringify(perks), highlighted, sortOrder);
  const row = db.prepare('SELECT * FROM store_membership_plans WHERE id = ?').get(id);
  const { included_service_types_json, perks_json, ...rest } = row;
  return res.status(201).json(apiResponse({ ...rest, included_service_types: parseJsonArrayField(included_service_types_json), perks: parseJsonArrayField(perks_json) }));
});

// PUT /api/v1/stores/:id/membership-plans/:pid - update plan
app.put('/api/v1/stores/:id/membership-plans/:pid', roleGuard('admin', 'store_manager'), (req, res) => {
  const storeId = normalizeStoreId(req.params.id);
  const planId = String(req.params.pid || '').trim();
  if (!storeId || !planId) return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Valid store and plan id are required' }));
  if (!canAccessStoreScopedRecord(req, storeId)) {
    return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Store access denied' }));
  }
  const existing = db.prepare('SELECT * FROM store_membership_plans WHERE id = ? AND store_id = ?').get(planId, storeId);
  if (!existing) return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Membership plan not found' }));
  const updates = [];
  const params = [];
  const setField = (key, val) => { updates.push(`${key} = ?`); params.push(val); };
  if (req.body?.name !== undefined) {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'name cannot be empty' }));
    setField('name', name);
  }
  if (req.body?.description !== undefined) setField('description', String(req.body.description || '').trim() || null);
  if (req.body?.price_monthly_cents !== undefined) {
    const n = parseRequiredInt(req.body.price_monthly_cents);
    if (n === null || n < 0) return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'price_monthly_cents must be >= 0' }));
    setField('price_monthly_cents', n);
  }
  if (req.body?.price_yearly_cents !== undefined) {
    const n = parseNullableInt(req.body.price_yearly_cents);
    if (n !== null && n < 0) return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'price_yearly_cents must be >= 0' }));
    setField('price_yearly_cents', n);
  }
  if (req.body?.included_service_types !== undefined) {
    setField('included_service_types_json', JSON.stringify(Array.isArray(req.body.included_service_types) ? req.body.included_service_types : []));
  }
  if (req.body?.perks !== undefined) {
    setField('perks_json', JSON.stringify(Array.isArray(req.body.perks) ? req.body.perks : []));
  }
  if (req.body?.is_highlighted !== undefined) setField('is_highlighted', parseBoolInt(req.body.is_highlighted, 0));
  if (req.body?.is_active !== undefined) setField('is_active', parseBoolInt(req.body.is_active, 1));
  if (req.body?.sort_order !== undefined) setField('sort_order', parseRequiredInt(req.body.sort_order) ?? 0);
  if (updates.length === 0) {
    return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'No valid fields to update' }));
  }
  updates.push("updated_at = datetime('now')");
  params.push(planId, storeId);
  db.prepare(`UPDATE store_membership_plans SET ${updates.join(', ')} WHERE id = ? AND store_id = ?`).run(...params);
  const row = db.prepare('SELECT * FROM store_membership_plans WHERE id = ? AND store_id = ?').get(planId, storeId);
  const { included_service_types_json, perks_json, ...rest } = row;
  return res.json(apiResponse({ ...rest, included_service_types: parseJsonArrayField(included_service_types_json), perks: parseJsonArrayField(perks_json) }));
});

// DELETE /api/v1/stores/:id/membership-plans/:pid - deactivate plan
app.delete('/api/v1/stores/:id/membership-plans/:pid', roleGuard('admin', 'store_manager'), (req, res) => {
  const storeId = normalizeStoreId(req.params.id);
  const planId = String(req.params.pid || '').trim();
  if (!storeId || !planId) return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Valid store and plan id are required' }));
  if (!canAccessStoreScopedRecord(req, storeId)) {
    return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Store access denied' }));
  }
  const existing = db.prepare('SELECT id FROM store_membership_plans WHERE id = ? AND store_id = ?').get(planId, storeId);
  if (!existing) return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Membership plan not found' }));
  db.prepare("UPDATE store_membership_plans SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND store_id = ?").run(planId, storeId);
  return res.json(apiResponse({ id: planId, deleted: true }));
});

// POST /api/v1/stores/:id/promotions - create promotion (admin/store_manager)
app.post('/api/v1/stores/:id/promotions', roleGuard('admin', 'store_manager'), (req, res) => {
  const storeId = normalizeStoreId(req.params.id);
  if (!storeId) return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Valid store id is required' }));
  if (!canAccessStoreScopedRecord(req, storeId)) {
    return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Store access denied' }));
  }
  const store = db.prepare('SELECT id FROM stores WHERE id = ? AND is_active = 1').get(storeId);
  if (!store) return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Store not found' }));

  const title = String(req.body?.title || '').trim();
  const description = String(req.body?.description || '').trim() || null;
  const type = String(req.body?.type || '').trim();
  const discountPercent = parseNullableInt(req.body?.discount_percent);
  const discountValueCents = parseNullableInt(req.body?.discount_value_cents);
  const maxDiscountCents = parseNullableInt(req.body?.max_discount_cents);
  const appliesToServiceIds = Array.isArray(req.body?.applies_to_service_ids) ? req.body.applies_to_service_ids : [];
  const eligibility = String(req.body?.eligibility || 'all').trim();
  const couponCode = String(req.body?.coupon_code || '').trim() || null;
  const isStackable = parseBoolInt(req.body?.is_stackable, 0);
  const priority = parseRequiredInt(req.body?.priority) ?? 0;
  const usageLimitTotal = parseNullableInt(req.body?.usage_limit_total);
  const usageLimitPerUser = parseNullableInt(req.body?.usage_limit_per_user);
  const validFrom = String(req.body?.valid_from || '').trim();
  const validUntil = String(req.body?.valid_until || '').trim();

  const allowedTypes = ['pct_off', 'fixed_off', 'free_service', 'info'];
  const allowedEligibility = ['all', 'members_only', 'new_customers'];
  if (!title || !allowedTypes.includes(type) || !allowedEligibility.includes(eligibility) || !validFrom || !validUntil) {
    return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'title, type, eligibility, valid_from, valid_until are required and must be valid' }));
  }
  if (type === 'pct_off' && (discountPercent === null || discountPercent < 0 || discountPercent > 100)) {
    return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'discount_percent must be 0..100 for pct_off' }));
  }
  if (type === 'fixed_off' && (discountValueCents === null || discountValueCents < 0)) {
    return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'discount_value_cents must be >= 0 for fixed_off' }));
  }
  const id = uuidv4();
  db.prepare(`
    INSERT INTO store_promotions
    (id, store_id, title, description, type, discount_percent, discount_value_cents, max_discount_cents, applies_to_service_ids_json, eligibility, coupon_code, is_stackable, priority, usage_limit_total, usage_limit_per_user, valid_from, valid_until, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
  `).run(
    id,
    storeId,
    title,
    description,
    type,
    discountPercent,
    discountValueCents,
    maxDiscountCents,
    JSON.stringify(appliesToServiceIds),
    eligibility,
    couponCode,
    isStackable,
    priority,
    usageLimitTotal,
    usageLimitPerUser,
    validFrom,
    validUntil
  );
  const row = db.prepare('SELECT * FROM store_promotions WHERE id = ?').get(id);
  const { applies_to_service_ids_json, ...rest } = row;
  return res.status(201).json(apiResponse({ ...rest, applies_to_service_ids: parseJsonArrayField(applies_to_service_ids_json) }));
});

// PUT /api/v1/stores/:id/promotions/:pid - update promotion
app.put('/api/v1/stores/:id/promotions/:pid', roleGuard('admin', 'store_manager'), (req, res) => {
  const storeId = normalizeStoreId(req.params.id);
  const promotionId = String(req.params.pid || '').trim();
  if (!storeId || !promotionId) return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Valid store and promotion id are required' }));
  if (!canAccessStoreScopedRecord(req, storeId)) {
    return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Store access denied' }));
  }
  const existing = db.prepare('SELECT * FROM store_promotions WHERE id = ? AND store_id = ?').get(promotionId, storeId);
  if (!existing) return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Promotion not found' }));

  const updates = [];
  const params = [];
  const setField = (key, val) => { updates.push(`${key} = ?`); params.push(val); };
  if (req.body?.title !== undefined) {
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'title cannot be empty' }));
    setField('title', title);
  }
  if (req.body?.description !== undefined) setField('description', String(req.body.description || '').trim() || null);
  if (req.body?.type !== undefined) {
    const type = String(req.body.type || '').trim();
    if (!['pct_off', 'fixed_off', 'free_service', 'info'].includes(type)) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Invalid promotion type' }));
    }
    setField('type', type);
  }
  if (req.body?.discount_percent !== undefined) {
    const n = parseNullableInt(req.body.discount_percent);
    if (n !== null && (n < 0 || n > 100)) return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'discount_percent must be 0..100' }));
    setField('discount_percent', n);
  }
  if (req.body?.discount_value_cents !== undefined) {
    const n = parseNullableInt(req.body.discount_value_cents);
    if (n !== null && n < 0) return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'discount_value_cents must be >= 0' }));
    setField('discount_value_cents', n);
  }
  if (req.body?.max_discount_cents !== undefined) {
    const n = parseNullableInt(req.body.max_discount_cents);
    if (n !== null && n < 0) return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'max_discount_cents must be >= 0' }));
    setField('max_discount_cents', n);
  }
  if (req.body?.applies_to_service_ids !== undefined) {
    setField('applies_to_service_ids_json', JSON.stringify(Array.isArray(req.body.applies_to_service_ids) ? req.body.applies_to_service_ids : []));
  }
  if (req.body?.eligibility !== undefined) {
    const e = String(req.body.eligibility || '').trim();
    if (!['all', 'members_only', 'new_customers'].includes(e)) return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Invalid eligibility value' }));
    setField('eligibility', e);
  }
  if (req.body?.coupon_code !== undefined) setField('coupon_code', String(req.body.coupon_code || '').trim() || null);
  if (req.body?.is_stackable !== undefined) setField('is_stackable', parseBoolInt(req.body.is_stackable, 0));
  if (req.body?.priority !== undefined) setField('priority', parseRequiredInt(req.body.priority) ?? 0);
  if (req.body?.usage_limit_total !== undefined) setField('usage_limit_total', parseNullableInt(req.body.usage_limit_total));
  if (req.body?.usage_limit_per_user !== undefined) setField('usage_limit_per_user', parseNullableInt(req.body.usage_limit_per_user));
  if (req.body?.valid_from !== undefined) setField('valid_from', String(req.body.valid_from || '').trim());
  if (req.body?.valid_until !== undefined) setField('valid_until', String(req.body.valid_until || '').trim());
  if (req.body?.is_active !== undefined) setField('is_active', parseBoolInt(req.body.is_active, 1));
  if (updates.length === 0) {
    return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'No valid fields to update' }));
  }
  updates.push("updated_at = datetime('now')");
  params.push(promotionId, storeId);
  db.prepare(`UPDATE store_promotions SET ${updates.join(', ')} WHERE id = ? AND store_id = ?`).run(...params);
  const row = db.prepare('SELECT * FROM store_promotions WHERE id = ? AND store_id = ?').get(promotionId, storeId);
  const { applies_to_service_ids_json, ...rest } = row;
  return res.json(apiResponse({ ...rest, applies_to_service_ids: parseJsonArrayField(applies_to_service_ids_json) }));
});

// DELETE /api/v1/stores/:id/promotions/:pid - deactivate promotion
app.delete('/api/v1/stores/:id/promotions/:pid', roleGuard('admin', 'store_manager'), (req, res) => {
  const storeId = normalizeStoreId(req.params.id);
  const promotionId = String(req.params.pid || '').trim();
  if (!storeId || !promotionId) return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Valid store and promotion id are required' }));
  if (!canAccessStoreScopedRecord(req, storeId)) {
    return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Store access denied' }));
  }
  const existing = db.prepare('SELECT id FROM store_promotions WHERE id = ? AND store_id = ?').get(promotionId, storeId);
  if (!existing) return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Promotion not found' }));
  db.prepare("UPDATE store_promotions SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND store_id = ?").run(promotionId, storeId);
  return res.json(apiResponse({ id: promotionId, deleted: true }));
});

// POST /api/v1/stores - create store (admin only)
app.post('/api/v1/stores', roleGuard('admin'), (req, res) => {
  const name = String(req.body?.name || '').trim();
  const slugInput = String(req.body?.slug || '').trim();
  const address = String(req.body?.address || '').trim() || null;
  const phone = String(req.body?.phone || '').trim() || null;
  const email = String(req.body?.email || '').trim() || null;
  const timezone = String(req.body?.timezone || '').trim() || 'America/Los_Angeles';
  const operationalPatch = {
    store_open_hour: req.body?.store_open_hour,
    store_close_hour: req.body?.store_close_hour,
    max_concurrent_appointments: req.body?.max_concurrent_appointments,
    appointment_slot_minutes: req.body?.appointment_slot_minutes,
    appointment_max_active_per_customer: req.body?.appointment_max_active_per_customer,
    appointment_max_new_per_day: req.body?.appointment_max_new_per_day,
    appointment_max_new_per_7d: req.body?.appointment_max_new_per_7d,
    appointment_min_hours_between: req.body?.appointment_min_hours_between,
  };

  if (!name) {
    return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'name is required' }));
  }
  const normalizedSlug = normalizeStoreSlug(slugInput || name);
  if (!normalizedSlug || normalizedSlug.length < 2) {
    return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'slug is invalid' }));
  }
  const validation = validateOperationalSettingsPatch(operationalPatch, STORE_OPERATIONAL_SETTING_DEFAULTS);
  if (validation.error) {
    return res.status(400).json(apiResponse(null, validation.error));
  }

  const existingBySlug = db.prepare('SELECT id FROM stores WHERE slug = ?').get(normalizedSlug);
  if (existingBySlug) {
    return res.status(409).json(apiResponse(null, { code: 'DUPLICATE_SLUG', message: 'Store slug already exists' }));
  }

  let id = normalizeStoreId(req.body?.id) || `store-${normalizedSlug}`;
  if (db.prepare('SELECT id FROM stores WHERE id = ?').get(id)) {
    id = `store-${normalizedSlug}-${uuidv4().slice(0, 6)}`;
  }

  db.prepare(`
    INSERT INTO stores (id, name, slug, address, phone, email, timezone, is_active, settings_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, '{}', datetime('now'), datetime('now'))
  `).run(id, name, normalizedSlug, address, phone, email, timezone);
  upsertStoreOperationalSettings(id, validation.normalized);

  const created = db.prepare('SELECT * FROM stores WHERE id = ?').get(id);
  return res.status(201).json(apiResponse({ ...created, ...getStoreOperationalSettings(id) }));
});

// PUT /api/v1/stores/:id - update store (admin only)
app.put('/api/v1/stores/:id', roleGuard('admin'), (req, res) => {
  const storeId = normalizeStoreId(req.params.id);
  const existing = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId);
  if (!existing) {
    return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Store not found' }));
  }

  const updates = [];
  const params = [];

  if (req.body?.name !== undefined) {
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'name cannot be empty' }));
    }
    updates.push('name = ?');
    params.push(name);
  }

  if (req.body?.slug !== undefined) {
    const normalizedSlug = normalizeStoreSlug(req.body.slug);
    if (!normalizedSlug || normalizedSlug.length < 2) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'slug is invalid' }));
    }
    const duplicate = db.prepare('SELECT id FROM stores WHERE slug = ? AND id != ?').get(normalizedSlug, storeId);
    if (duplicate) {
      return res.status(409).json(apiResponse(null, { code: 'DUPLICATE_SLUG', message: 'Store slug already exists' }));
    }
    updates.push('slug = ?');
    params.push(normalizedSlug);
  }

  if (req.body?.address !== undefined) { updates.push('address = ?'); params.push(String(req.body.address || '').trim() || null); }
  if (req.body?.phone !== undefined) { updates.push('phone = ?'); params.push(String(req.body.phone || '').trim() || null); }
  if (req.body?.email !== undefined) { updates.push('email = ?'); params.push(String(req.body.email || '').trim() || null); }
  if (req.body?.timezone !== undefined) { updates.push('timezone = ?'); params.push(String(req.body.timezone || '').trim() || null); }
  if (req.body?.is_active !== undefined) { updates.push('is_active = ?'); params.push(req.body.is_active ? 1 : 0); }

  if (updates.length === 0) {
    const onlyOperational = STORE_OPERATIONAL_SETTING_KEYS.some((key) => req.body?.[key] !== undefined);
    if (!onlyOperational) {
      return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'No valid fields to update' }));
    }
  }

  const currentOperational = getStoreOperationalSettings(storeId);
  const validation = validateOperationalSettingsPatch({
    store_open_hour: req.body?.store_open_hour,
    store_close_hour: req.body?.store_close_hour,
    max_concurrent_appointments: req.body?.max_concurrent_appointments,
    appointment_slot_minutes: req.body?.appointment_slot_minutes,
    appointment_max_active_per_customer: req.body?.appointment_max_active_per_customer,
    appointment_max_new_per_day: req.body?.appointment_max_new_per_day,
    appointment_max_new_per_7d: req.body?.appointment_max_new_per_7d,
    appointment_min_hours_between: req.body?.appointment_min_hours_between,
  }, currentOperational);
  if (validation.error) {
    return res.status(400).json(apiResponse(null, validation.error));
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    params.push(storeId);
    db.prepare(`UPDATE stores SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
  upsertStoreOperationalSettings(storeId, validation.normalized);

  const updated = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId);
  return res.json(apiResponse({ ...updated, ...getStoreOperationalSettings(storeId) }));
});

// DELETE /api/v1/stores/:id - deactivate store (admin only)
app.delete('/api/v1/stores/:id', roleGuard('admin'), (req, res) => {
  const storeId = normalizeStoreId(req.params.id);
  const existing = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId);
  if (!existing) {
    return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Store not found' }));
  }

  if (!existing.is_active) {
    return res.json(apiResponse(existing));
  }

  const activeCount = db.prepare('SELECT COUNT(*) as count FROM stores WHERE is_active = 1').get().count;
  if (activeCount <= 1) {
    return res.status(409).json(apiResponse(null, { code: 'LAST_ACTIVE_STORE', message: 'Cannot deactivate the last active store' }));
  }

  db.prepare("UPDATE stores SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(storeId);
  const updated = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId);
  return res.json(apiResponse(updated));
});

// ============================================================================
// Business Membership API
// ============================================================================

app.post('/api/v1/business-memberships/apply', roleGuard('customer'), (req, res) => {
  const user = db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'User not found' }));
  }

  const existingMembership = db.prepare('SELECT id FROM business_memberships WHERE user_id = ?').get(req.user.id);
  if (existingMembership) {
    return res.status(409).json(apiResponse(null, { code: 'ALREADY_BUSINESS_MEMBER', message: 'Business membership already exists' }));
  }
  const pending = db.prepare(`
    SELECT id FROM business_member_applications
    WHERE user_id = ? AND status = 'pending'
    LIMIT 1
  `).get(req.user.id);
  if (pending) {
    return res.status(409).json(apiResponse(null, { code: 'ALREADY_APPLIED', message: 'Pending application already exists' }));
  }

  const applicantPhone = String(req.body?.applicant_phone || '').trim() || null;
  const shopName = String(req.body?.shop_name || '').trim() || null;
  const city = String(req.body?.city || '').trim() || null;
  const message = String(req.body?.message || '').trim() || null;
  const applicantName = String(req.body?.applicant_name || '').trim() || user.name;

  const id = uuidv4();
  db.prepare(`
    INSERT INTO business_member_applications
    (id, user_id, applicant_name, applicant_phone, shop_name, city, message, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
  `).run(id, req.user.id, applicantName, applicantPhone, shopName, city, message);

  const created = db.prepare('SELECT * FROM business_member_applications WHERE id = ?').get(id);
  return res.status(201).json(apiResponse(created));
});

app.get('/api/v1/business-memberships/my-application', roleGuard('customer', 'business_member'), (req, res) => {
  const row = db.prepare(`
    SELECT *
    FROM business_member_applications
    WHERE user_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get(req.user.id) || null;
  res.json(apiResponse(row));
});

app.get('/api/v1/business-memberships/applications', roleGuard('admin'), (req, res) => {
  const status = String(req.query.status || 'pending').trim().toLowerCase();
  const validStatus = ['pending', 'approved', 'rejected', 'all'];
  if (!validStatus.includes(status)) {
    return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'status must be pending|approved|rejected|all' }));
  }

  const params = [];
  const where = [];
  if (status !== 'all') {
    where.push('a.status = ?');
    params.push(status);
  }

  const rows = db.prepare(`
    SELECT a.*,
           u.email as applicant_email,
           reviewer.name as reviewed_by_name
    FROM business_member_applications a
    JOIN users u ON u.id = a.user_id
    LEFT JOIN users reviewer ON reviewer.id = a.reviewed_by_user_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY CASE a.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END ASC,
             a.created_at DESC, a.id DESC
  `).all(...params);
  return res.json(apiResponse(rows));
});

app.put('/api/v1/business-memberships/applications/:id/review', roleGuard('admin'), (req, res) => {
  const id = req.params.id;
  const action = String(req.body?.action || '').trim().toLowerCase();
  const reviewNote = String(req.body?.review_note || '').trim() || null;

  if (action !== 'approve' && action !== 'reject') {
    return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'action must be approve or reject' }));
  }

  const application = db.prepare('SELECT * FROM business_member_applications WHERE id = ?').get(id);
  if (!application) {
    return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Application not found' }));
  }
  if (application.status !== 'pending') {
    return res.status(409).json(apiResponse(null, { code: 'ALREADY_REVIEWED', message: 'Application already reviewed' }));
  }

  if (action === 'reject') {
    db.prepare(`
      UPDATE business_member_applications
      SET status = 'rejected',
          reviewed_by_user_id = ?,
          review_note = ?,
          reviewed_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(req.user.id, reviewNote, id);
    const updated = db.prepare('SELECT * FROM business_member_applications WHERE id = ?').get(id);
    return res.json(apiResponse({ application: updated, membership: null }));
  }

  const payload = req.body || {};
  const proposedCode = normalizeCode(payload.code || '');
  const chosenDisplayName = String(payload.display_name || '').trim()
    || application.shop_name
    || application.applicant_name;

  const discountPercent = Number(payload.discount_percent ?? 10) || 0;
  const maxDiscountAmount = Number(payload.max_discount_amount ?? 300) || 0;
  const monthlyUsageLimit = Math.max(0, parseInt(payload.monthly_usage_limit ?? 10, 10) || 0);
  const pointsMultiplierReferral = Number(payload.points_multiplier_referral ?? 1.0) || 0;
  const pointsMultiplierSelf = Number(payload.points_multiplier_self ?? 0.3) || 0;
  const startsAt = payload.starts_at || null;
  const endsAt = payload.ends_at || null;
  const isActive = payload.is_active === undefined ? true : !!payload.is_active;

  let responsePayload;
  try {
    const tx = db.transaction(() => {
      const latest = db.prepare('SELECT * FROM business_member_applications WHERE id = ?').get(id);
      if (!latest) throw new Error('APP_NOT_FOUND');
      if (latest.status !== 'pending') throw new Error('ALREADY_REVIEWED');

      const existingMembership = db.prepare('SELECT id FROM business_memberships WHERE user_id = ?').get(latest.user_id);
      if (existingMembership) throw new Error('DUPLICATE_USER');

      const targetUser = db.prepare('SELECT id, role FROM users WHERE id = ?').get(latest.user_id);
      if (!targetUser) throw new Error('USER_NOT_FOUND');

      const finalCode = proposedCode || generateUniqueBusinessCode(chosenDisplayName);
      const existsCode = db.prepare('SELECT id FROM business_memberships WHERE code = ?').get(finalCode);
      if (existsCode) throw new Error('DUPLICATE_CODE');

      const membershipId = uuidv4();
      db.prepare(`
        INSERT INTO business_memberships
        (id, user_id, code, display_name, discount_percent, max_discount_amount, monthly_usage_limit,
         points_multiplier_referral, points_multiplier_self, starts_at, ends_at, is_active, points_balance, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
      `).run(
        membershipId,
        latest.user_id,
        finalCode,
        chosenDisplayName,
        discountPercent,
        maxDiscountAmount,
        monthlyUsageLimit,
        pointsMultiplierReferral,
        pointsMultiplierSelf,
        startsAt,
        endsAt,
        isActive ? 1 : 0
      );

      db.prepare(`
        UPDATE users
        SET role = 'business_member', updated_at = datetime('now')
        WHERE id = ?
      `).run(latest.user_id);

      db.prepare(`
        UPDATE business_member_applications
        SET status = 'approved',
            reviewed_by_user_id = ?,
            review_note = ?,
            reviewed_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(req.user.id, reviewNote, id);

      const reviewed = db.prepare('SELECT * FROM business_member_applications WHERE id = ?').get(id);
      const membership = db.prepare('SELECT * FROM business_memberships WHERE id = ?').get(membershipId);
      responsePayload = { application: reviewed, membership };
    });
    tx();
  } catch (err) {
    const msg = String(err?.message || '');
    if (msg === 'ALREADY_REVIEWED') {
      return res.status(409).json(apiResponse(null, { code: 'ALREADY_REVIEWED', message: 'Application already reviewed' }));
    }
    if (msg === 'DUPLICATE_USER') {
      return res.status(409).json(apiResponse(null, { code: 'DUPLICATE_USER', message: 'User already has a business membership' }));
    }
    if (msg === 'DUPLICATE_CODE' || msg.includes('UNIQUE constraint failed: business_memberships.code')) {
      return res.status(409).json(apiResponse(null, { code: 'DUPLICATE_CODE', message: 'Business code already exists' }));
    }
    if (msg === 'USER_NOT_FOUND') {
      return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'User not found' }));
    }
    return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message || 'Failed to review application' }));
  }

  return res.json(apiResponse(responsePayload));
});

app.get('/api/v1/business-memberships', roleGuard('admin', 'store_manager'), (req, res) => {
  const rows = db.prepare(`
    SELECT bm.*, u.name as user_name, u.email as user_email
    FROM business_memberships bm
    JOIN users u ON u.id = bm.user_id
    ORDER BY bm.created_at DESC
  `).all();
  res.json(apiResponse(rows));
});

app.post('/api/v1/business-memberships', roleGuard('admin'), (req, res) => {
  const {
    user_id,
    code,
    display_name,
    discount_percent = 0,
    max_discount_amount = 0,
    monthly_usage_limit = 10,
    points_multiplier_referral = 1.0,
    points_multiplier_self = 0.3,
    starts_at = null,
    ends_at = null,
    is_active = true,
  } = req.body || {};

  if (!user_id || !code || !display_name) {
    return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'user_id, code, display_name are required' }));
  }
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(user_id);
  if (!user) {
    return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'User not found' }));
  }
  if (user.role !== 'business_member') {
    return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Target user must have business_member role' }));
  }

  const normalizedCode = normalizeCode(code);
  const existsCode = db.prepare('SELECT id FROM business_memberships WHERE code = ?').get(normalizedCode);
  if (existsCode) {
    return res.status(409).json(apiResponse(null, { code: 'DUPLICATE_CODE', message: 'Business code already exists' }));
  }
  const existsUser = db.prepare('SELECT id FROM business_memberships WHERE user_id = ?').get(user_id);
  if (existsUser) {
    return res.status(409).json(apiResponse(null, { code: 'DUPLICATE_USER', message: 'User already has a business membership' }));
  }

  const id = uuidv4();
  try {
    db.prepare(`
      INSERT INTO business_memberships
      (id, user_id, code, display_name, discount_percent, max_discount_amount, monthly_usage_limit,
       points_multiplier_referral, points_multiplier_self, starts_at, ends_at, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, user_id, normalizedCode, display_name,
      Number(discount_percent) || 0,
      Number(max_discount_amount) || 0,
      Math.max(0, parseInt(monthly_usage_limit, 10) || 0),
      Number(points_multiplier_referral) || 0,
      Number(points_multiplier_self) || 0,
      starts_at || null,
      ends_at || null,
      is_active ? 1 : 0
    );
  } catch (err) {
    const msg = String(err?.message || '');
    if (msg.includes('UNIQUE constraint failed: business_memberships.code')) {
      return res.status(409).json(apiResponse(null, { code: 'DUPLICATE_CODE', message: 'Business code already exists' }));
    }
    if (msg.includes('UNIQUE constraint failed: business_memberships.user_id')) {
      return res.status(409).json(apiResponse(null, { code: 'DUPLICATE_USER', message: 'User already has a business membership' }));
    }
    return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
  }

  const created = db.prepare('SELECT * FROM business_memberships WHERE id = ?').get(id);
  res.status(201).json(apiResponse(created));
});

app.put('/api/v1/business-memberships/:id', roleGuard('admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM business_memberships WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Business membership not found' }));
  }

  const {
    display_name,
    discount_percent,
    max_discount_amount,
    monthly_usage_limit,
    points_multiplier_referral,
    points_multiplier_self,
    starts_at,
    ends_at,
    is_active,
  } = req.body || {};

  const updates = [];
  const params = [];
  if (display_name !== undefined) {
    updates.push('display_name = ?');
    params.push(display_name);
  }
  if (discount_percent !== undefined) {
    updates.push('discount_percent = ?');
    params.push(Number(discount_percent) || 0);
  }
  if (max_discount_amount !== undefined) {
    updates.push('max_discount_amount = ?');
    params.push(Number(max_discount_amount) || 0);
  }
  if (monthly_usage_limit !== undefined) {
    updates.push('monthly_usage_limit = ?');
    params.push(Math.max(0, parseInt(monthly_usage_limit, 10) || 0));
  }
  if (points_multiplier_referral !== undefined) {
    updates.push('points_multiplier_referral = ?');
    params.push(Number(points_multiplier_referral) || 0);
  }
  if (points_multiplier_self !== undefined) {
    updates.push('points_multiplier_self = ?');
    params.push(Number(points_multiplier_self) || 0);
  }
  if (starts_at !== undefined) {
    updates.push('starts_at = ?');
    params.push(starts_at || null);
  }
  if (ends_at !== undefined) {
    updates.push('ends_at = ?');
    params.push(ends_at || null);
  }
  if (is_active !== undefined) {
    updates.push('is_active = ?');
    params.push(is_active ? 1 : 0);
  }
  if (updates.length === 0) {
    return res.json(apiResponse(existing));
  }
  updates.push("updated_at = datetime('now')");
  params.push(req.params.id);
  db.prepare(`UPDATE business_memberships SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare('SELECT * FROM business_memberships WHERE id = ?').get(req.params.id);
  res.json(apiResponse(updated));
});

app.post('/api/v1/business-memberships/resolve-code', roleGuard('customer', 'business_member'), (req, res) => {
  const { code } = req.body || {};
  const bm = getActiveBusinessMembershipByCode(code);
  if (!bm) {
    return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Invalid or inactive code' }));
  }
  res.json(apiResponse({
    id: bm.id,
    code: bm.code,
    display_name: bm.display_name,
    discount_percent: bm.discount_percent,
    max_discount_amount: bm.max_discount_amount,
    monthly_usage_limit: bm.monthly_usage_limit,
  }));
});

app.post('/api/v1/business-memberships/bind', roleGuard('customer', 'business_member'), (req, res) => {
  const { code } = req.body || {};
  const bm = getActiveBusinessMembershipByCode(code);
  if (!bm) {
    return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Invalid or inactive code' }));
  }
  const current = getActiveCustomerBusinessLink(req.user.id);
  if (current && current.business_membership_id !== bm.id) {
    return res.status(409).json(apiResponse(null, { code: 'ALREADY_LINKED', message: 'Customer already linked to another business member' }));
  }
  if (!current) {
    bindBusinessMemberForCustomer(req.user.id, code, req.user.id, 'linked by customer');
  }
  const linked = getActiveCustomerBusinessLink(req.user.id);
  res.json(apiResponse(linked));
});

app.get('/api/v1/business-memberships/me', roleGuard('business_member'), (req, res) => {
  const bm = db.prepare('SELECT * FROM business_memberships WHERE user_id = ?').get(req.user.id);
  if (!bm) {
    return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Business membership profile not found' }));
  }
  res.json(apiResponse(bm));
});

app.get('/api/v1/business-memberships/me/customers', roleGuard('business_member'), (req, res) => {
  const bm = db.prepare('SELECT * FROM business_memberships WHERE user_id = ?').get(req.user.id);
  if (!bm) {
    return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Business membership profile not found' }));
  }
  const rows = db.prepare(`
    SELECT l.customer_user_id, l.linked_at, u.name, u.email
    FROM customer_business_links l
    JOIN users u ON u.id = l.customer_user_id
    WHERE l.business_membership_id = ? AND l.is_active = 1
    ORDER BY l.linked_at DESC
  `).all(bm.id);
  res.json(apiResponse(rows));
});

app.get('/api/v1/business-memberships/me/customers/:customerUserId/activity', roleGuard('business_member'), (req, res) => {
  const bm = db.prepare('SELECT * FROM business_memberships WHERE user_id = ?').get(req.user.id);
  if (!bm) {
    return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Business membership profile not found' }));
  }
  const link = db.prepare(`
    SELECT * FROM customer_business_links
    WHERE business_membership_id = ? AND customer_user_id = ? AND is_active = 1
  `).get(bm.id, req.params.customerUserId);
  if (!link) {
    return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Linked customer not found' }));
  }

  const appointments = db.prepare(`
    SELECT id, date, time, service_type, status, created_at
    FROM appointments
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(req.params.customerUserId);
  const orders = db.prepare(`
    SELECT id, status, total, discount_amount, created_at
    FROM orders
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(req.params.customerUserId);
  res.json(apiResponse({ appointments, orders }));
});

app.post('/api/v1/business-memberships/me/unlink/:customerUserId', roleGuard('business_member'), (req, res) => {
  const bm = db.prepare('SELECT * FROM business_memberships WHERE user_id = ?').get(req.user.id);
  if (!bm) {
    return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Business membership profile not found' }));
  }
  const updated = db.prepare(`
    UPDATE customer_business_links
    SET is_active = 0, unlinked_at = datetime('now'), notes = COALESCE(?, notes)
    WHERE customer_user_id = ? AND business_membership_id = ? AND is_active = 1
  `).run((req.body && req.body.reason) || 'unlinked by business member', req.params.customerUserId, bm.id);
  if (updated.changes === 0) {
    return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Active link not found' }));
  }
  res.json(apiResponse({ message: 'Unlinked successfully' }));
});

app.get('/api/v1/business-memberships/me/metrics', roleGuard('business_member'), (req, res) => {
  const bm = db.prepare('SELECT * FROM business_memberships WHERE user_id = ?').get(req.user.id);
  if (!bm) {
    return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Business membership profile not found' }));
  }
  const linkedCustomers = db.prepare(`
    SELECT COUNT(*) as c FROM customer_business_links WHERE business_membership_id = ? AND is_active = 1
  `).get(bm.id).c;
  const orderStats = db.prepare(`
    SELECT COUNT(*) as orders_count,
           COALESCE(SUM(total), 0) as total_revenue,
           COALESCE(SUM(discount_amount), 0) as total_discount
    FROM orders
    WHERE business_membership_id = ?
  `).get(bm.id);
  const chargeStats = db.prepare(`
    SELECT COUNT(*) as charges_count,
           COALESCE(SUM(final_price), 0) as service_revenue,
           COALESCE(SUM(discount_amount), 0) as service_discount
    FROM appointment_charges
    WHERE business_membership_id = ? AND status = 'charged'
  `).get(bm.id);
  res.json(apiResponse({
    linked_customers: Number(linkedCustomers || 0),
    points_balance: Number(bm.points_balance || 0),
    orders_count: Number(orderStats.orders_count || 0),
    order_revenue: Number(orderStats.total_revenue || 0),
    order_discount: Number(orderStats.total_discount || 0),
    service_charges_count: Number(chargeStats.charges_count || 0),
    service_revenue: Number(chargeStats.service_revenue || 0),
    service_discount: Number(chargeStats.service_discount || 0),
  }));
});

app.get('/api/v1/business-memberships/me/ledger', roleGuard('business_member'), (req, res) => {
  const bm = db.prepare('SELECT * FROM business_memberships WHERE user_id = ?').get(req.user.id);
  if (!bm) {
    return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Business membership profile not found' }));
  }
  const parsedLimit = parseInt(req.query.limit || '100', 10);
  const limit = Number.isNaN(parsedLimit) ? 100 : Math.max(1, Math.min(500, parsedLimit));
  const rows = db.prepare(`
    SELECT l.*, u.name as customer_name
    FROM business_points_ledger l
    LEFT JOIN users u ON u.id = l.customer_user_id
    WHERE l.business_membership_id = ?
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT ?
  `).all(bm.id, limit);
  res.json(apiResponse(rows));
});

// GET /api/v1/memberships/me - current user's active membership (optional store_id filter)
app.get('/api/v1/memberships/me', roleGuard('admin', 'store_manager', 'staff', 'customer', 'business_member'), (req, res) => {
  const scopedStoreId = normalizeStoreId(req.query?.store_id);
  if (scopedStoreId && !canAccessStoreScopedRecord(req, scopedStoreId)) {
    return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Store access denied' }));
  }
  let sql = `
    SELECT um.*, mp.name as plan_name
    FROM user_memberships um
    LEFT JOIN store_membership_plans mp ON mp.id = um.plan_id
    WHERE um.user_id = ?
      AND um.status = 'active'
  `;
  const params = [req.user.id];
  if (scopedStoreId) {
    sql += ' AND um.store_id = ?';
    params.push(scopedStoreId);
  }
  sql += ' ORDER BY um.created_at DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(apiResponse(rows));
});

// GET /api/v1/coupons/me - current user's claimed coupons
app.get('/api/v1/coupons/me', roleGuard('admin', 'store_manager', 'staff', 'customer', 'business_member'), (req, res) => {
  const scopedStoreId = normalizeStoreId(req.query?.store_id);
  if (scopedStoreId && !canAccessStoreScopedRecord(req, scopedStoreId)) {
    return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Store access denied' }));
  }
  let sql = `
    SELECT
      uc.*,
      sp.title as promotion_title,
      sp.description as promotion_description,
      sp.valid_until as promotion_valid_until
    FROM user_coupons uc
    LEFT JOIN store_promotions sp ON sp.id = uc.promotion_id
    WHERE uc.user_id = ?
  `;
  const params = [req.user.id];
  if (scopedStoreId) {
    sql += ' AND uc.store_id = ?';
    params.push(scopedStoreId);
  }
  sql += ' ORDER BY uc.claimed_at DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(apiResponse(rows));
});

// POST /api/v1/memberships/join - create active membership
app.post('/api/v1/memberships/join', roleGuard('admin', 'store_manager', 'staff', 'customer', 'business_member'), (req, res) => {
  const storeId = normalizeStoreId(req.body?.store_id);
  const planId = String(req.body?.plan_id || '').trim();
  const billingPeriod = req.body?.billing_period === 'yearly' ? 'yearly' : 'monthly';
  if (!storeId || !planId) {
    return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'store_id and plan_id are required' }));
  }
  if (req.body?.dog_id) {
    return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'dog_id is no longer supported' }));
  }
  if (!canAccessStoreScopedRecord(req, storeId)) {
    return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Store access denied' }));
  }
  const plan = db.prepare('SELECT * FROM store_membership_plans WHERE id = ? AND store_id = ? AND is_active = 1').get(planId, storeId);
  if (!plan) {
    return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Membership plan not found' }));
  }

  const duplicate = db.prepare(`
    SELECT id
    FROM user_memberships
    WHERE user_id = ?
      AND store_id = ?
      AND plan_id = ?
      AND status = 'active'
      AND (
        (dog_id IS NULL AND ? IS NULL)
        OR dog_id = ?
      )
    LIMIT 1
  `).get(req.user.id, storeId, planId, null, null);
  if (duplicate) {
    return res.status(409).json(apiResponse(null, { code: 'ALREADY_JOINED', message: 'Active membership already exists for this scope' }));
  }

  const joinExpiresAt = (() => {
    const d = new Date();
    if (billingPeriod === 'yearly') d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
    return d.toISOString().replace('T', ' ').slice(0, 19);
  })();

  const id = uuidv4();
  db.prepare(`
    INSERT INTO user_memberships
    (id, user_id, dog_id, store_id, plan_id, status, started_at, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'active', datetime('now'), ?, datetime('now'), datetime('now'))
  `).run(id, req.user.id, null, storeId, planId, joinExpiresAt);

  const row = db.prepare(`
    SELECT um.*, mp.name as plan_name
    FROM user_memberships um
    LEFT JOIN store_membership_plans mp ON mp.id = um.plan_id
    WHERE um.id = ?
  `).get(id);
  return res.status(201).json(apiResponse(row));
});

// POST /api/v1/memberships/purchase - create membership + payable order
app.post('/api/v1/memberships/purchase', roleGuard('admin', 'store_manager', 'staff', 'customer', 'business_member'), (req, res) => {
  const storeId = normalizeStoreId(req.body?.store_id);
  const planId = String(req.body?.plan_id || '').trim();
  const paymentMethod = req.body?.payment_method === 'in_store' ? 'in_store' : 'online';
  const billingPeriod = req.body?.billing_period === 'yearly' ? 'yearly' : 'monthly';
  if (!storeId || !planId) {
    return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'store_id and plan_id are required' }));
  }
  if (req.body?.dog_id) {
    return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'dog_id is no longer supported' }));
  }
  if (!canAccessStoreScopedRecord(req, storeId)) {
    return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Store access denied' }));
  }

  const plan = db.prepare('SELECT * FROM store_membership_plans WHERE id = ? AND store_id = ? AND is_active = 1').get(planId, storeId);
  if (!plan) {
    return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Membership plan not found' }));
  }

  const existingMembership = db.prepare(`
    SELECT id, expires_at
    FROM user_memberships
    WHERE user_id = ?
      AND store_id = ?
      AND plan_id = ?
      AND status = 'active'
      AND (
        (dog_id IS NULL AND ? IS NULL)
        OR dog_id = ?
      )
    ORDER BY datetime(COALESCE(expires_at, created_at)) DESC, created_at DESC
    LIMIT 1
  `).get(req.user.id, storeId, planId, null, null);

  const monthlyAvailable = Number(plan.price_monthly_cents || 0) > 0;
  const yearlyAvailable = Number(plan.price_yearly_cents || 0) > 0;
  const effectivePeriod = billingPeriod === 'yearly' && yearlyAvailable ? 'yearly'
    : monthlyAvailable ? 'monthly'
    : yearlyAvailable ? 'yearly'
    : null;
  const priceCents = effectivePeriod === 'yearly'
    ? Number(plan.price_yearly_cents)
    : Number(plan.price_monthly_cents);
  const parseSqliteDate = (value) => {
    if (!value) return null;
    const normalized = String(value).trim().replace(' ', 'T');
    const withZone = /Z|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
    const parsed = new Date(withZone);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const toSqliteDate = (date) => date.toISOString().replace('T', ' ').slice(0, 19);
  const addBillingPeriod = (baseDate) => {
    const d = new Date(baseDate.getTime());
    if (effectivePeriod === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
    else d.setUTCMonth(d.getUTCMonth() + 1);
    return d;
  };
  const now = new Date();
  const activeExpiry = parseSqliteDate(existingMembership?.expires_at);
  const renewalBase = activeExpiry && activeExpiry.getTime() > now.getTime() ? activeExpiry : now;
  const purchaseExpiresAt = toSqliteDate(addBillingPeriod(renewalBase));
  if (!Number.isFinite(priceCents) || priceCents <= 0) {
    return res.status(400).json(apiResponse(null, { code: 'INVALID_PLAN_PRICE', message: 'Membership plan has no valid purchasable price' }));
  }

  const total = Math.round((priceCents / 100) * 100) / 100;
  const membershipId = existingMembership?.id || uuidv4();
  const orderId = `order-${uuidv4().slice(0, 8)}`;
  const membershipProductId = `membership-plan-${plan.id}`;
  const orderStatus = paymentMethod === 'in_store' ? 'confirmed' : 'pending';

  const tx = db.transaction(() => {
    // Ensure order_items.product_id satisfies FK without exposing membership as a normal product.
    const existingMembershipProduct = db.prepare('SELECT id FROM products WHERE id = ?').get(membershipProductId);
    if (!existingMembershipProduct) {
      db.prepare(`
        INSERT INTO products
        (id, name, description, category, price, stock_quantity, image_url, is_active, created_at, updated_at)
        VALUES (?, ?, ?, 'other', ?, 999999, NULL, 0, datetime('now'), datetime('now'))
      `).run(
        membershipProductId,
        `Membership - ${plan.name}`,
        'Internal membership checkout product',
        total
      );
    }

    if (existingMembership?.id) {
      db.prepare(`
        UPDATE user_memberships
        SET expires_at = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(purchaseExpiresAt, existingMembership.id);
    } else {
      db.prepare(`
        INSERT INTO user_memberships
        (id, user_id, dog_id, store_id, plan_id, status, started_at, expires_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'active', datetime('now'), ?, datetime('now'), datetime('now'))
      `).run(membershipId, req.user.id, null, storeId, planId, purchaseExpiresAt);
    }

    db.prepare(`
      INSERT INTO orders
      (id, user_id, customer_name, customer_phone, status, subtotal, discount_amount, discount_reason, business_membership_id, points_awarded, total, notes, store_id)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, NULL, 0, ?, ?, ?)
    `).run(
      orderId,
      req.user.id,
      req.user.name || null,
      req.user.phone_number || null,
      orderStatus,
      total,
      `${existingMembership?.id ? 'Membership renewal' : 'Membership purchase'}: ${plan.name}`,
      total,
      `membership_plan_id=${plan.id}`,
      storeId
    );

    db.prepare(`
      INSERT INTO order_items
      (order_id, product_id, product_name, quantity, unit_price)
      VALUES (?, ?, ?, 1, ?)
    `).run(orderId, membershipProductId, `Membership - ${plan.name}`, total);
  });
  tx();

  const membership = db.prepare(`
    SELECT um.*, mp.name as plan_name
    FROM user_memberships um
    LEFT JOIN store_membership_plans mp ON mp.id = um.plan_id
    WHERE um.id = ?
  `).get(membershipId);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);

  return res.status(201).json(apiResponse({ membership, order: { ...order, items } }));
});

// POST /api/v1/memberships/:id/cancel - cancel active membership
app.post('/api/v1/memberships/:id/cancel', roleGuard('admin', 'store_manager', 'staff', 'customer', 'business_member'), (req, res) => {
  const membershipId = String(req.params.id || '').trim();
  if (!membershipId) return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Valid membership id is required' }));

  const membership = db.prepare('SELECT * FROM user_memberships WHERE id = ?').get(membershipId);
  if (!membership) return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Membership not found' }));
  if (!canAccessStoreScopedRecord(req, membership.store_id)) {
    return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Store access denied' }));
  }
  if (req.user.role !== 'admin' && membership.user_id !== req.user.id) {
    return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Can only cancel your own membership' }));
  }
  if (membership.status !== 'active') {
    return res.status(409).json(apiResponse(null, { code: 'NOT_ACTIVE', message: 'Membership is not active' }));
  }
  db.prepare(`
    UPDATE user_memberships
    SET status = 'cancelled', expires_at = COALESCE(expires_at, datetime('now')), updated_at = datetime('now')
    WHERE id = ?
  `).run(membershipId);
  const updated = db.prepare('SELECT * FROM user_memberships WHERE id = ?').get(membershipId);
  return res.json(apiResponse(updated));
});

// POST /api/v1/coupons/claim - claim coupon by promotion_id or coupon_code
app.post('/api/v1/coupons/claim', roleGuard('admin', 'store_manager', 'staff', 'customer', 'business_member'), (req, res) => {
  const promotionId = String(req.body?.promotion_id || '').trim();
  const couponCode = String(req.body?.coupon_code || '').trim();
  if (!promotionId && !couponCode) {
    return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'promotion_id or coupon_code is required' }));
  }

  let promo;
  if (promotionId) {
    promo = db.prepare(`
      SELECT *
      FROM store_promotions
      WHERE id = ?
        AND is_active = 1
        AND valid_from <= datetime('now')
        AND valid_until >= datetime('now')
      LIMIT 1
    `).get(promotionId);
  } else {
    promo = db.prepare(`
      SELECT *
      FROM store_promotions
      WHERE coupon_code = ?
        AND is_active = 1
        AND valid_from <= datetime('now')
        AND valid_until >= datetime('now')
      ORDER BY priority DESC, created_at DESC
      LIMIT 1
    `).get(couponCode);
  }
  if (!promo) {
    return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Promotion not found or inactive' }));
  }
  if (!canAccessStoreScopedRecord(req, promo.store_id)) {
    return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Store access denied' }));
  }

  if (promo.eligibility === 'members_only') {
    const activeMembership = db.prepare(`
      SELECT id
      FROM user_memberships
      WHERE user_id = ? AND store_id = ? AND status = 'active'
      LIMIT 1
    `).get(req.user.id, promo.store_id);
    if (!activeMembership) {
      return res.status(403).json(apiResponse(null, { code: 'MEMBERS_ONLY', message: 'This promotion is for members only' }));
    }
  }
  if (promo.eligibility === 'new_customers') {
    const priorAppointments = db.prepare(`
      SELECT COUNT(*) as c FROM appointments WHERE user_id = ? AND store_id = ?
    `).get(req.user.id, promo.store_id).c;
    const priorOrders = db.prepare(`
      SELECT COUNT(*) as c FROM orders WHERE user_id = ? AND store_id = ?
    `).get(req.user.id, promo.store_id).c;
    if (Number(priorAppointments || 0) > 0 || Number(priorOrders || 0) > 0) {
      return res.status(403).json(apiResponse(null, { code: 'NEW_CUSTOMERS_ONLY', message: 'This promotion is for new customers only' }));
    }
  }

  const alreadyClaimed = db.prepare(`
    SELECT id
    FROM user_coupons
    WHERE user_id = ? AND promotion_id = ?
    LIMIT 1
  `).get(req.user.id, promo.id);
  if (alreadyClaimed) {
    return res.status(409).json(apiResponse(null, { code: 'ALREADY_CLAIMED', message: 'Coupon already claimed' }));
  }

  if (promo.usage_limit_total !== null && promo.usage_limit_total !== undefined) {
    const totalClaims = db.prepare('SELECT COUNT(*) as c FROM user_coupons WHERE promotion_id = ?').get(promo.id).c;
    if (Number(totalClaims || 0) >= Number(promo.usage_limit_total)) {
      return res.status(409).json(apiResponse(null, { code: 'LIMIT_REACHED', message: 'Promotion claim limit reached' }));
    }
  }
  if (promo.usage_limit_per_user !== null && promo.usage_limit_per_user !== undefined) {
    const perUserClaims = db.prepare('SELECT COUNT(*) as c FROM user_coupons WHERE promotion_id = ? AND user_id = ?').get(promo.id, req.user.id).c;
    if (Number(perUserClaims || 0) >= Number(promo.usage_limit_per_user)) {
      return res.status(409).json(apiResponse(null, { code: 'USER_LIMIT_REACHED', message: 'User claim limit reached for this promotion' }));
    }
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO user_coupons
    (id, user_id, promotion_id, store_id, coupon_code, claimed_at, used_at, expires_at, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), NULL, ?, 'available', datetime('now'), datetime('now'))
  `).run(id, req.user.id, promo.id, promo.store_id, promo.coupon_code || null, promo.valid_until || null);

  const row = db.prepare(`
    SELECT
      uc.*,
      sp.title as promotion_title,
      sp.description as promotion_description,
      sp.valid_until as promotion_valid_until
    FROM user_coupons uc
    LEFT JOIN store_promotions sp ON sp.id = uc.promotion_id
    WHERE uc.id = ?
  `).get(id);
  return res.status(201).json(apiResponse(row));
});

// ============================================================================
// Service Price API
// ============================================================================

app.get('/api/v1/service-prices', roleGuard('admin', 'store_manager', 'staff', 'business_member'), (req, res) => {
  const rows = db.prepare('SELECT * FROM service_prices ORDER BY service_type ASC').all();
  res.json(apiResponse(rows));
});

app.put('/api/v1/service-prices/:serviceType', roleGuard('admin', 'store_manager'), (req, res) => {
  const serviceType = req.params.serviceType;
  const basePrice = Number(req.body?.base_price);
  const isActive = req.body?.is_active;
  if (!serviceType || Number.isNaN(basePrice) || basePrice < 0) {
    return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'Valid serviceType and base_price are required' }));
  }
  const existing = db.prepare('SELECT * FROM service_prices WHERE service_type = ?').get(serviceType);
  if (!existing) {
    db.prepare(`
      INSERT INTO service_prices (id, service_type, base_price, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(uuidv4(), serviceType, basePrice, isActive === undefined ? 1 : (isActive ? 1 : 0));
  } else {
    db.prepare(`
      UPDATE service_prices
      SET base_price = ?, is_active = COALESCE(?, is_active), updated_at = datetime('now')
      WHERE service_type = ?
    `).run(basePrice, isActive === undefined ? null : (isActive ? 1 : 0), serviceType);
  }
  const row = db.prepare('SELECT * FROM service_prices WHERE service_type = ?').get(serviceType);
  res.json(apiResponse(row));
});

app.get('/api/v1/appointment-charges', roleGuard('admin', 'store_manager', 'staff'), (req, res) => {
  const parsedLimit = parseInt(req.query.limit || '100', 10);
  const limit = Number.isNaN(parsedLimit) ? 100 : Math.max(1, Math.min(1000, parsedLimit));
  const { status, date } = req.query;
  let sql = `
    SELECT ac.*,
           a.date as appointment_date, a.time as appointment_time, a.dog_name, a.customer_name,
           bm.code as business_code, bm.display_name as business_display_name
    FROM appointment_charges ac
    LEFT JOIN appointments a ON a.id = ac.appointment_id
    LEFT JOIN business_memberships bm ON bm.id = ac.business_membership_id
    WHERE 1=1
  `;
  const params = [];
  if (status) {
    sql += ' AND ac.status = ?';
    params.push(status);
  }
  if (date) {
    sql += ' AND DATE(ac.created_at) = ?';
    params.push(date);
  }
  sql = appendStoreScope(sql, params, req, 'a.store_id', { includeNullFallback: true });
  sql += ' ORDER BY ac.created_at DESC LIMIT ?';
  params.push(limit);
  const rows = db.prepare(sql).all(...params);
  res.json(apiResponse(rows));
});

app.put('/api/v1/appointment-charges/:id/refund', roleGuard('admin', 'store_manager', 'staff'), (req, res) => {
  try {
    const charge = db.prepare(`
      SELECT ac.*, a.store_id as appointment_store_id
      FROM appointment_charges ac
      LEFT JOIN appointments a ON a.id = ac.appointment_id
      WHERE ac.id = ?
    `).get(req.params.id);
    if (!charge) {
      return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Charge not found' }));
    }
    if (!canAccessStoreScopedRecord(req, charge.appointment_store_id, { includeNullFallback: true })) {
      return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Store access denied' }));
    }
    if (charge.status === 'refunded') {
      return res.status(409).json(apiResponse(null, { code: 'ALREADY_REFUNDED', message: 'Charge is already refunded' }));
    }

    const reason = String(req.body?.reason || '').trim();
    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE appointment_charges
        SET status = 'refunded', updated_at = datetime('now')
        WHERE id = ?
      `).run(req.params.id);

      if (charge.business_membership_id && Number(charge.points_awarded || 0) > 0) {
        const toRollback = Math.abs(Number(charge.points_awarded));
        const bm = db.prepare('SELECT points_balance FROM business_memberships WHERE id = ?').get(charge.business_membership_id);
        const currentBalance = Math.max(0, Number(bm?.points_balance || 0));
        const rollbackAbs = Math.min(currentBalance, toRollback);
        if (rollbackAbs > 0) {
          const rollback = -rollbackAbs;
          db.prepare(`
            INSERT INTO business_points_ledger
            (business_membership_id, customer_user_id, appointment_charge_id, source_type, points_delta, memo)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            charge.business_membership_id,
            charge.user_id || null,
            charge.id,
            'appointment_charge_refund_rollback',
            rollback,
            reason || (rollbackAbs < toRollback ? 'partial rollback points on charge refund (floor at zero)' : 'rollback points on charge refund')
          );
          db.prepare(`
            UPDATE business_memberships
            SET points_balance = points_balance + ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(rollback, charge.business_membership_id);
        }
      }
    });
    tx();

    const updated = db.prepare('SELECT * FROM appointment_charges WHERE id = ?').get(req.params.id);
    res.json(apiResponse(updated));
  } catch (err) {
    console.error('Charge refund error:', err);
    res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
  }
});

// ============================================================================
// Health Check
// ============================================================================

app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    version: API_VERSION,
    timestamp: new Date().toISOString(),
    build: {
      number: API_BUILD_NUMBER,
      date: API_BUILD_DATE,
      commit: API_BUILD_SHA,
    },
  });
});

// ============================================================================
// Image Upload API
// ============================================================================

app.post('/api/v1/upload', profileUpload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json(apiResponse(null, {
      code: 'NO_FILE',
      message: 'No image file provided',
    }));
  }

  // Return relative path - client will construct full URL using its configured API base
  const relativePath = `/uploads/${req.file.filename}`;

  res.json(apiResponse({
    url: relativePath,
    filename: req.file.filename,
  }));
});

// ============================================================================
// ML Inference API
// ============================================================================

const buildFallbackTraits = () => ({
  size_class: 'M',
  height_inches: null,
  coat_length: 'medium',
  coat_texture: 'smooth',
  has_undercoat: false,
  shedding_level: 'medium',
  mat_risk: 'medium',
  current_mat_level: 'none',
  skin_sensitivity: 'low',
  is_brachycephalic: false,
  ear_type: null,
  confidence: {
    size_class: 0.2,
    coat_length: 0.2,
    coat_texture: 0.2,
    has_undercoat: 0.2,
  },
});

function buildIndeterminateAnalysis({
  subjectType = 'uncertain',
  note = 'Unable to confidently identify a suitable subject in the provided images.',
  qualityScore = 0.25,
  qualityIssues = ['low_confidence_subject'],
} = {}) {
  const safeSubject = subjectType === 'not_a_dog' ? 'not_a_dog' : 'uncertain';
  return {
    model_version: '1.0.0-fallback',
    inference_time_ms: Math.floor(Math.random() * 200) + 400,
    breed_predictions: [
      {
        breed_name: safeSubject === 'not_a_dog' ? 'Unsupported subject' : 'Not sure',
        confidence: 0.0,
        rank: 1,
        akc_group: null,
      },
    ],
    is_purebred_probability: 0.0,
    predicted_traits: buildFallbackTraits(),
    image_quality: {
      overall_score: Math.max(0, Math.min(1, Number(qualityScore) || 0.25)),
      issues: Array.isArray(qualityIssues) && qualityIssues.length > 0 ? qualityIssues : ['low_confidence_subject'],
    },
    needs_user_confirmation: [
      'manual_review_required',
      safeSubject === 'not_a_dog' ? 'subject_not_real_dog' : 'low_confidence_breed_detection',
    ],
    subject_type: safeSubject,
    analysis_note: note,
  };
}

// Last-resort fallback (never returns a fabricated breed)
const getMockPrediction = () => buildIndeterminateAnalysis({
  subjectType: 'uncertain',
  note: 'All analysis providers were unavailable, so no reliable breed prediction could be made.',
  qualityScore: 0.2,
  qualityIssues: ['analysis_fallback', 'no_reliable_model_response'],
});

// ML Service status endpoint
app.get('/api/v1/ml/status', async (req, res) => {
  if (!ML_SERVICE_ENABLED) {
    return res.json(apiResponse({
      ml_service_enabled: false,
      status: 'disabled',
      using_mock: true,
    }));
  }

  try {
    const response = await axios.get(`${ML_SERVICE_URL}/health`, {
      timeout: 5000,
    });
    res.json(apiResponse({
      ml_service_enabled: true,
      status: 'connected',
      ml_service_url: ML_SERVICE_URL,
      ml_health: response.data,
      using_mock: false,
    }));
  } catch (error) {
    res.json(apiResponse({
      ml_service_enabled: true,
      status: 'unavailable',
      ml_service_url: ML_SERVICE_URL,
      error: error.message,
      using_mock: true,
    }));
  }
});

// Camera control proxy — routes through API instead of direct ML access
function parseDoorLineCoords(raw) {
  if (raw == null || raw === '') return null;
  const parts = String(raw).split(',').map((v) => Number(v.trim()));
  if (parts.length !== 4 || parts.some((v) => Number.isNaN(v))) return null;
  const [x1, y1, x2, y2] = parts;
  if (x1 === x2 && y1 === y2) return null;
  return parts;
}

function validateTrackingPayload(payload = {}) {
  const errors = [];
  if (payload.tracking_enabled != null && typeof payload.tracking_enabled !== 'boolean') {
    errors.push('tracking_enabled must be boolean');
  }
  if (payload.door_line_direction != null) {
    const dir = String(payload.door_line_direction);
    const valid = dir === 'negative_to_positive_is_entry' || dir === 'positive_to_negative_is_entry';
    if (!valid) {
      errors.push('door_line_direction must be negative_to_positive_is_entry or positive_to_negative_is_entry');
    }
  }
  if (payload.door_line_coords != null && payload.door_line_coords !== '') {
    const coords = parseDoorLineCoords(payload.door_line_coords);
    if (!coords) {
      errors.push('door_line_coords must be x1,y1,x2,y2 and line must not be degenerate');
    }
  }
  return errors;
}

app.post('/api/v1/ml/camera/start', roleGuard('admin'), async (req, res) => {
  if (!ML_SERVICE_ENABLED) {
    return res.status(503).json(apiResponse(null, { code: 'ML_DISABLED', message: 'ML service is disabled' }));
  }
  const scopedStoreId = settingsScopeFromRequest(req);
  const persistedTrackingConfig = getAnalyticsTrackingConfig(scopedStoreId);
  const requestBody = req.body && typeof req.body === 'object' ? req.body : {};
  const payload = { ...requestBody };
  if (!String(payload.camera_url || '').trim()) {
    payload.camera_url = String(persistedTrackingConfig.camera_url || '').trim();
  }
  const validationErrors = validateTrackingPayload(payload || {});
  if (validationErrors.length > 0) {
    return res.status(400).json(apiResponse(null, {
      code: 'INVALID_REQUEST',
      message: validationErrors.join('; '),
    }));
  }
  if (!String(payload.camera_url || '').trim()) {
    return res.status(400).json(apiResponse(null, {
      code: 'INVALID_REQUEST',
      message: 'camera_url is required. Set it in Vision Analytics first.',
    }));
  }
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/camera/start`, payload, { timeout: ML_SERVICE_TIMEOUT });
    res.json(apiResponse(response.data));
  } catch (error) {
    res.status(502).json(apiResponse(null, { code: 'ML_UNAVAILABLE', message: `ML service error: ${error.message}` }));
  }
});

app.post('/api/v1/ml/camera/stop', roleGuard('admin'), async (req, res) => {
  if (!ML_SERVICE_ENABLED) {
    return res.status(503).json(apiResponse(null, { code: 'ML_DISABLED', message: 'ML service is disabled' }));
  }
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/camera/stop`, {}, { timeout: ML_SERVICE_TIMEOUT });
    res.json(apiResponse(response.data));
  } catch (error) {
    res.status(502).json(apiResponse(null, { code: 'ML_UNAVAILABLE', message: `ML service error: ${error.message}` }));
  }
});

app.post('/api/v1/ml/camera/config', roleGuard('admin'), async (req, res) => {
  if (!ML_SERVICE_ENABLED) {
    return res.status(503).json(apiResponse(null, { code: 'ML_DISABLED', message: 'ML service is disabled' }));
  }
  const validationErrors = validateTrackingPayload(req.body || {});
  if (validationErrors.length > 0) {
    return res.status(400).json(apiResponse(null, {
      code: 'INVALID_REQUEST',
      message: validationErrors.join('; '),
    }));
  }
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/camera/config`, req.body, { timeout: ML_SERVICE_TIMEOUT });
    res.json(apiResponse(response.data));
  } catch (error) {
    res.status(502).json(apiResponse(null, { code: 'ML_UNAVAILABLE', message: `ML service error: ${error.message}` }));
  }
});

app.get('/api/v1/ml/camera/status', roleGuard('admin'), async (req, res) => {
  if (!ML_SERVICE_ENABLED) {
    return res.status(503).json(apiResponse(null, { code: 'ML_DISABLED', message: 'ML service is disabled' }));
  }
  try {
    const response = await axios.get(`${ML_SERVICE_URL}/camera/status`, { timeout: 5000 });
    return res.json(apiResponse(response.data));
  } catch (error) {
    return res.status(502).json(apiResponse(null, {
      code: 'ML_UNAVAILABLE',
      message: `ML service error: ${error.message}`,
    }));
  }
});

app.get('/api/v1/ml/camera/preview', roleGuard('admin'), async (req, res) => {
  if (!ML_SERVICE_ENABLED) {
    return res.status(503).json(apiResponse(null, { code: 'ML_DISABLED', message: 'ML service is disabled' }));
  }
  try {
    const response = await axios.get(`${ML_SERVICE_URL}/camera/preview`, {
      timeout: 5000,
      responseType: 'arraybuffer',
      validateStatus: (status) => status >= 200 && status < 500,
    });
    if (response.status === 404) {
      return res.status(404).json(apiResponse(null, {
        code: 'NO_PREVIEW',
        message: 'No preview frame available. Start camera first.',
      }));
    }
    if (response.status !== 200) {
      return res.status(502).json(apiResponse(null, {
        code: 'ML_UNAVAILABLE',
        message: `ML service preview error: status ${response.status}`,
      }));
    }
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.send(response.data);
  } catch (error) {
    return res.status(502).json(apiResponse(null, {
      code: 'ML_UNAVAILABLE',
      message: `ML service error: ${error.message}`,
    }));
  }
});

app.get('/api/v1/ml/camera/devices', roleGuard('admin'), async (req, res) => {
  if (!ML_SERVICE_ENABLED) {
    return res.status(503).json(apiResponse(null, { code: 'ML_DISABLED', message: 'ML service is disabled' }));
  }
  try {
    const response = await axios.get(`${ML_SERVICE_URL}/camera/devices`, {
      timeout: 15000,
      params: { max_index: req.query.max_index || 5 },
    });
    return res.json(apiResponse(response.data));
  } catch (error) {
    return res.status(502).json(apiResponse(null, {
      code: 'ML_UNAVAILABLE',
      message: `ML service error: ${error.message}`,
    }));
  }
});

app.post('/api/v1/ml/video/analyze', roleGuard('admin'), async (req, res) => {
  return res.status(410).json(apiResponse(null, { code: 'GONE', message: 'ML service removed' }));
});
app.post('/_removed_ml_video_analyze_placeholder', async (req, res) => {
  if (!ML_SERVICE_ENABLED) {
    return res.status(503).json(apiResponse(null, { code: 'ML_DISABLED', message: 'ML service is disabled' }));
  }
  if (!req.file) {
    return res.status(400).json(apiResponse(null, { code: 'VIDEO_REQUIRED', message: 'A video file is required' }));
  }
  const uploadedVideoPath = req.file.path;
  try {
    const writeScope = resolveWriteStoreId(req);
    if (writeScope.error) {
      return res.status(writeScope.error.code === 'STORE_REQUIRED' ? 400 : 403).json(apiResponse(null, writeScope.error));
    }
    const formData = new FormData();
    formData.append('video', fs.createReadStream(uploadedVideoPath), {
      filename: req.file.originalname || 'video.mp4',
      contentType: req.file.mimetype || 'video/mp4',
    });
    if (req.body.max_frames) {
      formData.append('max_frames', String(req.body.max_frames));
    }
    const response = await axios.post(`${ML_SERVICE_URL}/video/analyze`, formData, {
      timeout: Math.max(ML_SERVICE_TIMEOUT, 120000),
      headers: {
        ...formData.getHeaders(),
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    const storeId = writeScope.storeId;
    const result = response.data || {};
    const topFrames = Array.isArray(result.top_frames) ? result.top_frames : [];
    const enrichedTopFrames = topFrames.map((frame) => {
      const frameUrl = storeTriggerFrame({
        imageBase64: frame.frame_jpeg_base64,
        timestamp: new Date().toISOString(),
        sourceType: 'video_top_frame',
        cameraId: 'upload',
        storeId,
        dogCount: Number(frame?.dog_count || 0),
        avgConfidence: Number(frame?.avg_confidence || 0),
        meta: {
          filename: result.filename || req.file.originalname || null,
          timestamp_sec: frame?.timestamp_sec ?? null,
          from: 'video_analyze',
        },
      });
      return {
        ...frame,
        frame_url: frameUrl || null,
        frame_jpeg_base64: undefined,
      };
    });

    return res.json(apiResponse({
      ...result,
      top_frames: enrichedTopFrames,
    }));
  } catch (error) {
    if (error.response) {
      return res.status(error.response.status || 502).json(apiResponse(null, {
        code: error.response.data?.detail?.code || 'ML_VIDEO_ANALYSIS_FAILED',
        message: error.response.data?.detail?.message || error.message,
      }));
    }
    return res.status(502).json(apiResponse(null, {
      code: 'ML_UNAVAILABLE',
      message: `ML service error: ${error.message}`,
    }));
  } finally {
    if (uploadedVideoPath && fs.existsSync(uploadedVideoPath)) {
      try {
        fs.unlinkSync(uploadedVideoPath);
      } catch (cleanupErr) {
        // Best effort temp cleanup
      }
    }
  }
});

// ML analyze endpoint - hybrid: ML service ? LLM vision enhancement ? mock fallback
app.post('/api/v1/ml/analyze', upload.array('images', 5), async (req, res) => {
  // Validate images
  if (!req.files || req.files.length < 2) {
    return res.status(400).json(apiResponse(null, {
      code: 'INSUFFICIENT_IMAGES',
      message: 'At least 2 images required for accurate prediction',
      received: req.files ? req.files.length : 0,
    }));
  }

  if (req.files.length > 5) {
    return res.status(400).json(apiResponse(null, {
      code: 'TOO_MANY_IMAGES',
      message: 'Maximum 5 images allowed',
      received: req.files.length,
    }));
  }

  const requestKeys = getRequestKeys(req);
  const imageBuffers = req.files.map(f => f.buffer);
  const startTime = Date.now();

  // Step 1: Try LLM vision first (most accurate, multi-provider)
  try {
    const llmResult = await analyzeBreedWithLLM(imageBuffers, requestKeys);
    if (llmResult) {
      llmResult.inference_time_ms = Date.now() - startTime;
      llmResult._analysis_source = 'llm_vision';
      return res.json(apiResponse(llmResult));
    }
  } catch (error) {
    console.warn('LLM vision failed, falling back to ML service:', error.message);
  }

  // Step 2: Fallback to ML service (ViT — fast, free, offline-capable)
  if (ML_SERVICE_ENABLED) {
    try {
      const formData = new FormData();
      req.files.forEach((file, index) => {
        formData.append('images', file.buffer, {
          filename: file.originalname || `image_${index}.jpg`,
          contentType: file.mimetype,
        });
      });

      const mlResponse = await axios.post(
        `${ML_SERVICE_URL}/predict`,
        formData,
        {
          headers: { ...formData.getHeaders() },
          timeout: ML_SERVICE_TIMEOUT,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );
      const mlResult = mlResponse.data && typeof mlResponse.data === 'object'
        ? mlResponse.data
        : buildIndeterminateAnalysis();
      if (!Array.isArray(mlResult.breed_predictions) || mlResult.breed_predictions.length === 0) {
        const uncertain = buildIndeterminateAnalysis({
          subjectType: 'uncertain',
          note: 'ML service returned no reliable breed prediction.',
          qualityScore: Number(mlResult?.image_quality?.overall_score || 0.2),
          qualityIssues: ['low_confidence_breed_detection'],
        });
        uncertain._analysis_source = 'ml_service';
        uncertain._fallback = true;
        uncertain.inference_time_ms = Date.now() - startTime;
        return res.json(apiResponse(uncertain));
      }
      mlResult._analysis_source = 'ml_service';
      mlResult._fallback = true;
      mlResult.inference_time_ms = Date.now() - startTime;
      console.log(`ML fallback breed: ${mlResult.breed_predictions?.[0]?.breed_name} (confidence: ${mlResult.breed_predictions?.[0]?.confidence})`);
      return res.json(apiResponse(mlResult));
    } catch (error) {
      console.error('ML service fallback error:', error.message);

      // Forward client errors (400/422) directly
      if (error.response && (error.response.status === 400 || error.response.status === 422)) {
        return res.status(error.response.status).json(apiResponse(null, error.response.data.detail || {
          code: 'ML_SERVICE_ERROR',
          message: 'ML service rejected the request',
        }));
      }
    }
  }

  // Step 3: Last resort — mock fallback
  console.log('All analysis methods failed, falling back to mock');
  const mockResult = getMockPrediction();
  mockResult._fallback = true;
  mockResult._analysis_source = 'mock';
  mockResult.inference_time_ms = Date.now() - startTime;
  return res.json(apiResponse(mockResult));
});

// Legacy recommendation/wash/care/advisor helper routes removed.

// ============================================================================
// AI Advisor Endpoints
// Extend routeContext with analytics/settings helpers
Object.assign(routeContext, {
  settingsScopeFromRequest,
  getAnalyticsTrackingConfig,
  parseTrackingEnabledInput,
  parseDoorLineCoordsInput,
  ANALYTICS_TRACKING_DIRECTION_ALLOWED,
  ANALYTICS_METRICS_DEFAULT_ALLOWED,
  parseFlowGapThresholdInput,
  parseRolloutStableDaysInput,
  parseRolloutMinDailyLegacyFlowInput,
  resolveWriteStoreId,
  insertDetection,
  insertEntry,
  storeTriggerFrame,
  insertTrackEvent,
  appendStoreScope,
  selectTriggerFrameById,
  removeTriggerFrameFileByUrl,
  deleteTriggerFrameById,
  resolveStoreScope,
  FormData,
  fs,
  axios,
  toIsoDateUtc,
  getAnalyticsScopeKey,
  getSetting,
  ANALYTICS_TRACKING_CONFIG_DEFAULTS,
  getRecentIsoDatesInclusive,
  upsertValidationSnapshot,
  deleteValidationSnapshotsOlderThan,
  isStaff,
  profileUpload,
  sendNotification,
  sendEmailNotification,
  stripe,
  NODE_ENV,
  STRIPE_WEBHOOK_SECRET,
  PAYMENT_CURRENCY,
  STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || '',
  SALES_TAX_RATE,
});
// ============================================================================
// Analytics Endpoints
// ============================================================================
registerAnalyticsRoutes(routeContext);

// ============================================================================
// Payments API (Stripe)
// ============================================================================
registerPaymentsRoutes(routeContext);

// ============================================================================
// Classic Cars API
// ============================================================================
registerCarsRoutes(routeContext);

// ============================================================================
// Bookings API
// ============================================================================
registerBookingsRoutes(routeContext);

// ============================================================================
// Quotes API
// ============================================================================
registerQuotesRoutes(routeContext);

// ============================================================================
// Payouts API
// ============================================================================
registerPayoutsRoutes(routeContext);

// ============================================================================
// Messaging API
// ============================================================================
registerMessagingRoutes(routeContext);

// ============================================================================
// Error handling
// ============================================================================

app.use((req, res) => {
  res.status(404).json(apiResponse(null, {
    code: 'NOT_FOUND',
    message: 'Endpoint not found',
  }));
});

app.use((err, req, res, next) => {
  console.error(err);
  const status = Number(err?.status) || 500;
  const isKnown = status !== 500 && !!err?.code;
  const message = isKnown
    ? err.message
    : (process.env.NODE_ENV === 'production' ? 'Internal server error' : (err.message || 'Internal server error'));
  const responseCode = err?.code || 'SERVER_ERROR';
  res.status(status).json(apiResponse(null, {
    code: responseCode,
    message,
  }));
});

// ============================================================================
// Start server
// ============================================================================

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`UnforgettableRides API running on http://localhost:${PORT}`);
    console.log(`API health endpoint: http://localhost:${PORT}/api/v1/health`);
  });
}

// Export internals for testing.
module.exports = { app, db };








