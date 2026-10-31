import { test as base, expect } from '@playwright/test';
import { MockFootballApi } from './mock-football-api';

export const test = base.extend<{ api: MockFootballApi }>({
  api: async ({ context }, run) => {
    const api = new MockFootballApi();
    await api.install(context);
    try {
      await run(api);
    } finally {
      api.releasePendingRequests();
      expect(
        api.blockedRequests,
        'No unexpected external request may escape the test sandbox',
      ).toEqual([]);
    }
  },
  // Automatic dependency: interception exists before Playwright creates a page.
  page: async ({ context, api }, run) => {
    void api;
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await run(page);
    } finally {
      await page.close();
      expect(errors, 'No uncaught browser error').toEqual([]);
    }
  },
});

export { expect };
