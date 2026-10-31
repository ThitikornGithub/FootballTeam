# FootballTeam database changes

For a fresh database, run `neon-schema.sql` **and then** `migrations/20261031_data_integrity.sql`. The first file is the historical bootstrap; the migration installs the current validator and ID allocator. No deployment workflow applies SQL automatically.

## Local verification (no network/database credentials)

```bash
npm run test:db
```

This executes the actual SQL in an in-memory PostgreSQL instance using PGlite. It checks invalid-state rejection against `parseTournament`, legacy fields/formations, unchanged schedules/scores/GK order, counter seeding, deleting the highest/all games, imports, reapplying migration, and anonymous create/save/delete RPC permissions. It does not connect to Neon and does not replace a real concurrent-load test.

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
