import { defineConfig, devices } from '@playwright/test';

// Intentionally fixed to loopback: never point this suite at a live website.
const localOrigin = 'http://localhost:3210';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  projects: [
    {
      name: 'chromium',
      testIgnore: /mobile-webkit\.spec\.ts/,
      use: {
        browserName: 'chromium',
        ...(process.env.PLAYWRIGHT_CHANNEL
          ? { channel: process.env.PLAYWRIGHT_CHANNEL }
          : {}),
        launchOptions: {
          args: [
            '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
          ],
        },
      },
    },
    {
      name: 'webkit-mobile',
      testMatch: /mobile-webkit\.spec\.ts/,
      use: {
        ...devices['iPhone 13'],
        browserName: 'webkit',
        // A closed loopback proxy also contains preconnect/DNS traffic that
        // WebKit cannot block with Chromium's host-resolver flag. RPCs still
        // go through the same memory fixture, never through this proxy.
        proxy: { server: 'http://127.0.0.1:9', bypass: 'localhost,127.0.0.1' },
      },
    },
  ],
  use: {
    baseURL: localOrigin,
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 3210 --strictPort',
    url: localOrigin,
    // Fail on a port collision rather than testing an unrelated running app.
    reuseExistingServer: false,
    timeout: 90_000,
    env: {
      GITHUB_PAGES: 'false',
      NEXT_PUBLIC_BASE_PATH: '',
      NEXT_PUBLIC_SITE_URL: localOrigin,
    },
  },
});
