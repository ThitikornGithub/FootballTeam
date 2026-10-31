import { test, expect } from './support/fixtures';
import { GAME_ID } from './support/mock-football-api';

test('a game deleted elsewhere stops showing saved/editable and disappears from the list', async ({
  page,
  api,
}) => {
  await page.goto(`/${GAME_ID}`);
  await expect(
    page.getByLabel('สถานะข้อมูล: saved', { exact: true }),
  ).toBeVisible();
  await page.clock.install();
  const initialReads = api.calls.filter(
    (call) => call.name === 'get_football_game',
  ).length;
  api.games.delete(GAME_ID); // Memory fixture only.
  await page.clock.runFor(5100);
  await expect
    .poll(
      () =>
        api.calls.filter((call) => call.name === 'get_football_game').length,
    )
    .toBeGreaterThan(initialReads);
  await expect(
    page.getByLabel('สถานะข้อมูล: saved', { exact: true }),
  ).toHaveCount(0, { timeout: 1500 });
  await expect(page.getByRole('alert')).toContainText('เกมนี้ถูกลบจากอีกเครื่องแล้ว');
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'ดูเกมทั้งหมด', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'เกมทั้งหมด', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^E2E Friendly Match/ }),
  ).toHaveCount(0);
});

test('failed local backup shows an accurate persistent warning until saved online', async ({
  page,
  context,
  api,
}) => {
  await context.addInitScript(() => {
    // oxlint-disable-next-line typescript/unbound-method -- called below with the original Storage receiver via .call().
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === window.localStorage)
        throw new DOMException(
          'Simulated full local storage',
          'QuotaExceededError',
        );
      return original.call(this, key, value);
    };
  });
  await page.goto(`/${GAME_ID}`);
  await expect(
    page.getByLabel('สถานะข้อมูล: saved', { exact: true }),
  ).toBeVisible();
  api.failSaves = true;
  await page
    .getByRole('textbox', { name: 'สกอร์ทีม Green', exact: true })
    .fill('3');
  await expect(
    page.getByLabel('สถานะข้อมูล: error', { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await expect(page.locator('output')).toContainText('สำรองในเครื่องไม่สำเร็จ');
  await expect(page.getByRole('alert')).toContainText(
    'สำรองข้อมูลที่แก้ในเครื่องไม่สำเร็จ',
  );
  await page.clock.install();
  await page.clock.runFor(2500);
  await expect(page.getByRole('alert')).toBeVisible();
  api.failSaves = false;
  await page.getByRole('button', { name: 'ดึงข้อมูลล่าสุด', exact: true }).click();
  await expect.poll(() => api.game().state.matches[0].teamAScore).toBe(3);
  await expect(
    page.getByLabel('สถานะข้อมูล: saved', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('failed publishing never claims an unbacked draft was saved locally', async ({
  page,
  context,
  api,
}) => {
  await context.addInitScript(() => {
    // oxlint-disable-next-line typescript/unbound-method -- preserve the receiver with .call().
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === window.localStorage)
        throw new DOMException('Simulated quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  api.offline = true;
  await page.goto('/');
  await page
    .getByRole('button', { name: 'ลองด้วยข้อมูลตัวอย่าง', exact: true })
    .click();
  await page.getByRole('button', { name: /เกมนี้อยู่เฉพาะเครื่อง/ }).click();
  await expect(page.locator('output')).toContainText(
    'ยังสร้างเกมและสำรองในเครื่องไม่สำเร็จ',
  );
  await expect(page.getByRole('alert')).toBeVisible();
  expect(api.games.size).toBe(1);
  api.offline = false;
  await page.getByRole('button', { name: /เกมนี้อยู่เฉพาะเครื่อง/ }).click();
  await expect(
    page.getByLabel('สถานะข้อมูล: saved', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(api.games.size).toBe(2);
});

test('three-digit F/A totals fit at 320px', async ({ page, api }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  // Scores are synthetic and only exist inside the mock server.
  api.remoteUpdate((state) => {
    state.matches.forEach((match) => {
      match.status = 'finished';
      match.teamAScore = 35;
      match.teamBScore = 35;
    });
  });
  await page.goto(`/${GAME_ID}`);
  await expect(page.locator('tbody tr')).toHaveCount(4);
  const overflowingTotals = await page
    .locator('tbody tr td:nth-child(6), tbody tr td:nth-child(7)')
    .evaluateAll(
      (cells) =>
        cells.filter((cell) => {
          const range = document.createRange();
          range.selectNodeContents(cell);
          const text = range.getBoundingClientRect();
          const bounds = cell.getBoundingClientRect();
          return text.left < bounds.left || text.right > bounds.right;
        }).length,
    );
  expect(overflowingTotals).toBe(0);
  expect(
    await page
      .locator('tbody th span.truncate')
      .evaluateAll((labels) =>
        labels.every((label) => label.scrollWidth <= label.clientWidth),
      ),
  ).toBe(true);
});

test('a missing-game save preserves the pending backup and stops retrying', async ({
  page,
  api,
}) => {
  await page.goto(`/${GAME_ID}`);
  await expect(
    page.getByLabel('สถานะข้อมูล: saved', { exact: true }),
  ).toBeVisible();
  await page.clock.install();
  api.games.delete(GAME_ID);
  await page
    .getByRole('textbox', { name: 'สกอร์ทีม Green', exact: true })
    .fill('3');
  await page.clock.runFor(500);
  await expect(page.getByRole('alert')).toContainText('เกมนี้ถูกลบจากอีกเครื่องแล้ว');
  const backups = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('football-match-maker-game-backup-v2:'))
      .map((key) => JSON.parse(localStorage.getItem(key)!)),
  );
  expect(
    backups.some(
      (backup) =>
        backup.pendingSync && backup.tournament.matches[0].teamAScore === 3,
    ),
  ).toBe(true);
  const attempts = api.calls.filter(
    (call) => call.name === 'save_football_game_v2',
  ).length;
  await page.clock.runFor(15_000);
  expect(
    api.calls.filter((call) => call.name === 'save_football_game_v2'),
  ).toHaveLength(attempts);
  await page
    .getByRole('button', { name: 'เปิดข้อมูลที่ยังไม่บันทึก', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'สกอร์ทีม Green', exact: true }),
  ).toHaveValue('3');
  await page.reload();
  await page.getByRole('button', { name: 'เปิดต่อ', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'สกอร์ทีม Green', exact: true }),
  ).toHaveValue('3');
  expect(api.games.size).toBe(0);
});

test('temporary poll failures do not mark a game as deleted', async ({
  page,
  api,
}) => {
  await page.goto(`/${GAME_ID}`);
  await expect(
    page.getByLabel('สถานะข้อมูล: saved', { exact: true }),
  ).toBeVisible();
  await page.clock.install();
  api.offline = true;
  await page.clock.runFor(15_100);
  await expect(
    page.getByRole('textbox', { name: 'สกอร์ทีม Green', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('เกมนี้ถูกลบจากอีกเครื่องแล้ว')).toHaveCount(0);
});

test('remote deletion keeps unsent data recoverable even when local backup fails', async ({
  page,
  context,
  api,
}) => {
  await context.addInitScript(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException('Simulated quota', 'QuotaExceededError');
    };
  });
  await page.goto(`/${GAME_ID}`);
  await expect(
    page.getByLabel('สถานะข้อมูล: saved', { exact: true }),
  ).toBeVisible();
  api.games.delete(GAME_ID);
  await page
    .getByRole('textbox', { name: 'สกอร์ทีม Green', exact: true })
    .fill('4');
  await expect(page.getByRole('alert')).toContainText('สำรองในเครื่องไม่สำเร็จ');
  await page
    .getByRole('button', { name: 'เปิดข้อมูลที่ยังไม่บันทึก', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'สกอร์ทีม Green', exact: true }),
  ).toHaveValue('4');
  await expect(page.getByRole('alert')).toContainText(
    'สำรองข้อมูลที่แก้ในเครื่องไม่สำเร็จ',
  );
  expect(api.games.size).toBe(0);
  expect(
    api.calls.filter((call) => call.name === 'create_football_game'),
  ).toHaveLength(0);
});

test('large and signed standings numbers stay inside their columns', async ({
  page,
  api,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  api.remoteUpdate((state) =>
    state.matches.forEach((match) => {
      match.status = 'finished';
      match.teamAScore = 35;
      match.teamBScore = 0;
    }),
  );
  await page.goto(`/${GAME_ID}`);
  await expect(page.locator('tbody tr')).toHaveCount(4);
  const overflowing = await page.locator('tbody td').evaluateAll((cells) =>
    cells.some((cell) => {
      const range = document.createRange();
      range.selectNodeContents(cell);
      const text = range.getBoundingClientRect(),
        bounds = cell.getBoundingClientRect();
      return text.left < bounds.left || text.right > bounds.right;
    }),
  );
  expect(overflowing).toBe(false);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('four-digit standings scroll inside the table instead of expanding the page', async ({
  page,
  api,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  api.remoteUpdate((state) => {
    const cycle = state.matches;
    state.matches = Array.from({ length: 48 }, (_, index) => ({
      ...cycle[index % cycle.length],
      id: `long-match-${index}`,
      matchNumber: index + 1,
      status: 'finished',
      teamAScore: 99,
      teamBScore: 99,
    }));
  });
  await page.goto(`/${GAME_ID}`);
  await expect(page.locator('tbody tr')).toHaveCount(4);
  expect(
    await page
      .locator('table')
      .evaluate(
        (table) =>
          table.parentElement!.scrollWidth > table.parentElement!.clientWidth,
      ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
