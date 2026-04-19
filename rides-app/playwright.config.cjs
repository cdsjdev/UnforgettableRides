const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const e2eDbPath = path.resolve(__dirname, '../rides-api/tests/data/analytics.app.e2e.db');

module.exports = defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:19006',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 960 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node ./e2e/start-api.cjs',
      port: 3100,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: '3100',
        AUTH_DEVICE_CHALLENGE_ENABLED: 'false',
        AUTH_REQUIRE_VERIFIED_FOR_SENSITIVE: 'false',
        ANALYTICS_DB_PATH: e2eDbPath,
        RATE_LIMIT_MAX_LOGIN: '10000',
        RATE_LIMIT_MAX_SIGNUP: '10000',
        RATE_LIMIT_WINDOW_MS: String(60 * 1000),
      },
    },
    {
      command: 'npm run web:e2e',
      url: 'http://127.0.0.1:19006',
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        EXPO_PUBLIC_API_URL: 'http://127.0.0.1:3100/api/v1',
        CI: '1',
      },
    },
  ],
});
