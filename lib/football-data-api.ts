import type { Tournament } from '@/lib/football-types';
import { parseTournament } from '@/lib/football-schema';

const DATA_API_URL =
  'https://ep-falling-night-b3rsao2f.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1';
const GAME_LIST_CACHE_KEY = 'football-match-maker-game-list-v1';
const GAME_LIST_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const GAME_LIST_NETWORK_FRESH_MS = 30 * 1000;
const DATA_API_TIMEOUT_MS = 20 * 1000;
const MAX_KEEPALIVE_BODY_BYTES = 60 * 1024;

// This is intentionally a shared, public app credential. Database permissions
// restrict it to the FootballTeam RPC functions.
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
type CachedGameList = {
  cachedAt: number;
  games: FootballGameSummary[];
};

let gameListRequest: Promise<FootballGameSummary[]> | null = null;
let memoryGameList: CachedGameList | null = null;

export class RevisionConflictError extends Error {
  constructor(readonly latest: StoredFootballGame) {
    super('The shared game changed on another device.');
    this.name = 'RevisionConflictError';
  }
}

// Retrying cannot fix either of these, so the UI tells the user what to do
// instead of looping on the generic "sync failed" path.
export class CorruptGameStateError extends Error {
  constructor() {
    super('ข้อมูลเกมจากฐานข้อมูลมีรูปแบบไม่ถูกต้อง');
    this.name = 'CorruptGameStateError';
  }
}

export class ClientOutdatedError extends Error {
  constructor() {
    super('เวอร์ชันแอปในหน้านี้เก่ากว่าฐานข้อมูล');
    this.name = 'ClientOutdatedError';
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
    throw new CorruptGameStateError();
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
  const payload = JSON.stringify(body);
  const keepalive = Boolean(
    options.keepalive &&
    new TextEncoder().encode(payload).byteLength <= MAX_KEEPALIVE_BODY_BYTES,
  );
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort(),
    DATA_API_TIMEOUT_MS,
  );
  let response: Response;
  try {
    response = await fetch(`${DATA_API_URL}/rpc/${name}`, {
      method: 'POST',
      keepalive,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${DATA_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: payload,
    });
  } finally {
    globalThis.clearTimeout(timeout);
  }

  if (!response.ok) {
    const message = await response.text();
    // PGRST202 means the RPC no longer exists, so this tab is running a bundle
    // older than the database. A 404 without it is a normal "not found" raise.
    if (response.status === 404 && message.includes('PGRST202'))
      throw new ClientOutdatedError();
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
  markGameListStale();
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
  markGameListStale();
  return game;
}

export function listSharedGames({ force = false }: { force?: boolean } = {}) {
  if (gameListRequest) return gameListRequest;
  const cachedGames = readCachedSharedGames();
  if (
    !force &&
    memoryGameList &&
    Date.now() - memoryGameList.cachedAt <= GAME_LIST_NETWORK_FRESH_MS
  )
    return Promise.resolve(cachedGames);
  gameListRequest = callRpc<unknown>('list_football_games', {})
    .then(parseGameList)
    .then((games) => {
      cacheGameList(games);
      return games;
    })
    .finally(() => {
      gameListRequest = null;
    });
  return gameListRequest;
}

export function readCachedSharedGames() {
  if (
    memoryGameList &&
    Date.now() - memoryGameList.cachedAt <= GAME_LIST_CACHE_MAX_AGE_MS
  )
    return memoryGameList.games;
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(GAME_LIST_CACHE_KEY);
    if (!stored) return [];
    const cached = JSON.parse(stored) as CachedGameList;
    if (
      !Number.isFinite(cached.cachedAt) ||
      Date.now() - cached.cachedAt > GAME_LIST_CACHE_MAX_AGE_MS
    ) {
      localStorage.removeItem(GAME_LIST_CACHE_KEY);
      return [];
    }
    const games = parseGameList(cached.games);
    memoryGameList = { cachedAt: cached.cachedAt, games };
    return games;
  } catch {
    try {
      localStorage.removeItem(GAME_LIST_CACHE_KEY);
    } catch {
      // Ignore browsers that block storage entirely.
    }
    return [];
  }
}

export function prefetchSharedGames() {
  return listSharedGames().then(() => undefined);
}

export async function deleteSharedGame(gameId: string) {
  const deleted = await callRpc<boolean>('delete_football_game', {
    p_game_id: gameId,
  });
  if (deleted) {
    const remaining = readCachedSharedGames().filter(
      (game) => game.id !== gameId,
    );
    cacheGameList(remaining);
  }
  return deleted;
}

function parseGameList(value: unknown): FootballGameSummary[] {
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
}

function cacheGameList(games: FootballGameSummary[]) {
  const cached = { cachedAt: Date.now(), games };
  memoryGameList = cached;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GAME_LIST_CACHE_KEY, JSON.stringify(cached));
  } catch {
    // The memory cache still makes navigation within this tab instant.
  }
}

function markGameListStale() {
  const games = readCachedSharedGames();
  if (!memoryGameList) return;
  const cached = {
    cachedAt: Date.now() - GAME_LIST_NETWORK_FRESH_MS - 1,
    games,
  };
  memoryGameList = cached;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GAME_LIST_CACHE_KEY, JSON.stringify(cached));
  } catch {
    // The next list visit will still refresh the stale in-memory cache.
  }
}
