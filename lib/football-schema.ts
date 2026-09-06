import {
  TEAM_COLORS,
  type Match,
  type TacticMarker,
  type TacticPath,
  type TacticStep,
  type TacticsBoard,
  type Team,
  type Tournament,
} from './football-types';

const TEAM_COLOR_SET = new Set<string>(TEAM_COLORS);
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isIntegerBetween(value: unknown, min: number, max: number) {
  return (
    Number.isInteger(value) && Number(value) >= min && Number(value) <= max
  );
}

function uniqueStrings(values: string[]) {
  return new Set(values).size === values.length;
}

function parseTeam(value: unknown): Team | null {
  if (!isRecord(value) || !Array.isArray(value.players)) return null;
  const players = value.players;
  if (
    !isString(value.id) ||
    !value.id ||
    !isString(value.name) ||
    !TEAM_COLOR_SET.has(String(value.color)) ||
    !Array.isArray(value.gkRotation) ||
    !Array.isArray(value.gkCycleOrders)
  )
    return null;
  if (
    value.gkRotationLocked !== undefined &&
    typeof value.gkRotationLocked !== 'boolean'
  )
    return null;

  const playerIds: string[] = [];
  for (const player of players) {
    if (
      !isRecord(player) ||
      !isString(player.id) ||
      !player.id ||
      !isString(player.name) ||
      typeof player.absentToday !== 'boolean'
    )
      return null;
    playerIds.push(player.id);
  }
  if (!uniqueStrings(playerIds)) return null;
  const allowed = new Set(playerIds);
  const rotation = value.gkRotation;
  const cycles = value.gkCycleOrders;
  if (
    !rotation.every((id) => isString(id) && allowed.has(id)) ||
    !cycles.every(
      (cycle) =>
        Array.isArray(cycle) &&
        cycle.every((id) => isString(id) && allowed.has(id)),
    )
  )
    return null;
  return value as Team;
}

function parseMatch(value: unknown, teamIds: Set<string>): Match | null {
  if (!isRecord(value)) return null;
  const scoreA = value.teamAScore;
  const scoreB = value.teamBScore;
  const scoresValid =
    (scoreA === undefined && scoreB === undefined) ||
    (isIntegerBetween(scoreA, 0, 99) && isIntegerBetween(scoreB, 0, 99));
  if (
    !isString(value.id) ||
    !value.id ||
    !isIntegerBetween(value.matchNumber, 1, 10000) ||
    !isIntegerBetween(value.roundNumber, 1, 10000) ||
    !isString(value.teamAId) ||
    !isString(value.teamBId) ||
    value.teamAId === value.teamBId ||
    !teamIds.has(value.teamAId) ||
    !teamIds.has(value.teamBId) ||
    !isString(value.startTime) ||
    !TIME_PATTERN.test(value.startTime) ||
    !['upcoming', 'current', 'finished'].includes(String(value.status)) ||
    !scoresValid
  )
    return null;
  for (const key of ['teamAGkPlayerId', 'teamBGkPlayerId'] as const) {
    if (value[key] !== undefined && !isString(value[key])) return null;
  }
  return value as Match;
}

function parseMarker(
  value: unknown,
  teamIds: Set<string>,
): TacticMarker | null {
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    !value.id ||
    !['player', 'ball'].includes(String(value.kind)) ||
    !isString(value.label) ||
    typeof value.x !== 'number' ||
    !Number.isFinite(value.x) ||
    value.x < 0 ||
    value.x > 100 ||
    typeof value.y !== 'number' ||
    !Number.isFinite(value.y) ||
    value.y < 0 ||
    value.y > 100
  )
    return null;
  if (
    value.teamId !== undefined &&
    (!isString(value.teamId) || !teamIds.has(value.teamId))
  )
    return null;
  if (value.playerId !== undefined && !isString(value.playerId)) return null;
  return value as TacticMarker;
}

function parseTactics(
  value: unknown,
  teamIds: Set<string>,
): TacticsBoard | null {
  if (
    !isRecord(value) ||
    !isString(value.teamAId) ||
    !isString(value.teamBId) ||
    value.teamAId === value.teamBId ||
    !teamIds.has(value.teamAId) ||
    !teamIds.has(value.teamBId) ||
    !Array.isArray(value.markers) ||
    !isString(value.notes) ||
    !value.markers.every((marker) => parseMarker(marker, teamIds))
  )
    return null;
  if (
    value.animationSteps !== undefined &&
    (!Array.isArray(value.animationSteps) ||
      value.animationSteps.length < 1 ||
      value.animationSteps.length > 8 ||
      !value.animationSteps.every((step) => parseTacticStep(step, teamIds)))
  )
    return null;
  return value as TacticsBoard;
}

function parsePoint(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    value.x >= 0 &&
    value.x <= 100 &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y) &&
    value.y >= 0 &&
    value.y <= 100
  );
}

function parseTacticPath(value: unknown): value is TacticPath {
  return (
    isRecord(value) &&
    isString(value.id) &&
    value.id.length > 0 &&
    ['run', 'pass'].includes(String(value.kind)) &&
    parsePoint(value.from) &&
    parsePoint(value.to)
  );
}

function parseTacticStep(
  value: unknown,
  teamIds: Set<string>,
): value is TacticStep {
  return (
    isRecord(value) &&
    isString(value.id) &&
    value.id.length > 0 &&
    isString(value.title) &&
    value.title.length <= 40 &&
    Array.isArray(value.markers) &&
    value.markers.every((marker) => parseMarker(marker, teamIds)) &&
    Array.isArray(value.paths) &&
    value.paths.every(parseTacticPath)
  );
}

export function parseTournament(value: unknown): Tournament | null {
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    !isString(value.name) ||
    !Array.isArray(value.teams) ||
    value.teams.length < 2 ||
    value.teams.length > 8 ||
    value.numberOfFields !== 1 ||
    !isIntegerBetween(value.matchDurationMinutes, 1, 180) ||
    !isIntegerBetween(value.breakDurationMinutes, 0, 60) ||
    !isString(value.startTime) ||
    !TIME_PATTERN.test(value.startTime) ||
    !isIntegerBetween(value.availableTimeMinutes, 1, 1440) ||
    !Array.isArray(value.matches) ||
    !isString(value.createdAt)
  )
    return null;

  const teams = value.teams.map(parseTeam);
  if (teams.some((team) => !team)) return null;
  const teamIds = teams.map((team) => team!.id);
  if (!uniqueStrings(teamIds)) return null;
  const teamIdSet = new Set(teamIds);
  const matches = value.matches.map((match) => parseMatch(match, teamIdSet));
  if (matches.some((match) => !match)) return null;
  const matchIds = matches.map((match) => match!.id);
  if (!uniqueStrings(matchIds)) return null;
  if (value.tactics !== undefined && !parseTactics(value.tactics, teamIdSet))
    return null;
  return value as Tournament;
}
