import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { makeGame } from '../tests/e2e/support/mock-football-api';
import { parseTournament } from '../lib/football-schema';
import { TACTIC_FORMATIONS } from '../lib/football-types';

// No connection string, TCP server or production driver: PostgreSQL runs in RAM.
const db = new PGlite();
const migration = readFileSync(
  'db/migrations/20261031_data_integrity.sql',
  'utf8',
);
const createMigration = readFileSync(
  'db/migrations/20261031_idempotent_create.sql',
  'utf8',
);
const state = makeGame().state;
state.tactics = {
  teamAId: state.teams[0].id,
  teamBId: state.teams[1].id,
  notes: '',
  playerCount: 7,
  teamAFormation: '1-3-3',
  markers: [{ id: 'ball', kind: 'ball', label: 'ball', x: 50, y: 50 }],
  animationSteps: [
    {
      id: 'step-1',
      title: 'เริ่มต้น',
      markers: [{ id: 'ball', kind: 'ball', label: 'ball', x: 50, y: 50 }],
      paths: [
        {
          id: 'pass-1',
          kind: 'pass',
          from: { x: 50, y: 50 },
          to: { x: 20, y: 30 },
        },
      ],
    },
  ],
};
const json = (value: unknown) => JSON.stringify(value);
function changed(path: string, value: unknown) {
  const result = structuredClone(state) as unknown as Record<string, unknown>;
  const keys = path.split('.');
  let target = result;
  for (const key of keys.slice(0, -1))
    target = target[key] as Record<string, unknown>;
  const last = keys[keys.length - 1];
  if (value === undefined) delete target[last];
  else target[last] = value;
  return result;
}
async function sqlValid(value: unknown) {
  const result = await db.query<{ valid: boolean }>(
    'select public.football_state_is_valid($1::jsonb) valid',
    [json(value)],
  );
  return result.rows[0].valid;
}
async function create(date = '20261030') {
  const result = await db.query<{ game: { id: string; state: typeof state } }>(
    'select public.create_football_game($1::jsonb,$2) game',
    [json(state), date],
  );
  return result.rows[0].game;
}
try {
  await db.exec('create role anonymous; create role authenticated;');
  await db.exec(readFileSync('db/neon-schema.sql', 'utf8'));
  const legacy = structuredClone(state);
  legacy.id = 'game20261030-4';
  legacy.teams[0].name = 'เขียว · Yellow';
  legacy.matches[0].teamAScore = 2;
  legacy.matches[0].teamBScore = 1;
  legacy.matches[0].status = 'finished';
  await db.query(
    'insert into public.football_games(id,state,revision) values($1,$2::jsonb,7)',
    [legacy.id, json(legacy)],
  );
  const before = await db.query(
    'select * from public.football_games order by id',
  );
  await db.exec(migration);
  await db.exec(createMigration);
  assert.deepEqual(
    (await db.query('select * from public.football_games order by id')).rows,
    before.rows,
    'Migration must preserve all old game records, fixtures, scores, player/GK order and revisions',
  );
  assert.equal(await sqlValid(state), true);

  const invalid: [string, unknown][] = [
    ['teams.0.color', 'unsupported'],
    ['teams.0.color', null],
    ['teams.0.id', ''],
    ['teams.1.id', state.teams[0].id],
    ['teams.0.players', {}],
    ['teams.0.players.0.absentToday', 'false'],
    ['teams.0.players.0.positions', ['defender', 'defender']],
    ['teams.0.players.0.positions', ['not-a-position']],
    ['teams.0.gkRotation', ['missing-player']],
    ['teams.0.gkCycleOrders', [null]],
    ['teams.0.gkRotationLocked', 'yes'],
    ['teams.0.players.1.id', state.teams[0].players[0].id],
    ['matches.0.teamAId', 'missing-team'],
    ['matches.0.teamBId', state.matches[0].teamAId],
    ['matches.0.teamAScore', 3],
    ['matches.0.status', 'live'],
    ['matches.0.startTime', '25:00'],
    ['matches.0.matchNumber', 0],
    ['matches.0.roundNumber', 1.5],
    ['matches.1.id', state.matches[0].id],
    ['matches.0.teamAGkPlayerId', 7],
    ['matches.0.scorers', {}],
    [
      'matches.0.scorers',
      [{ id: 's', teamId: state.teams[0].id, playerName: ' ', goals: 1 }],
    ],
    [
      'matches.0.scorers',
      [{ id: 's', teamId: 'other', playerName: 'Test', goals: 1 }],
    ],
    [
      'matches.0.scorers',
      [
        {
          id: 's',
          teamId: state.teams[0].id,
          playerName: '😀'.repeat(31),
          goals: 1,
        },
      ],
    ],
    [
      'matches.0.scorers',
      [
        {
          id: 's',
          teamId: state.teams[0].id,
          playerName: '\u00a0\ufeff',
          goals: 1,
        },
      ],
    ],
    ['tactics.markers', []],
    ['tactics.markers.0.x', -1],
    ['tactics.markers.0.x', '50'],
    ['tactics.teamBId', state.teams[0].id],
    ['tactics.teamAFormation', 'unknown'],
    ['tactics.animationSteps.0.title', '😀'.repeat(21)],
    ['tactics.animationSteps.0.paths.0.to.y', 101],
    ['tactics.animationSteps', null],
    ['matchDurationMinutes', '7'],
    ['availableTimeMinutes', null],
    ['closedAt', false],
  ];
  for (const [path, value] of invalid) {
    const candidate = changed(path, value);
    assert.equal(
      parseTournament(candidate),
      null,
      `Fixture must be rejected by client: ${path}`,
    );
    assert.equal(
      await sqlValid(candidate),
      false,
      `SQL must reject without throwing: ${path}`,
    );
  }
  for (const [path, value] of [
    ['teams.0.players.0.positions', ['goalkeeper', 'defender']],
    ['teams.1.color', state.teams[0].color],
    ['matches.0.teamAGkPlayerId', 'legacy-deleted-player'],
    ['name', 'Legacy ชื่อเกม'],
    ['tactics.playerCount', '7'],
  ] as [string, unknown][]) {
    const candidate = changed(path, value);
    assert.ok(
      parseTournament(candidate),
      `Legacy client-compatible state: ${path}`,
    );
    assert.equal(
      await sqlValid(candidate),
      true,
      `SQL must retain legacy compatibility: ${path}`,
    );
  }
  for (const formation of TACTIC_FORMATIONS)
    assert.equal(
      await sqlValid(changed('tactics.teamAFormation', formation)),
      true,
    );
  for (const bad of [null, [], 7, {}, { ...state, teams: null }])
    assert.equal(await sqlValid(bad), false);

  const first = await create();
  assert.equal(
    first.id,
    'game20261030-5',
    'Counter must be seeded from the old highest ID',
  );
  assert.deepEqual(
    first.state.matches,
    state.matches,
    'Creation must not reshuffle any match',
  );
  assert.deepEqual(
    first.state.teams,
    state.teams,
    'Creation must not change players or GK order',
  );
  await db.query('select public.delete_football_game($1)', [first.id]);
  assert.equal(
    (await create()).id,
    'game20261030-6',
    'Deleting highest ID must not recycle it',
  );
  await db.exec('delete from public.football_games');
  assert.equal(
    (await create()).id,
    'game20261030-7',
    'Deleting every game must not reset the counter',
  );
  const imported = { ...state, id: 'game20261030-50' };
  await db.query(
    'insert into public.football_games(id,state) values($1,$2::jsonb)',
    [imported.id, json(imported)],
  );
  await db.query('delete from public.football_games where id=$1', [
    imported.id,
  ]);
  assert.equal(
    (await create()).id,
    'game20261030-51',
    'Imported/deleted IDs must be remembered too',
  );
  assert.equal(
    (await create('20261031')).id,
    'game20261031-1',
    'Each date keeps a separate counter',
  );
  await db.exec(migration);
  assert.equal(
    (await create()).id,
    'game20261030-52',
    'Reapplying migration must never reset counters',
  );
  const parallel = await Promise.all(Array.from({ length: 8 }, () => create()));
  assert.equal(new Set(parallel.map((game) => game.id)).size, 8);

  // The public app role can still create/save via SECURITY DEFINER RPCs.
  await db.exec('set role anonymous');
  const byRpc = await create('20261101');
  const saved = await db.query<{
    game: { revision: number; conflict: boolean };
  }>('select public.save_football_game_v2($1,$2::jsonb,1) game', [
    byRpc.id,
    json(byRpc.state),
  ]);
  assert.equal(saved.rows[0].game.revision, 2);
  assert.equal(saved.rows[0].game.conflict, false);
  const stale = await db.query<{
    game: { revision: number; conflict: boolean };
  }>('select public.save_football_game_v2($1,$2::jsonb,1) game', [
    byRpc.id,
    json(byRpc.state),
  ]);
  assert.equal(stale.rows[0].game.conflict, true);
  assert.equal(stale.rows[0].game.revision, 2);
  const invalidSave = structuredClone(byRpc.state) as unknown as Record<
    string,
    unknown
  >;
  (invalidSave.teams as Record<string, unknown>[])[0].color = 'unsupported';
  await assert.rejects(
    db.query('select public.save_football_game_v2($1,$2::jsonb,2)', [
      byRpc.id,
      json(invalidSave),
    ]),
    /not a valid tournament/,
  );
  const unchanged = await db.query<{
    game: { state: typeof state; revision: number };
  }>('select public.get_football_game($1) game', [byRpc.id]);
  assert.deepEqual(unchanged.rows[0].game.state, byRpc.state);
  assert.equal(unchanged.rows[0].game.revision, 2);
  const deleted = await db.query<{ deleted: boolean }>(
    'select public.delete_football_game($1) deleted',
    [byRpc.id],
  );
  assert.equal(deleted.rows[0].deleted, true);
  assert.equal((await create('20261101')).id, 'game20261101-2');
  await assert.rejects(
    db.query('select * from public.football_game_counters'),
    /permission denied/,
  );
  await assert.rejects(
    db.query('select public.create_football_game($1::jsonb,$2)', [
      json(changed('teams.0.color', 'unsupported')),
      '20261101',
    ]),
    /not a valid tournament/,
  );
  await db.exec('reset role');

  const createOnce = async (
    requestId: string | null,
    value: unknown = state,
    date = '20261102',
  ) => {
    const result = await db.query<{
      game: { id: string; state: typeof state; revision: number };
    }>('select public.create_football_game_v2($1::jsonb,$2,$3) game', [
      json(value),
      date,
      requestId,
    ]);
    return result.rows[0].game;
  };
  await db.exec('set role anonymous');
  const once = await createOnce('draft-first');
  assert.equal(once.id, 'game20261102-1');
  const replay = await createOnce(
    'draft-first',
    { ...state, name: 'Unsent local edit' },
    '20261103',
  );
  assert.deepEqual(
    replay,
    once,
    'A replay after midnight returns the original game and does not overwrite it',
  );
  const repeats = await Promise.all(
    Array.from({ length: 8 }, () => createOnce('draft-first')),
  );
  assert(repeats.every((game) => game.id === once.id && game.revision === 1));
  const secondDraft = await createOnce('draft-second');
  assert.equal(
    secondDraft.id,
    'game20261102-2',
    'A distinct draft with identical settings is still a new game',
  );
  const edited = { ...once.state, name: 'Saved from another phone' };
  edited.matches = edited.matches.map((match, index) =>
    index === 0 ? { ...match, teamAScore: 2, teamBScore: 1 } : match,
  );
  await db.query('select public.save_football_game_v2($1,$2::jsonb,1)', [
    once.id,
    json(edited),
  ]);
  const latestReplay = await createOnce('draft-first');
  assert.equal(latestReplay.revision, 2, 'Replay returns the latest revision');
  assert.deepEqual(
    latestReplay.state,
    edited,
    'Replay never replaces scores, fixtures or GK order',
  );
  await db.query('select public.delete_football_game($1)', [once.id]);
  await assert.rejects(createOnce('draft-first'), /was deleted/);
  for (const key of [null, '', '   ', 'x'.repeat(201)])
    await assert.rejects(createOnce(key), /invalid create request id/);
  await assert.rejects(
    createOnce('invalid-state', changed('teams.0.color', 'unsupported')),
    /not a valid tournament/,
  );
  assert.equal(
    (await createOnce('invalid-state')).id,
    'game20261102-3',
    'Failed creation rolls back receipt and counter',
  );
  await assert.rejects(
    db.query('select * from public.football_game_create_requests'),
    /permission denied/,
  );
  await assert.rejects(
    db.query(
      "delete from public.football_game_create_requests where request_id='draft-first'",
    ),
    /permission denied/,
  );
  await db.exec('reset role');
  const beforeReapply = (
    await db.query('select * from public.football_games order by id')
  ).rows;
  const receiptsBefore = (
    await db.query(
      'select * from public.football_game_create_requests order by request_id',
    )
  ).rows;
  await db.exec(createMigration);
  assert.deepEqual(
    (await db.query('select * from public.football_games order by id')).rows,
    beforeReapply,
  );
  assert.deepEqual(
    (
      await db.query(
        'select * from public.football_game_create_requests order by request_id',
      )
    ).rows,
    receiptsBefore,
  );
  await assert.rejects(
    createOnce('draft-first'),
    /was deleted/,
    'Reapply retains deleted-game receipts',
  );
  assert.deepEqual(await createOnce('draft-second'), secondDraft);
  assert.equal((await createOnce('after-reapply')).id, 'game20261102-4');
  console.log(
    `PostgreSQL checks passed: ${invalid.length} invalid-state cases, legacy compatibility, all formations, immutable game/queue data, non-reusable IDs, idempotent create/replay/delete/rollback, migration reapply and anonymous RPC grants (in-memory only).`,
  );
} finally {
  await db.close();
}
