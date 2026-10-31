import { defineConfig } from '@playwright/test';

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
  use: {
    baseURL: localOrigin,
    browserName: 'chromium',
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {}),
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
    // Also stop DNS/preconnects to external hosts, including the app's Neon
    // preconnect hint. Mocked requests are fulfilled before DNS is needed.
    launchOptions: {
      args: [
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
      ],
    },
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
