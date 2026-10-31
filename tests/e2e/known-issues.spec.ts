import { test, expect } from './support/fixtures';
import { GAME_ID } from './support/mock-football-api';

// Remaining audit findings use test.fail(); repaired backup behavior is tested
// normally. A future fix produces an unexpected pass, prompting removal of
// test.fail(). Setup must succeed first so a bad selector is not hidden.
test('known issue: a game deleted elsewhere should stop showing saved/editable', async ({
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
  test.fail(true, 'Audit: a null poll response is currently ignored.');
  await expect(
    page.getByLabel('สถานะข้อมูล: saved', { exact: true }),
  ).toHaveCount(0, { timeout: 1500 });
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

test('known issue: three-digit F/A totals should fit at 320px', async ({
  page,
  api,
}) => {
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
  test.fail(
    true,
    'Audit: 7% columns are too narrow for three digits at 320px.',
  );
  expect(overflowingTotals).toBe(0);
});
