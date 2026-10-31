import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseTournament } from '../lib/football-schema';

// Explicit operational command, never imported by the app, build or tests.
const apply = process.argv.includes('--apply');
if (process.argv.slice(2).some((arg) => arg !== '--apply'))
  throw new Error(
    'Only --apply is supported; omitting it performs a read-only check.',
  );
const connection =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connection)
  throw new Error('Load .env.local with node --env-file=.env.local.');
const target = new URL(connection);
if (
  !target.hostname.startsWith('ep-falling-night-b3rsao2f') ||
  !target.hostname.endsWith('.neon.tech') ||
  target.pathname !== '/neondb'
)
  throw new Error(
    'Refusing a database outside the expected FootballTeam project.',
  );
const psql =
  process.env.PSQL_BIN ??
  (existsSync('/opt/homebrew/opt/libpq/bin/psql')
    ? '/opt/homebrew/opt/libpq/bin/psql'
    : 'psql');
const baseEnv = {
  ...process.env,
  PGHOST: target.hostname,
  PGPORT: target.port || '5432',
  PGDATABASE: decodeURIComponent(target.pathname.slice(1)),
  PGUSER: decodeURIComponent(target.username),
  PGPASSWORD: decodeURIComponent(target.password),
  PGSSLMODE: 'verify-full',
  PGSSLROOTCERT: 'system',
  PGCONNECT_TIMEOUT: '15',
};
function query(sql: string, readOnly = true) {
  const result = spawnSync(
    psql,
    ['-X', '--no-password', '-qAt', '-v', 'ON_ERROR_STOP=1'],
    {
      input: sql,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      // Credentials are in the child environment, never command-line arguments.
      env: {
        ...baseEnv,
        PGOPTIONS: readOnly ? '-c default_transaction_read_only=on' : '',
      },
    },
  );
  if (result.error)
    throw new Error(`Unable to start psql: ${result.error.message}`);
  if (result.status !== 0)
    throw new Error(result.stderr.trim() || 'psql failed');
  return result.stdout.trim();
}
const snapshotSql = `select jsonb_build_object(
  'database', current_database(),
  'games', coalesce((select jsonb_agg(jsonb_build_object('id',id,'revision',revision,'state',state) order by id) from public.football_games),'[]'::jsonb),
  'fingerprint', (select md5(coalesce(jsonb_agg(jsonb_build_array(id,revision,state,created_at,updated_at) order by id)::text,'[]')) from public.football_games),
  'counterInstalled', to_regclass('public.football_game_counters') is not null,
  'allocatorUsesCounter', position('football_game_counters' in pg_get_functiondef('public.create_football_game(jsonb,text)'::regprocedure)) > 0,
  'strictValidator', position('football_string_fields' in pg_get_functiondef('public.football_state_is_valid(jsonb)'::regprocedure)) > 0
);`;
type Snapshot = {
  database: string;
  games: { id: string; revision: number; state: unknown }[];
  fingerprint: string;
  counterInstalled: boolean;
  allocatorUsesCounter: boolean;
  strictValidator: boolean;
};
const before = JSON.parse(query(snapshotSql)) as Snapshot;
if (before.database !== 'neondb') throw new Error('Unexpected database.');
const invalid = before.games
  .filter((game) => !parseTournament(game.state))
  .map((game) => game.id);
if (invalid.length)
  throw new Error(
    `Aborting: existing games are not readable by this app: ${invalid.join(', ')}`,
  );
if (!apply) {
  console.log(
    JSON.stringify(
      {
        mode: 'read-only',
        games: before.games.map(({ id, revision }) => ({ id, revision })),
        allClientStatesValid: true,
        strictValidator: before.strictValidator,
        counterInstalled: before.counterInstalled,
        allocatorUsesCounter: before.allocatorUsesCounter,
      },
      null,
      2,
    ),
  );
} else {
  const definitions = JSON.parse(
    query(`select jsonb_agg(pg_get_functiondef(oid))
    from pg_proc where pronamespace='public'::regnamespace
    and proname in ('football_state_is_valid','football_jsonb_int_in_range','create_football_game');`),
  ) as string[];
  const backupDir = resolve('outputs/db-backups');
  await mkdir(backupDir, { recursive: true });
  const backupPath = resolve(
    backupDir,
    `${new Date().toISOString().replaceAll(/[:.]/g, '-')}-before-hardening.sql`,
  );
  // Generated DDL backup contains no game records or connection credentials.
  await writeFile(backupPath, definitions.join('\n\n'), { mode: 0o600 });
  const sql = await readFile(
    'db/migrations/20261031_data_integrity.sql',
    'utf8',
  );
  query(sql, false); // One atomic transaction; 5s lock timeout; old game checksum checked inside SQL.
  const after = JSON.parse(query(snapshotSql)) as Snapshot;
  if (
    !after.strictValidator ||
    !after.counterInstalled ||
    !after.allocatorUsesCounter
  )
    throw new Error(
      'Migration completed but verification failed. Inspect the installed definitions.',
    );
  console.log(
    JSON.stringify(
      {
        mode: 'applied',
        allClientStatesValid: after.games.every((game) =>
          Boolean(parseTournament(game.state)),
        ),
        gameCount: after.games.length,
        snapshotUnchanged: before.fingerprint === after.fingerprint,
        strictValidator: after.strictValidator,
        allocatorUsesCounter: after.allocatorUsesCounter,
        ddlBackup: backupPath,
      },
      null,
      2,
    ),
  );
}
