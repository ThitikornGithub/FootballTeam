import { test, expect } from './support/fixtures';
import { GAME_ID, LOCAL_ORIGIN, makeGame } from './support/mock-football-api';

test('root stays Home; allgames and direct game links open their own screens', async ({
  page,
  api,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'สร้างตารางใหม่', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'เมนูหลัก' })).toHaveCount(0);
  await page.goto('/allgames');
  await expect(
    page.getByRole('heading', { name: 'เกมทั้งหมด', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: /^E2E Friendly Match/ }).click();
  await expect(page).toHaveURL(new RegExp(`${GAME_ID}$`));
  await expect(
    page.getByLabel('สถานะข้อมูล: saved', { exact: true }),
  ).toBeVisible();
  expect(api.calls.some((call) => call.name === 'get_football_game')).toBe(
    true,
  );
});

test('quick score drafts survive reload, finish advances the match, and F/A follow the right teams', async ({
  page,
  api,
}) => {
  await page.goto(`/${GAME_ID}`);
  await page.getByRole('button', { name: 'ตาราง', exact: true }).click();
  await page.getByRole('button', { name: /^กรอกสกอร์ Match 1:/ }).click();
  const popup = page.getByRole('dialog');
  await expect(popup).toBeVisible();
  // Opening the popup must not select a score or open the phone keyboard.
  await expect(popup).toBeFocused();
  await popup
    .getByRole('textbox', { name: 'สกอร์ทีม Green', exact: true })
    .fill('2');
  await popup
    .getByRole('textbox', { name: 'สกอร์ทีม Red', exact: true })
    .fill('1');
  await expect.poll(() => api.game().state.matches[0].teamAScore).toBe(2);
  await expect.poll(() => api.game().state.matches[0].teamBScore).toBe(1);
  expect(api.game().state.matches[0].status).toBe('current');
  await page.reload();
  await expect(
    page.getByRole('textbox', { name: 'สกอร์ทีม Green', exact: true }),
  ).toHaveValue('2');
  await expect(
    page.getByRole('textbox', { name: 'สกอร์ทีม Red', exact: true }),
  ).toHaveValue('1');
  await page
    .getByRole('button', { name: 'บันทึกผลและจบเกม', exact: true })
    .click();
  await expect.poll(() => api.game().state.matches[0].status).toBe('finished');
  expect(api.game().state.matches[1].status).toBe('current');
  const green = page
    .getByRole('rowheader', { name: /ทีม Green$/ })
    .locator('..');
  await expect(green.locator('td')).toHaveText([
    '1',
    '1',
    '0',
    '0',
    '2',
    '1',
    '+1',
    '3',
  ]);
  // M and time retain the full detail screen, not the quick-score popup.
  await page.getByRole('button', { name: 'ตาราง', exact: true }).click();
  await page
    .getByRole('button', { name: 'เปิดรายละเอียด Match 1', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Match 1', exact: true }),
  ).toBeVisible();
});

test('newer edits remain queued while an older save is in flight', async ({
  page,
  api,
}) => {
  await page.goto(`/${GAME_ID}`);
  const score = page.getByRole('textbox', {
    name: 'สกอร์ทีม Green',
    exact: true,
  });
  const held = api.holdNextSave();
  await score.fill('1');
  await expect
    .poll(
      () =>
        api.calls.filter((call) => call.name === 'save_football_game_v2')
          .length,
    )
    .toBe(1);
  await score.fill('3');
  held.release();
  await expect.poll(() => api.game().state.matches[0].teamAScore).toBe(3);
  await expect(
    page.getByLabel('สถานะข้อมูล: saved', { exact: true }),
  ).toBeVisible();
  expect(
    api.calls.filter((call) => call.name === 'save_football_game_v2').length,
  ).toBeGreaterThanOrEqual(2);
});

test('failed saves wait for backoff and retry the newest score', async ({
  page,
  api,
}) => {
  await page.goto(`/${GAME_ID}`);
  await expect(
    page.getByLabel('สถานะข้อมูล: saved', { exact: true }),
  ).toBeVisible();
  await page.clock.install();
  api.failSaves = true;
  const score = page.getByRole('textbox', {
    name: 'สกอร์ทีม Green',
    exact: true,
  });
  await score.fill('1');
  await page.clock.runFor(500);
  await expect(
    page.getByLabel('สถานะข้อมูล: error', { exact: true }),
  ).toBeVisible();
  await score.fill('3');
  await page.clock.runFor(1000);
  expect(
    api.calls.filter((call) => call.name === 'save_football_game_v2'),
  ).toHaveLength(1);
  api.failSaves = false;
  await page.clock.runFor(3000);
  await expect.poll(() => api.game().state.matches[0].teamAScore).toBe(3);
  await expect(
    page.getByLabel('สถานะข้อมูล: saved', { exact: true }),
  ).toBeVisible();
});

test('offline reload uses its pending backup, then refresh syncs it on reconnect', async ({
  page,
  api,
}) => {
  await page.goto(`/${GAME_ID}`);
  api.failSaves = true;
  await page
    .getByRole('textbox', { name: 'สกอร์ทีม Green', exact: true })
    .fill('4');
  await expect(
    page.getByLabel('สถานะข้อมูล: error', { exact: true }),
  ).toBeVisible();
  api.offline = true;
  await page.reload();
  await expect(
    page.getByRole('textbox', { name: 'สกอร์ทีม Green', exact: true }),
  ).toHaveValue('4');
  expect(api.game().state.matches[0].teamAScore).toBeUndefined();
  api.offline = false;
  api.failSaves = false;
  await page.getByRole('button', { name: 'ดึงข้อมูลล่าสุด', exact: true }).click();
  await expect.poll(() => api.game().state.matches[0].teamAScore).toBe(4);
  await expect(
    page.getByLabel('สถานะข้อมูล: saved', { exact: true }),
  ).toBeVisible();
});

test('two phones with stale revisions cannot silently overwrite a saved goal', async ({
  page,
  api,
  browser,
}) => {
  const secondContext = await browser.newContext({ serviceWorkers: 'block' });
  await api.install(secondContext);
  try {
    const second = await secondContext.newPage();
    await page.goto(`/${GAME_ID}`);
    await second.goto(`${LOCAL_ORIGIN}/${GAME_ID}`);
    await expect(
      second.getByLabel('สถานะข้อมูล: saved', { exact: true }),
    ).toBeVisible();
    // Freeze this phone's poll before the other phone saves its goal.
    await second.clock.install();
    await page
      .getByRole('textbox', { name: 'สกอร์ทีม Green', exact: true })
      .fill('2');
    await expect.poll(() => api.game().state.matches[0].teamAScore).toBe(2);
    await second
      .getByRole('textbox', { name: 'สกอร์ทีม Red', exact: true })
      .fill('1');
    await second.clock.runFor(500);
    await expect(
      second.getByRole('heading', { name: 'มีอีกเครื่องบันทึกก่อนเครื่องนี้' }),
    ).toBeVisible();
    expect(api.game().state.matches[0].teamAScore).toBe(2);
    expect(api.game().state.matches[0].teamBScore).toBe(0);
    await second.getByRole('button', { name: 'เข้าใจแล้ว', exact: true }).click();
    await expect(
      second.getByRole('textbox', { name: 'สกอร์ทีม Green', exact: true }),
    ).toHaveValue('2');
  } finally {
    await secondContext.close();
  }
});

test('refresh adopts a remote update without reopening the game', async ({
  page,
  api,
}) => {
  await page.goto(`/${GAME_ID}`);
  await expect(
    page.getByLabel('สถานะข้อมูล: saved', { exact: true }),
  ).toBeVisible();
  api.remoteUpdate((state) => {
    state.matches[0].teamAScore = 5;
    state.matches[0].teamBScore = 2;
  });
  await page.getByRole('button', { name: 'ดึงข้อมูลล่าสุด', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'สกอร์ทีม Green', exact: true }),
  ).toHaveValue('5');
  await expect(
    page.getByRole('textbox', { name: 'สกอร์ทีม Red', exact: true }),
  ).toHaveValue('2');
});

test('switching games keeps each game score and URL separate', async ({
  page,
  api,
}) => {
  const second = makeGame('game20260102-2');
  second.state.name = 'E2E Other Game';
  second.state.matches[0].teamAScore = 7;
  second.state.matches[0].teamBScore = 0;
  api.games.set(second.id, second);
  await page.goto(`/${GAME_ID}`);
  await expect(
    page.getByLabel('สถานะข้อมูล: saved', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'ตั้งค่า', exact: true }).click();
  await page.getByRole('button', { name: /เกมทั้งหมด/ }).click();
  await page.getByRole('button', { name: /^E2E Other Game/ }).click();
  await expect(page).toHaveURL(new RegExp(`${second.id}$`));
  await expect(
    page.getByRole('textbox', { name: 'สกอร์ทีม Green', exact: true }),
  ).toHaveValue('7');
  expect(api.game().state.matches[0].teamAScore).toBeUndefined();
});

test('renaming and swapping shirt colours preserve the existing fixture and GK order', async ({
  page,
  api,
}) => {
  const original = api.game().state;
  const rosterOrder = (state: typeof original) =>
    state.teams.map((team) => ({
      id: team.id,
      players: team.players,
      gkRotation: team.gkRotation,
      gkCycleOrders: team.gkCycleOrders,
    }));
  await page.goto(`/${GAME_ID}`);
  await page.getByRole('button', { name: 'ตั้งค่า', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'ชื่อเกม', exact: true })
    .fill('E2E renamed safely');
  await page
    .getByRole('button', { name: 'เปลี่ยนสีเสื้อทีม Green เป็นRed', exact: true })
    .click();
  await page.getByRole('button', { name: 'บันทึกการตั้งค่า', exact: true }).click();
  await expect.poll(() => api.game().state.name).toBe('E2E renamed safely');
  const saved = api.game().state;
  expect(saved.teams[0].color).toBe('red');
  expect(saved.teams[1].color).toBe('green');
  expect(saved.matches).toEqual(original.matches);
  expect(rosterOrder(saved)).toEqual(rosterOrder(original));
});

for (const width of [320, 480]) {
  test(`mobile menu, F/A, tactics and share preview fit at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/${GAME_ID}`);
    await expect(page.locator('thead th')).toHaveText([
      'ทีม',
      'แข่ง',
      'ช',
      'ส',
      'พ',
      'F',
      'A',
      '+/-',
      'แต้ม',
    ]);
    await page.getByRole('button', { name: 'ตาราง', exact: true }).click();
    await page.locator('.scrollbar-none').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.getByRole('button', { name: 'หน้าหลัก', exact: true }).click();
    await expect
      .poll(() =>
        page.locator('.scrollbar-none').evaluate((el) => el.scrollTop),
      )
      .toBe(0);
    await page.getByRole('button', { name: 'แท็กติก', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'กระดานแท็กติก', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /^ย้าย / })).toHaveCount(15);
    await page.getByRole('button', { name: 'หน้าหลัก', exact: true }).click();
    await page.getByRole('button', { name: 'แชร์ตาราง', exact: true }).click();
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
}
