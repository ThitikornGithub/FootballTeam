import { test, expect } from './support/fixtures';

test('a lost create response can be retried after reload without duplicating or losing draft scores', async ({
  page,
  api,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'ลองด้วยข้อมูลตัวอย่าง', exact: true })
    .click();
  api.dropNextCreateResponse = true;
  await page.getByRole('button', { name: /เกมนี้อยู่เฉพาะเครื่อง/ }).click();
  await expect(
    page.getByRole('button', { name: /เกมนี้อยู่เฉพาะเครื่อง/ }),
  ).toBeVisible();
  expect(api.games.size).toBe(2);
  const first = api.calls.find(
    (call) => call.name === 'create_football_game_v2',
  )!;
  const createdId = [...api.games.keys()].find(
    (id) => api.game(id).state.id !== 'game20260102-1',
  )!;
  const fixtures = api
    .game(createdId)
    .state.matches.map(
      ({ teamAId, teamBId, teamAGkPlayerId, teamBGkPlayerId, startTime }) => ({
        teamAId,
        teamBId,
        teamAGkPlayerId,
        teamBGkPlayerId,
        startTime,
      }),
    );
  await page
    .getByRole('textbox', { name: 'สกอร์ทีม Green', exact: true })
    .fill('3');
  await page.reload();
  await page.getByRole('button', { name: 'เปิดต่อ', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'สกอร์ทีม Green', exact: true }),
  ).toHaveValue('3');
  await page.getByRole('button', { name: /เกมนี้อยู่เฉพาะเครื่อง/ }).click();
  await expect(
    page.getByLabel('สถานะข้อมูล: saved', { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => api.game(createdId).state.matches[0].teamAScore)
    .toBe(3);
  expect(api.games.size).toBe(2);
  expect(
    api.calls
      .filter((call) => call.name === 'create_football_game_v2')
      .map((call) => call.body.p_request_id),
  ).toEqual([first.body.p_request_id, first.body.p_request_id]);
  expect(
    api
      .game(createdId)
      .state.matches.map(
        ({
          teamAId,
          teamBId,
          teamAGkPlayerId,
          teamBGkPlayerId,
          startTime,
        }) => ({
          teamAId,
          teamBId,
          teamAGkPlayerId,
          teamBGkPlayerId,
          startTime,
        }),
      ),
  ).toEqual(fixtures);
});

test('retrying creation adopts another phones newer revision instead of overwriting its goal', async ({
  page,
  api,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'ลองด้วยข้อมูลตัวอย่าง', exact: true })
    .click();
  api.dropNextCreateResponse = true;
  await page.getByRole('button', { name: /เกมนี้อยู่เฉพาะเครื่อง/ }).click();
  await expect(
    page.getByRole('button', { name: /เกมนี้อยู่เฉพาะเครื่อง/ }),
  ).toBeVisible();
  const createdId = [...api.games.keys()].find(
    (id) => id !== 'game20260102-1',
  )!;
  api.remoteUpdate((state) => {
    state.matches[0].teamAScore = 5;
    state.matches[0].teamBScore = 0;
  }, createdId);
  await page
    .getByRole('textbox', { name: 'สกอร์ทีม Green', exact: true })
    .fill('2');
  await page.getByRole('button', { name: /เกมนี้อยู่เฉพาะเครื่อง/ }).click();
  await expect(
    page.getByLabel('สถานะข้อมูล: saved', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'มีอีกเครื่องบันทึกก่อนเครื่องนี้', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'เข้าใจแล้ว', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'สกอร์ทีม Green', exact: true }),
  ).toHaveValue('5');
  expect(api.game(createdId).revision).toBe(2);
  expect(api.games.size).toBe(2);
  expect(
    api.calls.filter((call) => call.name === 'save_football_game_v2'),
  ).toHaveLength(0);
});

test('a deleted game is never resurrected by retrying its create request', async ({
  page,
  api,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'ลองด้วยข้อมูลตัวอย่าง', exact: true })
    .click();
  api.dropNextCreateResponse = true;
  await page.getByRole('button', { name: /เกมนี้อยู่เฉพาะเครื่อง/ }).click();
  await expect(
    page.getByRole('button', { name: /เกมนี้อยู่เฉพาะเครื่อง/ }),
  ).toBeVisible();
  const createdId = [...api.games.keys()].find(
    (id) => id !== 'game20260102-1',
  )!;
  api.games.delete(createdId);
  await page.getByRole('button', { name: /เกมนี้อยู่เฉพาะเครื่อง/ }).click();
  await expect(page.locator('output')).toContainText('เกมจากคำขอนี้ถูกลบแล้ว');
  expect(api.games.size).toBe(1);
});

test('double taps and reload during creation preserve one game and the latest score', async ({
  page,
  api,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'ลองด้วยข้อมูลตัวอย่าง', exact: true })
    .click();
  const held = api.holdNextCreateResponse();
  await page
    .getByRole('button', { name: /เกมนี้อยู่เฉพาะเครื่อง/ })
    .evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
  await expect.poll(() => api.games.size).toBe(2);
  await page
    .getByRole('textbox', { name: 'สกอร์ทีม Green', exact: true })
    .fill('4');
  expect(
    api.calls.filter((call) => call.name === 'create_football_game_v2'),
  ).toHaveLength(1);
  await page.reload();
  await page.getByRole('button', { name: 'เปิดต่อ', exact: true }).click();
  await page.getByRole('button', { name: /เกมนี้อยู่เฉพาะเครื่อง/ }).click();
  await expect(
    page.getByLabel('สถานะข้อมูล: saved', { exact: true }),
  ).toBeVisible();
  const createdId = [...api.games.keys()].find(
    (id) => id !== 'game20260102-1',
  )!;
  expect(api.game(createdId).state.matches[0].teamAScore).toBe(4);
  expect(
    api.calls.filter((call) => call.name === 'create_football_game_v2'),
  ).toHaveLength(2);
  held.release();
});

test('copying the same settings deliberately creates a separate game with a new request ID', async ({
  page,
  api,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'ลองด้วยข้อมูลตัวอย่าง', exact: true })
    .click();
  await page.getByRole('button', { name: /เกมนี้อยู่เฉพาะเครื่อง/ }).click();
  await expect(
    page.getByLabel('สถานะข้อมูล: saved', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'ตั้งค่า', exact: true }).click();
  await page
    .getByRole('button', { name: 'สร้างเกมใหม่จากการตั้งค่านี้', exact: true })
    .click();
  await page.getByRole('button', { name: 'สร้างตารางใหม่', exact: true }).click();
  await expect(
    page.getByLabel('สถานะข้อมูล: saved', { exact: true }),
  ).toBeVisible();
  const calls = api.calls.filter(
    (call) => call.name === 'create_football_game_v2',
  );
  expect(calls).toHaveLength(2);
  expect(calls[0].body.p_request_id).not.toBe(calls[1].body.p_request_id);
  expect(api.games.size).toBe(3);
  const states = [...api.games.values()]
    .filter((game) => game.id !== 'game20260102-1')
    .map((game) => game.state);
  expect(states[0].teams).toEqual(states[1].teams);
  expect(states[0].matchDurationMinutes).toBe(states[1].matchDurationMinutes);
  expect(states[0].breakDurationMinutes).toBe(states[1].breakDurationMinutes);
});

test('a lost response can be retried in the same tab even when storage is blocked', async ({
  page,
  context,
  api,
}) => {
  await context.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Simulated quota', 'QuotaExceededError');
    };
  });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'ลองด้วยข้อมูลตัวอย่าง', exact: true })
    .click();
  api.dropNextCreateResponse = true;
  await page.getByRole('button', { name: /เกมนี้อยู่เฉพาะเครื่อง/ }).click();
  await expect(page.getByRole('alert')).toContainText(
    'สำรองข้อมูลที่แก้ในเครื่องไม่สำเร็จ',
  );
  await page.getByRole('button', { name: /เกมนี้อยู่เฉพาะเครื่อง/ }).click();
  await expect(
    page.getByLabel('สถานะข้อมูล: saved', { exact: true }),
  ).toBeVisible();
  expect(api.games.size).toBe(2);
  const requests = api.calls.filter(
    (call) => call.name === 'create_football_game_v2',
  );
  expect(requests).toHaveLength(2);
  expect(requests[0].body.p_request_id).toBe(requests[1].body.p_request_id);
});
