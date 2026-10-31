import type { BrowserContext, Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createTournament } from '../../../lib/football-engine';
import type { Team, Tournament } from '../../../lib/football-types';

export const LOCAL_ORIGIN = 'http://localhost:3210';
export const GAME_ID = 'game20260102-1';
// The dev server only has /. Exercise the actual Pages redirect script for
// deep links too, with its production base path changed to this local root.
const localRedirectHtml = readFileSync(
  new URL('../../../scripts/github-pages-404.html', import.meta.url),
  'utf8',
).replaceAll('/FootballTeam/', '/');

type Game = {
  id: string;
  state: Tournament;
  revision: number;
  updatedAt: string;
};
type RpcCall = { name: string; body: Record<string, unknown>; at: number };

export function makeGame(id = GAME_ID): Game {
  const colors = ['green', 'red', 'blue', 'yellow'] as const;
  const teams: Team[] = colors.map((color) => {
    const players = Array.from({ length: 7 }, (_, i) => ({
      id: `${color}-player-${i + 1}`,
      name: `Test ${color} ${i + 1}`,
      absentToday: false,
    }));
    return {
      id: `team-${color}`,
      name: color,
      color,
      players,
      gkRotation: players.map((player) => player.id),
      gkCycleOrders: [players.map((player) => player.id)],
    };
  });
  const state = createTournament({
    name: 'E2E Friendly Match',
    teams,
    firstMatchTeamIds: [teams[0].id, teams[1].id],
    matchDurationMinutes: 7,
    breakDurationMinutes: 1,
    startTime: '19:00',
    availableTimeMinutes: 48,
  });
  state.id = id;
  state.createdAt = '2026-01-02T12:00:00.000Z';
  state.matches = state.matches.map((match, index) => ({
    ...match,
    id: `${id}-match-${index + 1}`,
  }));
  return { id, state, revision: 1, updatedAt: state.createdAt };
}

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// This is an in-memory RPC server, not a client for Neon. It never calls fetch.
export class MockFootballApi {
  readonly games = new Map<string, Game>();
  readonly calls: RpcCall[] = [];
  readonly blockedRequests: string[] = [];
  offline = false;
  failSaves = false;
  private nextSaveGate: ReturnType<typeof gate> | undefined;
  private gates: ReturnType<typeof gate>[] = [];

  constructor() {
    this.games.set(GAME_ID, makeGame());
  }

  game(id = GAME_ID) {
    const game = this.games.get(id);
    if (!game) throw new Error(`Missing fixture ${id}`);
    return structuredClone(game);
  }

  remoteUpdate(change: (state: Tournament) => void, id = GAME_ID) {
    const game = this.game(id);
    change(game.state);
    game.revision += 1;
    game.updatedAt = new Date().toISOString();
    this.games.set(id, game);
  }

  holdNextSave() {
    const pending = gate();
    this.nextSaveGate = pending;
    this.gates.push(pending);
    return { release: pending.resolve };
  }

  releasePendingRequests() {
    this.gates.forEach((pending) => pending.resolve());
  }

  async install(context: BrowserContext) {
    // Install before any page/navigation. Service workers are blocked by config.
    // There is deliberately no external route.continue()/route.fetch() fallback.
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === LOCAL_ORIGIN) {
        if (
          route.request().resourceType() === 'document' &&
          /^\/(?:game\d{8}-[1-9]\d*|allgames|latest)\/?$/.test(url.pathname)
        )
          return route.fulfill({
            contentType: 'text/html',
            body: localRedirectHtml,
          });
        return route.continue();
      }
      if (
        url.hostname ===
          'ep-falling-night-b3rsao2f.apirest.c-4.ap-southeast-1.aws.neon.tech' &&
        url.pathname.startsWith('/neondb/rest/v1/rpc/')
      )
        return this.respond(route, url.pathname.split('/').pop()!);
      this.blockedRequests.push(url.origin + url.pathname);
      return route.abort('blockedbyclient');
    });
  }

  private async respond(route: Route, name: string) {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    const body = route.request().postDataJSON() as Record<string, unknown>;
    this.calls.push({ name, body: structuredClone(body), at: Date.now() });
    const json = (value: unknown, status = 200) =>
      route.fulfill({
        status,
        json: value,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    if (this.offline) return json({ message: 'Simulated offline' }, 503);
    const id = typeof body.p_game_id === 'string' ? body.p_game_id : '';
    if (name === 'get_football_game') return json(this.games.get(id) ?? null);
    if (name === 'list_football_games')
      return json(
        [...this.games.values()].map((game) => ({
          id: game.id,
          name: game.state.name,
          teamCount: game.state.teams.length,
          matchCount: game.state.matches.length,
          finishedCount: game.state.matches.filter(
            (match) => match.status === 'finished',
          ).length,
          startTime: game.state.startTime,
          createdAt: game.state.createdAt,
          updatedAt: game.updatedAt,
          closed: Boolean(game.state.closedAt),
        })),
      );
    if (name === 'save_football_game_v2') {
      const pending = this.nextSaveGate;
      this.nextSaveGate = undefined;
      if (pending) await pending.promise;
      if (this.failSaves)
        return json({ message: 'Simulated save failure' }, 503);
      const previous = this.games.get(id);
      if (!previous) return json({ message: 'game not found' }, 404);
      if (previous.revision !== body.p_expected_revision)
        return json({ ...previous, conflict: true });
      const game = {
        id,
        state: structuredClone(body.p_state) as Tournament,
        revision: previous.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      this.games.set(id, game);
      return json({ ...game, conflict: false });
    }
    if (name === 'create_football_game') {
      if (typeof body.p_date_code !== 'string')
        return json({ message: 'Invalid mock date code' }, 400);
      const game = makeGame(`game${body.p_date_code}-${this.games.size + 1}`);
      game.state = {
        ...(structuredClone(body.p_state) as Tournament),
        id: game.id,
      };
      this.games.set(game.id, game);
      return json(game);
    }
    if (name === 'delete_football_game') return json(this.games.delete(id));
    this.blockedRequests.push(`Unknown RPC: ${name}`);
    return json({ message: 'Unknown mock RPC; network remains blocked' }, 400);
  }
}
