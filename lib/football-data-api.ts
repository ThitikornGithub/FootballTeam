import type { Tournament } from '@/lib/football-types';
import { parseTournament } from '@/lib/football-schema';

const DATA_API_URL =
  'https://ep-falling-night-b3rsao2f.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1';

// This is intentionally a shared, public app credential. Database permissions
// restrict it to the three FootballTeam RPC functions.
const DATA_API_TOKEN =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImExODE4Yjc3YmY4NmNjZjUwYzZhYzJjNyJ9.eyJyb2xlIjoiYW5vbnltb3VzIiwiaXNzIjoiZm9vdGJhbGwtdGVhbS1naXRodWItcGFnZXMiLCJpYXQiOjE3ODg2MzE3MDksImV4cCI6MjEwNDIwNzcwOX0.XQdzssujGrTt_-De63HCog5tV-CVWHFTkA-r0LO9Q3LKne1NZP1KpZcaElybivQjK9xBgYOA2sVmU-alQY-_jrB7rWKW6GN8fkZPoRVRpR07UBoLQm0N1_dDSk_KjA0KESecPWh8cW8KROPJGami3RK6-9t_U37RfhxwY5RLl3LnWw05wa6aNU9JBfFBoodx-py98L-jlwj2hHB4GqBKMHdsP-ovXk3FL1UhfBmxIyhjHBnSAUV78xSATd4CoGbN-GC68TbZFTLqmG6gFthmTIr3UlyfPWo8PMiIsCBcEz24oSZjUJW8mJADpu7zznwvA2z7VRlQLiOKy-XpjGu3BQ';

export type StoredFootballGame = {
  id: string;
  state: Tournament;
  revision: number;
  updatedAt: string;
};

export type FootballGameSummary = {
  id: string;
  name: string;
  teamCount: number;
  matchCount: number;
  finishedCount: number;
  startTime: string;
  createdAt: string;
  updatedAt: string;
};

type SaveFootballGameResponse = StoredFootballGame & { conflict?: boolean };

export class RevisionConflictError extends Error {
  constructor(readonly latest: StoredFootballGame) {
    super('The shared game changed on another device.');
    this.name = 'RevisionConflictError';
  }
}

function parseStoredGame(value: unknown): StoredFootballGame | null {
  if (!value || typeof value !== 'object') return null;
  const game = value as Record<string, unknown>;
  const state = parseTournament(game.state);
  if (
    typeof game.id !== 'string' ||
    !state ||
    !Number.isInteger(game.revision) ||
    Number(game.revision) < 1 ||
    typeof game.updatedAt !== 'string'
  )
    throw new Error('ข้อมูลเกมจากฐานข้อมูลมีรูปแบบไม่ถูกต้อง');
  return {
    id: game.id,
    state,
    revision: Number(game.revision),
    updatedAt: game.updatedAt,
  };
}

async function callRpc<T>(
  name: string,
  body: Record<string, unknown>,
  options: { keepalive?: boolean } = {},
) {
  const response = await fetch(`${DATA_API_URL}/rpc/${name}`, {
    method: 'POST',
    keepalive: options.keepalive,
    headers: {
      Authorization: `Bearer ${DATA_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Data API ${response.status}: ${message}`);
  }

  return (await response.json()) as T;
}

export async function createSharedGame(
  tournament: Tournament,
  dateCode: string,
) {
  const value = await callRpc<unknown>('create_football_game', {
    p_state: tournament,
    p_date_code: dateCode,
  });
  const game = parseStoredGame(value);
  if (!game) throw new Error('ฐานข้อมูลไม่ได้ส่งเกมที่สร้างกลับมา');
  return game;
}

export async function loadSharedGame(gameId: string) {
  const value = await callRpc<unknown>('get_football_game', {
    p_game_id: gameId,
  });
  return parseStoredGame(value);
}

export async function saveSharedGame(
  gameId: string,
  tournament: Tournament,
  expectedRevision: number,
  options: { keepalive?: boolean } = {},
) {
  const value = await callRpc<SaveFootballGameResponse>(
    'save_football_game_v2',
    {
      p_game_id: gameId,
      p_state: tournament,
      p_expected_revision: expectedRevision,
    },
    options,
  );
  const game = parseStoredGame(value);
  if (!game) throw new Error('ฐานข้อมูลไม่ได้ส่งข้อมูลเกมกลับมา');
  if (value.conflict) throw new RevisionConflictError(game);
  return game;
}

export function listSharedGames() {
  return callRpc<unknown>('list_football_games', {}).then((value) => {
    if (!Array.isArray(value)) throw new Error('รายการเกมมีรูปแบบไม่ถูกต้อง');
    return value.map((item) => {
      if (!item || typeof item !== 'object')
        throw new Error('ข้อมูลสรุปเกมมีรูปแบบไม่ถูกต้อง');
      const game = item as Record<string, unknown>;
      if (
        typeof game.id !== 'string' ||
        typeof game.name !== 'string' ||
        !Number.isInteger(game.teamCount) ||
        !Number.isInteger(game.matchCount) ||
        !Number.isInteger(game.finishedCount) ||
        typeof game.startTime !== 'string' ||
        typeof game.createdAt !== 'string' ||
        typeof game.updatedAt !== 'string'
      )
        throw new Error('ข้อมูลสรุปเกมมีรูปแบบไม่ถูกต้อง');
      return game as FootballGameSummary;
    });
  });
}

export function deleteSharedGame(gameId: string) {
  return callRpc<boolean>('delete_football_game', { p_game_id: gameId });
}
