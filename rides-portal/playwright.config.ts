import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const e2eDbPath = path.resolve(__dirname, '../rides-api/tests/data/analytics.portal.e2e.db');

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
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1400, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
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
        AUTH_DEVICE_CHALLENGE_ENABLED: 'false',
        AUTH_REQUIRE_VERIFIED_FOR_SENSITIVE: 'false',
        ANALYTICS_DB_PATH: e2eDbPath,
        RATE_LIMIT_MAX_LOGIN: '10000',
        RATE_LIMIT_MAX_SIGNUP: '10000',
        RATE_LIMIT_WINDOW_MS: String(60 * 1000),
      },
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5174',
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
