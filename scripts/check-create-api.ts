import assert from 'node:assert/strict';
import { createSharedGame } from '../lib/football-data-api';
import type { Tournament } from '../lib/football-types';

// Explicit operational command, never part of offline tests/build. The empty
// request ID is rejected BEFORE any allocation/lock/write by the v2 migration.
// The incomplete state is deliberately invalid too: this probe cannot create
// a game even if request-ID validation is accidentally removed later.
await assert.rejects(
  createSharedGame({ id: '' } as Tournament, '20000101'),
  (error: unknown) =>
    error instanceof Error &&
    error.message.startsWith('Data API 400:') &&
    error.message.includes('invalid create request id'),
  'Data API must expose v2 and reject the empty key. Refresh its schema cache before deploying the client.',
);
console.log(
  'Neon Data API create-v2 is ready: empty key rejected before any game allocation.',
);
