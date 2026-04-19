import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const e2eDbPath = path.resolve(__dirname, '../rides-api/tests/data/analytics.e2e.db');
const fullMatrix = process.env.PW_FULL_MATRIX === '1';
const includeMobile = process.env.PW_INCLUDE_MOBILE === '1';
const e2eAdminEmail = process.env.E2E_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@unforgettablerides.com';
const e2eAdminPassword = process.env.E2E_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin123';

// Keep test runner credentials and API seeding credentials aligned.
process.env.E2E_ADMIN_EMAIL = e2eAdminEmail;
process.env.E2E_ADMIN_PASSWORD = e2eAdminPassword;

const projects = fullMatrix
  ? ([
      { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
      { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
      { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ] as Array<{ name: string; use: any }>)
  : [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }];

if (includeMobile) {
  projects.push({ name: 'mobile-chrome', use: { ...devices['Pixel 7'] } });
}

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1600, height: 1000 },
  },
  projects,
  webServer: [
    {
      command: 'node ./e2e/start-api.cjs',
      port: 3000,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: '3000',
        ADMIN_EMAIL: e2eAdminEmail,
        ADMIN_PASSWORD: e2eAdminPassword,
        JWT_SECRET: process.env.JWT_SECRET || 'rides-e2e-jwt-secret',
        AUTH_DEVICE_CHALLENGE_ENABLED: 'false',
        ANALYTICS_DB_PATH: e2eDbPath,
        RATE_LIMIT_MAX_LOGIN: '10000',
        RATE_LIMIT_MAX_SIGNUP: '10000',
        RATE_LIMIT_WINDOW_MS: String(60 * 1000),
      },
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});

