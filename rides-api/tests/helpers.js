/**
 * Test helpers - create users and obtain JWT tokens for each role.
 *
 * Tests run against an isolated SQLite DB (analytics.test.db), never the
 * default runtime DB used by manual testing.
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// Force isolated test runtime before loading the app module.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'petcare-jest-jwt-secret';
process.env.AUTH_DEVICE_CHALLENGE_ENABLED = process.env.AUTH_DEVICE_CHALLENGE_ENABLED || 'false';
process.env.AUTH_REQUIRE_VERIFIED_FOR_SENSITIVE = process.env.AUTH_REQUIRE_VERIFIED_FOR_SENSITIVE || 'false';
const TEST_DB_DIR = path.join(__dirname, 'data');
const TEST_RUN_ID = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TEST_DB_PATH = path.join(TEST_DB_DIR, `analytics.test.${TEST_RUN_ID}.db`);
fs.mkdirSync(TEST_DB_DIR, { recursive: true });
process.env.ANALYTICS_DB_PATH = TEST_DB_PATH;
process.on('exit', () => {
  for (const suffix of ['', '-wal', '-shm']) {
    const p = `${TEST_DB_PATH}${suffix}`;
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      // best-effort cleanup only
    }
  }
});

const appModule = require('../src/index');
const { app, db } = appModule;
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'petcare-dev-secret-change-in-production';

// Unique email per test run to avoid collisions
const RUN_ID = Date.now().toString(36);

// Snapshot original dogs so we can restore after tests
const _originalDogs = JSON.parse(JSON.stringify(appModule._dogs));

/**
 * Create a user directly in the DB and return { user, token }.
 */
function createTestUser(role, overrides = {}) {
  const id = uuidv4();
  const email = overrides.email || `test-${role}-${RUN_ID}@petcare.test`;
  const password = overrides.password || 'Test123!';
  const name = overrides.name || `Test ${role}`;
  const hash = bcrypt.hashSync(password, 4); // low rounds for speed

  db.prepare(
    'INSERT INTO users (id, email, password_hash, name, role, store_id, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, email.toLowerCase(), hash, name, role, overrides.store_id || null, overrides.is_active ?? 1);

  const token = jwt.sign({ userId: id, role }, JWT_SECRET, { expiresIn: '1h' });
  const user = db.prepare('SELECT id, email, name, role, store_id, is_active FROM users WHERE id = ?').get(id);
  return { user, token, password };
}

/** Convenience: create one user per role and return a map of { admin, store_manager, staff, customer }. */
function createAllRoles() {
  return {
    admin: createTestUser('admin'),
    store_manager: createTestUser('store_manager'),
    staff: createTestUser('staff'),
    customer: createTestUser('customer'),
  };
}

/** Clean up test users created in this run. */
function cleanupTestUsers() {
  db.prepare("DELETE FROM users WHERE email LIKE '%@petcare.test'").run();
}

/** Restore dogs array and file to pre-test state (prevents test artifacts in dogs.json). */
function restoreDogs() {
  appModule._dogs = JSON.parse(JSON.stringify(_originalDogs));
  // Also restore the JSON file on disk
  const dogsFilePath = path.join(__dirname, '..', 'src', 'data', 'dogs.json');
  fs.writeFileSync(dogsFilePath, JSON.stringify(_originalDogs, null, 2), 'utf8');
}

module.exports = { app, db, request, createTestUser, createAllRoles, cleanupTestUsers, restoreDogs };
