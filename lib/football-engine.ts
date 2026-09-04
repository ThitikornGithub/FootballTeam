import type {
  Match,
  Player,
  ScheduleConfig,
  Team,
  Tournament,
} from './football-types';

export function makeId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function shuffle<T>(items: readonly T[]): T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
  }
  return next;
}

function shuffledDifferent<T>(items: readonly T[], previous?: readonly T[]) {
  if (items.length < 2) return [...items];
  let result = shuffle(items);
  for (
    let tries = 0;
    tries < 4 && previous?.every((item, i) => item === result[i]);
    tries += 1
  ) {
    result = shuffle(items);
  }
  return result;
}

export function addMinutes(time: string, minutes: number) {
  const [hour, minute] = time.split(':').map(Number);
  const total = (hour * 60 + minute + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function minutesBetween(startTime: string, endTime: string) {
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  const startTotal = startHour * 60 + startMinute;
  const endTotal = endHour * 60 + endMinute;
  return Math.max(0, endTotal - startTotal);
}

export function scheduleMetrics(
  teamCount: number,
  matchMinutes: number,
  breakMinutes: number,
  startTime: string,
) {
  const matchCount = (teamCount * (teamCount - 1)) / 2;
  const requiredMinutes = matchCount * (matchMinutes + breakMinutes);
  return {
    matchCount,
    requiredMinutes,
    endTime: addMinutes(startTime, requiredMinutes),
  };
}

type Pair = { teamAId: string; teamBId: string; roundNumber: number };

function fairRoundRobin(teamIds: string[]): Pair[] {
  const rotation: Array<string | null> = [...teamIds];
  if (rotation.length % 2 === 1) rotation.push(null);
  const rounds: Pair[][] = [];
  const totalRounds = rotation.length - 1;

  for (let round = 0; round < totalRounds; round += 1) {
    const pairs: Pair[] = [];
    for (let index = 0; index < rotation.length / 2; index += 1) {
      const first = rotation[index];
      const second = rotation[rotation.length - 1 - index];
      if (first && second) {
        const flip = (round + index) % 2 === 1;
        pairs.push({
          teamAId: flip ? second : first,
          teamBId: flip ? first : second,
          roundNumber: round + 1,
        });
      }
    }
    rounds.push(pairs);
    rotation.splice(1, 0, rotation.pop() ?? null);
  }

  const flattened: Pair[] = [];
  let lastPair: Pair | undefined;
  for (const round of rounds) {
    const remaining = [...round];
    while (remaining.length) {
      const index = lastPair
        ? remaining.findIndex(
            (pair) =>
              ![lastPair?.teamAId, lastPair?.teamBId].includes(pair.teamAId) &&
              ![lastPair?.teamAId, lastPair?.teamBId].includes(pair.teamBId),
          )
        : 0;
      const [chosen] = remaining.splice(index >= 0 ? index : 0, 1);
      flattened.push(chosen);
      lastPair = chosen;
    }
  }
  return flattened;
}

function normalizedCycleOrders(
  team: Team,
  eligibleIds: string[],
  neededCycles: number,
) {
  const eligible = new Set(eligibleIds);
  const first = [
    ...team.gkRotation.filter((id) => eligible.has(id)),
    ...eligibleIds.filter((id) => !team.gkRotation.includes(id)),
  ];
  const orders = team.gkCycleOrders
    .map((order) => [
      ...order.filter((id) => eligible.has(id)),
      ...eligibleIds.filter((id) => !order.includes(id)),
    ])
    .filter((order) => order.length > 0);
  if (!orders.length && first.length) orders.push(shuffledDifferent(first));
  while (orders.length < neededCycles && first.length) {
    orders.push(shuffledDifferent(first, orders.at(-1)));
  }
  return orders;
}

export function assignGoalkeepers(tournament: Tournament): Tournament {
  const matches = tournament.matches.map((match) => ({ ...match }));
  const teams = tournament.teams.map((team) => ({
    ...team,
    gkCycleOrders: team.gkCycleOrders.map((order) => [...order]),
  }));

  for (const team of teams) {
    const eligibleIds = team.players
      .filter((player) => !player.absentToday)
      .map((player) => player.id);
    if (!eligibleIds.length) {
      for (const match of matches) {
        if (match.status !== 'finished' && match.teamAId === team.id)
          match.teamAGkPlayerId = undefined;
        if (match.status !== 'finished' && match.teamBId === team.id)
          match.teamBGkPlayerId = undefined;
      }
      continue;
    }

    const teamMatchCount = matches.filter(
      (match) => match.teamAId === team.id || match.teamBId === team.id,
    ).length;
    const cyclesNeeded = Math.max(
      2,
      Math.ceil(teamMatchCount / eligibleIds.length) + 1,
    );
    const cycleOrders = normalizedCycleOrders(team, eligibleIds, cyclesNeeded);
    team.gkCycleOrders = cycleOrders;
    team.gkRotation = cycleOrders[0] ?? eligibleIds;

    const dutyCounts = Object.fromEntries(
      eligibleIds.map((id) => [id, 0]),
    ) as Record<string, number>;
    for (const match of matches) {
      if (match.status !== 'finished') continue;
      const playerId =
        match.teamAId === team.id
          ? match.teamAGkPlayerId
          : match.teamBId === team.id
            ? match.teamBGkPlayerId
            : undefined;
      if (playerId && playerId in dutyCounts) dutyCounts[playerId] += 1;
    }

    for (const match of matches) {
      if (
        match.status === 'finished' ||
        (match.teamAId !== team.id && match.teamBId !== team.id)
      )
        continue;
      const minimumDuty = Math.min(...eligibleIds.map((id) => dutyCounts[id]));
      const order =
        cycleOrders[minimumDuty] ?? cycleOrders.at(-1) ?? eligibleIds;
      const selected =
        order.find(
          (id) => eligibleIds.includes(id) && dutyCounts[id] === minimumDuty,
        ) ?? eligibleIds[0];
      if (match.teamAId === team.id) match.teamAGkPlayerId = selected;
      else match.teamBGkPlayerId = selected;
      dutyCounts[selected] += 1;
    }
  }

  return { ...tournament, teams, matches };
}

export function createTournament(config: ScheduleConfig): Tournament {
  const pairs = fairRoundRobin(config.teams.map((team) => team.id));
  const slotMinutes = config.matchDurationMinutes + config.breakDurationMinutes;
  const matches: Match[] = pairs.map((pair, index) => ({
    id: makeId('match'),
    matchNumber: index + 1,
    roundNumber: pair.roundNumber,
    teamAId: pair.teamAId,
    teamBId: pair.teamBId,
    startTime: addMinutes(config.startTime, index * slotMinutes),
    status: index === 0 ? 'current' : 'upcoming',
  }));

  return assignGoalkeepers({
    id: makeId('tournament'),
    name: config.name,
    teams: config.teams,
    numberOfFields: 1,
    matchDurationMinutes: config.matchDurationMinutes,
    breakDurationMinutes: config.breakDurationMinutes,
    startTime: config.startTime,
    availableTimeMinutes: config.availableTimeMinutes,
    matches,
    createdAt: new Date().toISOString(),
  });
}

export function setMatchStatus(
  tournament: Tournament,
  matchId: string,
  status: Match['status'],
) {
  const targetIndex = tournament.matches.findIndex(
    (match) => match.id === matchId,
  );
  if (targetIndex < 0) return tournament;
  const matches = tournament.matches.map((match, index) => {
    if (status === 'current') {
      if (match.id === matchId) return { ...match, status: 'current' as const };
      if (match.status === 'current')
        return {
          ...match,
          status:
            index < targetIndex ? ('finished' as const) : ('upcoming' as const),
        };
    }
    if (match.id === matchId) return { ...match, status };
    return match;
  });
  if (status === 'finished') {
    const next = matches.find(
      (match, index) => index > targetIndex && match.status === 'upcoming',
    );
    if (next) next.status = 'current';
  }
  return assignGoalkeepers({ ...tournament, matches });
}

export function skipGoalkeeper(
  tournament: Tournament,
  matchId: string,
  teamId: string,
) {
  const match = tournament.matches.find((item) => item.id === matchId);
  const team = tournament.teams.find((item) => item.id === teamId);
  if (!match || !team || match.status === 'finished') return tournament;
  const currentGk =
    match.teamAId === teamId ? match.teamAGkPlayerId : match.teamBGkPlayerId;
  if (!currentGk) return tournament;

  const teams = tournament.teams.map((item) => {
    if (item.id !== teamId) return item;
    const moveToBack = (order: string[]) => [
      ...order.filter((id) => id !== currentGk),
      currentGk,
    ];
    return {
      ...item,
      gkRotation: moveToBack(item.gkRotation),
      gkCycleOrders: item.gkCycleOrders.map(moveToBack),
    };
  });
  return assignGoalkeepers({ ...tournament, teams });
}

export function playerFor(team: Team | undefined, playerId?: string) {
  return team?.players.find((player) => player.id === playerId);
}

export function createPlayer(name: string): Player {
  return { id: makeId('player'), name, absentToday: false };
}

export function reorder<T>(items: T[], from: number, to: number) {
  const result = [...items];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}
