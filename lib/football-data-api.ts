import type { Tournament } from '@/lib/football-types';

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

async function callRpc<T>(name: string, body: Record<string, unknown>) {
  const response = await fetch(`${DATA_API_URL}/rpc/${name}`, {
    method: 'POST',
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

export function createSharedGame(tournament: Tournament, dateCode: string) {
  return callRpc<StoredFootballGame>('create_football_game', {
    p_state: tournament,
    p_date_code: dateCode,
  });
}

export function loadSharedGame(gameId: string) {
  return callRpc<StoredFootballGame | null>('get_football_game', {
    p_game_id: gameId,
  });
}

export function saveSharedGame(gameId: string, tournament: Tournament) {
  return callRpc<StoredFootballGame>('save_football_game', {
    p_game_id: gameId,
    p_state: tournament,
  });
}
