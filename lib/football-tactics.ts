import type {
  Player,
  PlayerPosition,
  TacticFormation,
  TacticMarker,
  Team,
} from './football-types';

export const FORMATION_LABELS: Record<TacticFormation, string> = {
  auto: 'Auto · ให้ระบบจัดให้',
  '1-2-2': '1-2-2 · 5 คน',
  '1-1-2-1': '1-1-2-1 · 5 คน',
  '1-2-1-1': '1-2-1-1 · 5 คน',
  '1-3-2': '1-3-2 · 6 คน',
  '1-2-3': '1-2-3 · 6 คน',
  '1-2-2-1': '1-2-2-1 · 6 คน',
  '1-1-3-1': '1-1-3-1 · 6 คน',
  '1-3-1-1': '1-3-1-1 · 6 คน',
  '1-3-3': '1-3-3 · 7 คน',
  '1-2-4': '1-2-4 · 7 คน',
  '1-3-2-1': '1-3-2-1 · 7 คน',
  '1-2-3-1': '1-2-3-1 · 7 คน',
  '1-2-2-2': '1-2-2-2 · 7 คน',
  '1-4-1-1': '1-4-1-1 · 7 คน',
};

const FORMATIONS_BY_PLAYER_COUNT: Record<5 | 6 | 7, TacticFormation[]> = {
  5: ['1-2-2', '1-1-2-1', '1-2-1-1'],
  6: ['1-3-2', '1-2-3', '1-2-2-1', '1-1-3-1', '1-3-1-1'],
  7: ['1-3-3', '1-2-4', '1-3-2-1', '1-2-3-1', '1-2-2-2', '1-4-1-1'],
};

type OutfieldRole = Exclude<PlayerPosition, 'winger'>;

type FormationSlot = {
  x: number;
  y: number;
  preferred: PlayerPosition[];
};

function resolvedFormation(formation: TacticFormation, playerCount: 5 | 6 | 7) {
  return formation === 'auto' ||
    !FORMATIONS_BY_PLAYER_COUNT[playerCount].includes(formation)
    ? FORMATIONS_BY_PLAYER_COUNT[playerCount][0]
    : formation;
}

export function formationsForPlayerCount(playerCount: 5 | 6 | 7) {
  return [
    'auto',
    ...FORMATIONS_BY_PLAYER_COUNT[playerCount],
  ] as TacticFormation[];
}

export function resolvedFormationLabel(
  formation: TacticFormation,
  playerCount: 5 | 6 | 7,
) {
  return FORMATION_LABELS[resolvedFormation(formation, playerCount)];
}

function xPositions(count: number) {
  if (count <= 1) return [50];
  if (count === 2) return [34, 66];
  if (count === 3) return [22, 50, 78];
  return Array.from(
    { length: count },
    (_, index) => 16 + (68 * index) / (count - 1),
  );
}

function preferredForSlot(role: OutfieldRole, index: number, count: number) {
  const isWide = count > 1 && (index === 0 || index === count - 1);
  if (role === 'defender')
    return isWide
      ? (['defender', 'winger', 'midfielder'] as PlayerPosition[])
      : (['defender', 'midfielder'] as PlayerPosition[]);
  if (role === 'midfielder')
    return isWide
      ? (['winger', 'midfielder', 'forward'] as PlayerPosition[])
      : (['midfielder', 'winger'] as PlayerPosition[]);
  return isWide
    ? (['forward', 'winger', 'midfielder'] as PlayerPosition[])
    : (['forward', 'midfielder'] as PlayerPosition[]);
}

function formationSlots(
  formation: TacticFormation,
  playerCount: 5 | 6 | 7,
  isTeamA: boolean,
) {
  const resolved = resolvedFormation(formation, playerCount);
  const lineCounts = resolved.split('-').slice(1).map(Number);
  const roles: OutfieldRole[] =
    lineCounts.length === 2
      ? ['defender', 'forward']
      : ['defender', 'midfielder', 'forward'];
  const lineY = lineCounts.length === 2 ? [76, 60] : [78, 66, 56];
  return lineCounts.flatMap((count, lineIndex) =>
    xPositions(count).map(
      (x, index): FormationSlot => ({
        x,
        y: isTeamA ? lineY[lineIndex] : 100 - lineY[lineIndex],
        preferred: preferredForSlot(roles[lineIndex], index, count),
      }),
    ),
  );
}

function playerSlotScore(player: Player, slot: FormationSlot) {
  const positions = player.positions ?? [];
  if (!positions.length) return 6;
  const preferredIndex = slot.preferred.findIndex((position) =>
    positions.includes(position),
  );
  if (preferredIndex >= 0) return preferredIndex;
  return 8;
}

function assignPlayersToSlots(players: Player[], slots: FormationSlot[]) {
  const remaining = [...players];
  const assignments = new Map<number, Player>();
  const slotOrder = slots
    .map((slot, index) => ({
      index,
      slot,
      naturalFits: players.filter(
        (player) => playerSlotScore(player, slot) <= 1,
      ).length,
    }))
    .sort(
      (first, second) =>
        first.naturalFits - second.naturalFits || first.index - second.index,
    );
  for (const { index, slot } of slotOrder) {
    const ranked = remaining
      .map((player, playerIndex) => ({
        player,
        playerIndex,
        score: playerSlotScore(player, slot),
      }))
      .sort(
        (first, second) =>
          first.score - second.score || first.playerIndex - second.playerIndex,
      );
    const selected = ranked[0];
    if (!selected) continue;
    assignments.set(index, selected.player);
    remaining.splice(selected.playerIndex, 1);
  }
  return slots.flatMap((_, index) => {
    const player = assignments.get(index);
    return player ? [player] : [];
  });
}

export function goalkeeperForTeam(team: Team, preferredPlayerId?: string) {
  const available = playersAvailableForTactics(team);
  const queuedPlayerId = team.gkRotation.find((playerId) =>
    available.some((player) => player.id === playerId),
  );
  return (
    available.find((player) => player.id === preferredPlayerId) ??
    available.find((player) => player.id === queuedPlayerId) ??
    available[0]
  );
}

export function playersAvailableForTactics(team: Team) {
  const attending = team.players.filter((player) => !player.absentToday);
  return attending.length > 0 ? attending : team.players;
}

export function autoPlaceTeamMarkers({
  team,
  isTeamA,
  playerCount,
  formation,
  goalkeeperId,
}: {
  team: Team;
  isTeamA: boolean;
  playerCount: 5 | 6 | 7;
  formation: TacticFormation;
  goalkeeperId?: string;
}): TacticMarker[] {
  const available = playersAvailableForTactics(team);
  const goalkeeper = goalkeeperForTeam(team, goalkeeperId);
  if (!goalkeeper) return [];
  const outfieldSlots = formationSlots(formation, playerCount, isTeamA).slice(
    0,
    Math.max(0, Math.min(playerCount - 1, available.length - 1)),
  );
  const outfield = available.filter((player) => player.id !== goalkeeper.id);
  const assigned = assignPlayersToSlots(outfield, outfieldSlots);
  const markers: TacticMarker[] = [
    {
      id: `tactic-${isTeamA ? 'a' : 'b'}-${goalkeeper.id}`,
      kind: 'player',
      teamId: team.id,
      playerId: goalkeeper.id,
      label: goalkeeper.name,
      x: 50,
      y: isTeamA ? 91 : 9,
    },
  ];
  assigned.forEach((player, index) => {
    markers.push({
      id: `tactic-${isTeamA ? 'a' : 'b'}-${player.id}`,
      kind: 'player',
      teamId: team.id,
      playerId: player.id,
      label: player.name,
      x: outfieldSlots[index].x,
      y: outfieldSlots[index].y,
    });
  });
  return markers;
}
