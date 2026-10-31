import { test, expect } from './support/fixtures';
import { GAME_ID } from './support/mock-football-api';

test('RPC calls are fulfilled by the memory fixture without real credentials', async ({
  page,
  api,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async (id) => {
    const response = await fetch(
      'https://ep-falling-night-b3rsao2f.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1/rpc/get_football_game',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_game_id: id }),
      },
    );
    return response.json() as Promise<{ state: { name: string } }>;
  }, GAME_ID);
  expect(result.state.name).toBe('E2E Friendly Match');
  expect(result).toEqual(api.game());
});

test('the network guard blocks navigation to the production website', async ({
  page,
  api,
}) => {
  // The route guard and Chromium DNS denylist both apply. No request is sent
  // to production: this intentionally checks that a mistaken baseURL fails.
  await expect(
    page.goto('https://thitikorngithub.github.io/FootballTeam/'),
  ).rejects.toThrow();
  expect(api.blockedRequests.splice(0)).toEqual([
    'https://thitikorngithub.github.io/FootballTeam/',
  ]);
});
