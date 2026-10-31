# FootballTeam database changes

For a fresh database, run `neon-schema.sql`, then `migrations/20261031_data_integrity.sql`, then `migrations/20261031_idempotent_create.sql`. The first file is the historical bootstrap; the migrations install the validator, ID allocator and retry-safe create RPC. No deployment workflow applies SQL automatically.

## Local verification (no network/database credentials)

```bash
npm run test:db
```

This executes the actual SQL in an in-memory PostgreSQL instance using PGlite. It checks invalid-state rejection against `parseTournament`, legacy fields/formations, unchanged schedules/scores/GK order, counter seeding, deleting the highest/all games, imports, reapplying migrations, and anonymous RPC permissions. Idempotent-create tests cover repeated requests, retries across dates, distinct drafts with the same settings, returning later revisions without overwriting them, deleted-game tombstones, invalid input/transaction rollback and private receipts. PGlite serializes queries; this does not replace a real concurrent-load test or connect to Neon.

## Controlled production migration

Use Node 22.13+ and psql 17+ (including SSL system root-certificate support). `.env.local` must contain the existing owner connection. Credentials are passed in the child environment, never printed or put on the psql command line. The tool refuses other Neon projects/databases.

```bash
# Read-only: check game shapes, installed validator and allocator.
npm run db:check-hardening

# Explicit write: apply the reviewed migration.
npm run db:apply-hardening
```

`PSQL_BIN` can point to a local psql executable. On this Mac the tool also detects `/opt/homebrew/opt/libpq/bin/psql`.

Before applying, the tool checks that all old games remain readable by the current client, and saves the old function definitions to ignored `outputs/db-backups/` with mode 0600. This DDL backup contains no game records or connection secrets; it is not an automatic rollback script.

The migration runs in one transaction with a 5-second lock timeout and a 30-second statement timeout. It briefly locks game writes while validating existing rows. An incompatible game or any error aborts the transaction. A checksum assertion inside the transaction verifies that every existing game record, revision, fixture, score and timestamp is unchanged.

Changes:

- Validate persisted team/player/match/scorer/tactic shapes before accepting a save, while preserving legacy names, duplicate shirt colours and stale string player references accepted by the client.
- Use a per-date counter for new Game IDs. INSERT/DELETE triggers remember allocated/imported/deleted IDs; deleting games or reapplying the migration never lowers the counter.
- Counter tables and validation helpers are not available to the public app role. Existing business RPC signatures and anonymous create/get/save/list/delete access remain as before.

The counter can only be seeded from IDs still recorded when the migration runs. It cannot reconstruct identifiers deleted before migration with no remaining history. It prevents reusing all observed/allocated IDs from migration onward. Keep counter rows when games are deleted; never reset them as part of a rollback or cleanup.

## Retry-safe creation rollout

```bash
npm run db:check-create
npm run db:apply-create
# Neon Data API caches its callable functions separately from Postgres.
npx --yes neon@latest data-api refresh-schema --project-id tiny-voice-52346752 --branch production --database neondb
npm run db:check-create-api
```

These use the same guarded connection, read-only snapshot, DDL backup and transactional checksum checks described above. Install the additive migration **before** publishing the client that calls `create_football_game_v2(p_state,p_date_code,p_request_id)`. The original create RPC remains available for already-open old tabs; those tabs need a refresh to gain retry-safe creation. Never fall back to the original RPC when v2 fails, since an uncertain response may already have committed a game.

Postgres installation and Data API readiness are separate checks. SQL `NOTIFY pgrst` alone did not refresh Neon's schema cache in this rollout; use the dedicated CLI refresh command above ([Neon CLI documentation](https://neon.com/blog/just-landed-in-the-neon-cli), [Data API refresh behavior](https://api-docs.neon.tech/reference/updateprojectbranchdataapi)). If the CLI reports `invalid_grant`, renew it with `npx --yes neon@latest login --profile DEFAULT` before continuing. Do not disable/recreate the Data API or change its settings to refresh it. `db:check-create-api` uses only an empty request ID plus incomplete state, which the new RPC rejects before allocation; it cannot create or modify a game. Keep the current production client until that probe passes.

The local draft ID is the request ID. New/copy setups have a new ID; retrying or recovering the same draft retains its ID. The client writes the draft before sending the request. A transaction-level advisory lock serializes each request ID; the existing allocator creates the game, and the game/counter/receipt commit together. Replays return the **latest** game/revision without changing it. Later client edits use the existing revision/CAS flow, so another phone's saved scores cannot be overwritten by the create retry.

`football_game_create_requests` stores only request ID, game ID and creation time. It is private to the RPC owner. Receipts intentionally survive deletion and migration reapplication; a retry after deletion returns `P0002` rather than resurrecting the game. Do not cascade-delete/expire receipts or reset counters during cleanup. No game state is duplicated in this table.

Reload recovery requires a readable draft backup. If storage is unavailable, the same open tab still retains the request ID in memory and shows the existing backup warning; clearing/losing the draft prevents associating a later manual new setup with the previous request.
