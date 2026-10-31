import { test, expect } from './support/fixtures';
import { GAME_ID } from './support/mock-football-api';

test('mobile navigation remains tappable after scrolling and viewport changes', async ({
  page,
}) => {
  await page.goto(`/${GAME_ID}`);
  await expect(
    page.getByLabel('สถานะข้อมูล: saved', { exact: true }),
  ).toBeVisible();
  for (const height of [560, 844]) {
    await page.setViewportSize({ width: 390, height });
    for (const name of ['ทีม', 'ตาราง', 'แท็กติก', 'ตั้งค่า', 'หน้าหลัก']) {
      await page.locator('.scrollbar-none').evaluate((scroller) => {
        scroller.scrollTop = scroller.scrollHeight;
      });
      await page
        .getByRole('navigation', { name: 'เมนูหลัก' })
        .getByRole('button', { name, exact: true })
        .tap();
      await expect
        .poll(() =>
          page
            .locator('.scrollbar-none')
            .evaluate((scroller) => scroller.scrollTop),
        )
        .toBe(0);
      const nav = await page
        .getByRole('navigation', { name: 'เมนูหลัก' })
        .boundingBox();
      expect(nav).not.toBeNull();
      expect(nav!.y + nav!.height).toBeLessThanOrEqual(height + 1);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <= innerWidth &&
            window.scrollY === 0,
        ),
      ).toBe(true);
    }
  }
});

test('mobile quick scores keep the keyboard closed initially and update on resume/reload', async ({
  page,
  api,
}) => {
  await page.goto(`/${GAME_ID}`);
  await page.getByRole('button', { name: 'ตาราง', exact: true }).tap();
  await page.getByRole('button', { name: /^กรอกสกอร์ Match 1:/ }).tap();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeFocused();
  await dialog
    .getByRole('textbox', { name: 'สกอร์ทีม Green', exact: true })
    .fill('2');
  await expect.poll(() => api.game().state.matches[0].teamAScore).toBe(2);
  await dialog.getByRole('button', { name: 'Close', exact: true }).tap();
  await page.getByRole('button', { name: 'หน้าหลัก', exact: true }).tap();
  await expect(
    page.getByLabel('สถานะข้อมูล: saved', { exact: true }),
  ).toBeVisible();
  api.remoteUpdate((state) => {
    state.matches[0].teamAScore = 4;
  });
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  await expect(
    page.getByRole('textbox', { name: 'สกอร์ทีม Green', exact: true }),
  ).toHaveValue('4');
  await page.reload();
  await expect(
    page.getByRole('textbox', { name: 'สกอร์ทีม Green', exact: true }),
  ).toHaveValue('4');
});

test('WebKit tactic markers drag without moving the page and the share image renders', async ({
  page,
}) => {
  await page.goto(`/${GAME_ID}`);
  await page.getByRole('button', { name: 'แท็กติก', exact: true }).tap();
  const marker = page.getByRole('button', { name: /^ย้าย / }).first();
  await expect(page.getByRole('button', { name: /^ย้าย / })).toHaveCount(15);
  await marker.scrollIntoViewIfNeeded();
  await expect(marker).toHaveCSS('touch-action', 'none');
  const before = await marker.getAttribute('style');
  const rect = await marker.boundingBox();
  await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    rect!.x + rect!.width / 2 + 25,
    rect!.y + rect!.height / 2 - 20,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect.poll(() => marker.getAttribute('style')).not.toBe(before);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole('button', { name: 'หน้าหลัก', exact: true }).tap();
  await page.getByRole('button', { name: 'แชร์ตาราง', exact: true }).tap();
  await expect
    .poll(() =>
      page
        .locator('canvas')
        .evaluate((canvas) => [
          (canvas as HTMLCanvasElement).width,
          (canvas as HTMLCanvasElement).height,
        ]),
    )
    .toEqual([1080, 1600]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
