import { test, expect } from './support/fixtures';
import { GAME_ID } from './support/mock-football-api';

test('direct game and allgames links work with both browser stores blocked', async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException('Simulated blocked storage', 'SecurityError');
    };
  });
  await page.goto(`/${GAME_ID}?v=test#score`);
  await expect(
    page.getByLabel('สถานะข้อมูล: saved', { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(`http://localhost:3210/${GAME_ID}?v=test#score`);
  expect(page.url()).not.toContain('__football_path');
  await page.reload();
  await expect(
    page.getByRole('textbox', { name: 'สกอร์ทีม Green', exact: true }),
  ).toBeVisible();
  await page.goto('/allgames');
  await expect(
    page.getByRole('heading', { name: 'เกมทั้งหมด', exact: true }),
  ).toBeVisible();
  expect(page.url()).not.toContain('__football_path');
});

test('untrusted redirect hints cannot navigate outside app routes', async ({
  page,
}) => {
  await page.goto(
    '/?__football_path=' + encodeURIComponent('https://example.invalid/'),
  );
  await expect(
    page.getByRole('button', { name: 'สร้างตารางใหม่', exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL('http://localhost:3210/');
});
