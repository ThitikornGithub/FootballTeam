import { test, expect } from './support/fixtures';
import { GAME_ID } from './support/mock-football-api';

test('older unclosed games have an age hint, not LIVE, without rewriting game data', async ({
  page,
  api,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-31T03:00:00Z'));
  const before = api.game();
  await page.goto(`/${GAME_ID}`);
  await expect(
    page.getByRole('complementary', { name: 'เกมจากวันก่อน' }),
  ).toBeVisible();
  await expect(page.getByText('แมตช์ที่ยังไม่จบ', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ตาราง', exact: true }).click();
  await expect(page.getByText(/LIVE/)).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /^กรอกสกอร์ Match 1:/ }),
  ).toBeVisible();
  expect(api.game()).toEqual(before);
  expect(
    api.calls.filter(
      (call) =>
        call.name.startsWith('save_') || call.name.startsWith('create_'),
    ),
  ).toHaveLength(0);
  await page.goto('/allgames');
  await expect(page.getByText('สร้างก่อนวันนี้', { exact: true })).toBeVisible();
});

test('an overnight game stays live until its scheduled end and closed games have no age warning', async ({
  page,
  api,
}) => {
  await page.clock.setFixedTime(new Date('2026-01-02T18:00:00Z')); // 01:00 Bangkok, Jan 3.
  api.remoteUpdate((state) => {
    state.startTime = '23:00';
    state.availableTimeMinutes = 180;
  });
  await page.goto(`/${GAME_ID}`);
  await expect(
    page.getByLabel('สถานะข้อมูล: saved', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'เกมจากวันก่อน' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'ตาราง', exact: true }).click();
  await expect(page.getByText('● LIVE', { exact: true })).toBeVisible();
  api.remoteUpdate((state) => {
    state.closedAt = '2026-01-02T18:00:00Z';
  });
  await page.reload();
  await expect(page.getByText('เกมนี้จบแล้ว', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ตาราง', exact: true }).click();
  await expect(page.getByText(/LIVE/)).toHaveCount(0);
});
