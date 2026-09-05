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

function repeatedRoundRobin(teamIds: string[], matchCount: number): Pair[] {
  if (teamIds.length < 2 || matchCount <= 0) return [];
  const roundsPerCycle =
    teamIds.length % 2 === 0 ? teamIds.length - 1 : teamIds.length;
  const pairs: Pair[] = [];
  let cycle = 0;

  while (pairs.length < matchCount) {
    const orders = teamIds.flatMap((_, offset) => {
      const rotated = [...teamIds.slice(offset), ...teamIds.slice(0, offset)];
      return [rotated, [...rotated].reverse()];
    });
    const previous = pairs.at(-1);
    const candidates = orders.map((order) => fairRoundRobin(order));
    const cyclePairs =
      cycle === 0
        ? candidates[0]
        : (candidates.find((candidate) => {
            const first = candidate[0];
            return (
              !previous ||
              ![previous.teamAId, previous.teamBId].some(
                (id) => id === first.teamAId || id === first.teamBId,
              )
            );
          }) ?? candidates[cycle % candidates.length]);

    pairs.push(
      ...cyclePairs.map((pair) => ({
        ...pair,
        roundNumber: pair.roundNumber + cycle * roundsPerCycle,
      })),
    );
    cycle += 1;
  }

  return pairs.slice(0, matchCount);
}

function preferredPairFirst(
  pairs: Pair[],
  preferredTeamIds?: [string, string],
) {
  if (!preferredTeamIds) return pairs;
  const [teamAId, teamBId] = preferredTeamIds;
  const preferredIndex = pairs.findIndex(
    (pair) =>
      (pair.teamAId === teamAId && pair.teamBId === teamBId) ||
      (pair.teamAId === teamBId && pair.teamBId === teamAId),
  );
  if (preferredIndex < 0) return pairs;
  const preferred = pairs[preferredIndex];
  return [
    { ...preferred, teamAId, teamBId },
    ...pairs.filter((_, index) => index !== preferredIndex),
  ];
}

export function scheduleWindowMetrics(
  matchMinutes: number,
  breakMinutes: number,
  startTime: string,
  availableMinutes: number,
) {
  const slotMinutes = matchMinutes + breakMinutes;
  const matchCount =
    slotMinutes > 0 ? Math.floor(availableMinutes / slotMinutes) : 0;
  const scheduledMinutes = matchCount * slotMinutes;
  return {
    matchCount,
    scheduledMinutes,
    endTime: addMinutes(startTime, scheduledMinutes),
    remainingMinutes: Math.max(0, availableMinutes - scheduledMinutes),
  };
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
  const slotMinutes = config.matchDurationMinutes + config.breakDurationMinutes;
  const windowMetrics = scheduleWindowMetrics(
    config.matchDurationMinutes,
    config.breakDurationMinutes,
    config.startTime,
    config.availableTimeMinutes,
  );
  const pairs = preferredPairFirst(
    repeatedRoundRobin(
      config.teams.map((team) => team.id),
      windowMetrics.matchCount,
    ),
    config.firstMatchTeamIds,
  );
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

export function updateTournamentSettings(
  tournament: Tournament,
  settings: {
    name: string;
    matchDurationMinutes: number;
    breakDurationMinutes: number;
    startTime: string;
    availableTimeMinutes: number;
  },
): Tournament {
  const windowMetrics = scheduleWindowMetrics(
    settings.matchDurationMinutes,
    settings.breakDurationMinutes,
    settings.startTime,
    settings.availableTimeMinutes,
  );
  const protectedCount = tournament.matches.reduce(
    (count, match, index) =>
      match.status === 'upcoming' ? count : Math.max(count, index + 1),
    0,
  );
  const targetCount = Math.max(windowMetrics.matchCount, protectedCount);
  const slotMinutes =
    settings.matchDurationMinutes + settings.breakDurationMinutes;
  const generatedPairs = repeatedRoundRobin(
    tournament.teams.map((team) => team.id),
    targetCount,
  );
  const matches: Match[] = Array.from({ length: targetCount }, (_, index) => {
    const existing = tournament.matches[index];
    const pair = generatedPairs[index];
    return existing
      ? {
          ...existing,
          matchNumber: index + 1,
          startTime: addMinutes(settings.startTime, index * slotMinutes),
        }
      : {
          id: makeId('match'),
          matchNumber: index + 1,
          roundNumber: pair.roundNumber,
          teamAId: pair.teamAId,
          teamBId: pair.teamBId,
          startTime: addMinutes(settings.startTime, index * slotMinutes),
          status: 'upcoming' as const,
        };
  });

  if (matches.length && !matches.some((match) => match.status === 'current')) {
    const firstUpcoming = matches.find((match) => match.status === 'upcoming');
    if (firstUpcoming) firstUpcoming.status = 'current';
  }

  return assignGoalkeepers({
    ...tournament,
    ...settings,
    name: settings.name.trim(),
    matches,
  });
}

export function prioritizeUpcomingMatches(
  tournament: Tournament,
  preferredPairs: Array<[string, string]>,
): Tournament {
  if (!preferredPairs.length) return tournament;
  const editableMatches = tournament.matches.filter(
    (match) => match.status !== 'finished',
  );
  if (!editableMatches.length) return tournament;

  const remaining = editableMatches.map((match) => ({ ...match }));
  const prioritized: Match[] = [];
  for (const [teamAId, teamBId] of preferredPairs) {
    const matchIndex = remaining.findIndex(
      (match) =>
        (match.teamAId === teamAId && match.teamBId === teamBId) ||
        (match.teamAId === teamBId && match.teamBId === teamAId),
    );
    const [match] = remaining.splice(matchIndex >= 0 ? matchIndex : 0, 1);
    if (!match) continue;
    const reversed =
      match.teamAId === teamBId && match.teamBId === teamAId;
    prioritized.push({
      ...match,
      teamAId,
      teamBId,
      teamAScore:
        matchIndex < 0
          ? undefined
          : reversed
            ? match.teamBScore
            : match.teamAScore,
      teamBScore:
        matchIndex < 0
          ? undefined
          : reversed
            ? match.teamAScore
            : match.teamBScore,
      teamAGkPlayerId: undefined,
      teamBGkPlayerId: undefined,
    });
  }

  if (!prioritized.length) return tournament;
  const orderedEditable = [...prioritized, ...remaining];
  const slotMinutes =
    tournament.matchDurationMinutes + tournament.breakDurationMinutes;
  let editableIndex = 0;
  const matches = tournament.matches.map((match, index) => {
    const scheduled = {
      matchNumber: index + 1,
      startTime: addMinutes(tournament.startTime, index * slotMinutes),
    };
    if (match.status === 'finished') return { ...match, ...scheduled };
    const next = orderedEditable[editableIndex];
    editableIndex += 1;
    return {
      ...next,
      ...scheduled,
      status: editableIndex === 1 ? ('current' as const) : ('upcoming' as const),
    };
  });

  return assignGoalkeepers({ ...tournament, matches });
}

export function extendTournamentToEndTime(tournament: Tournament): Tournament {
  const windowMetrics = scheduleWindowMetrics(
    tournament.matchDurationMinutes,
    tournament.breakDurationMinutes,
    tournament.startTime,
    tournament.availableTimeMinutes,
  );
  if (tournament.matches.length >= windowMetrics.matchCount) return tournament;

  const slotMinutes =
    tournament.matchDurationMinutes + tournament.breakDurationMinutes;
  const pairs = repeatedRoundRobin(
    tournament.teams.map((team) => team.id),
    windowMetrics.matchCount,
  );
  const matches = [
    ...tournament.matches,
    ...pairs.slice(tournament.matches.length).map((pair, offset) => {
      const index = tournament.matches.length + offset;
      return {
        id: makeId('match'),
        matchNumber: index + 1,
        roundNumber: pair.roundNumber,
        teamAId: pair.teamAId,
        teamBId: pair.teamBId,
        startTime: addMinutes(tournament.startTime, index * slotMinutes),
        status: 'upcoming' as const,
      };
    }),
  ];

  return assignGoalkeepers({ ...tournament, matches });
}

export function extendTournamentByMatches(
  tournament: Tournament,
  matchCount = 1,
): Tournament {
  const slotMinutes =
    tournament.matchDurationMinutes + tournament.breakDurationMinutes;
  return extendTournamentToEndTime({
    ...tournament,
    availableTimeMinutes:
      tournament.availableTimeMinutes + Math.max(0, matchCount) * slotMinutes,
  });
}

export function setMatchScore(
  tournament: Tournament,
  matchId: string,
  teamAScore: number,
  teamBScore: number,
): Tournament {
  const normalizedA = Math.max(0, Math.floor(teamAScore));
  const normalizedB = Math.max(0, Math.floor(teamBScore));
  return {
    ...tournament,
    matches: tournament.matches.map((match) =>
      match.id === matchId
        ? { ...match, teamAScore: normalizedA, teamBScore: normalizedB }
        : match,
    ),
  };
}

export function finishMatchWithScore(
  tournament: Tournament,
  matchId: string,
  teamAScore: number,
  teamBScore: number,
): Tournament {
  return setMatchStatus(
    setMatchScore(tournament, matchId, teamAScore, teamBScore),
    matchId,
    'finished',
  );
}

export function reopenFinishedMatch(
  tournament: Tournament,
  matchId: string,
): Tournament {
  const target = tournament.matches.find((match) => match.id === matchId);
  if (!target || target.status !== 'finished') return tournament;
  const matches = tournament.matches.map((match) => {
    if (match.id === matchId) return { ...match, status: 'current' as const };
    if (match.status === 'current')
      return { ...match, status: 'upcoming' as const };
    return match;
  });
  return assignGoalkeepers({ ...tournament, matches });
}

export type TeamStanding = {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

export function calculateStandings(tournament: Tournament): TeamStanding[] {
  const teamOrder = new Map(
    tournament.teams.map((team, index) => [team.id, index]),
  );
  const standings = new Map<string, TeamStanding>(
    tournament.teams.map((team) => [
      team.id,
      {
        teamId: team.id,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      },
    ]),
  );

  for (const match of tournament.matches) {
    if (
      match.status !== 'finished' ||
      match.teamAScore === undefined ||
      match.teamBScore === undefined
    )
      continue;
    const teamA = standings.get(match.teamAId);
    const teamB = standings.get(match.teamBId);
    if (!teamA || !teamB) continue;
    teamA.played += 1;
    teamB.played += 1;
    teamA.goalsFor += match.teamAScore;
    teamA.goalsAgainst += match.teamBScore;
    teamB.goalsFor += match.teamBScore;
    teamB.goalsAgainst += match.teamAScore;
    if (match.teamAScore > match.teamBScore) {
      teamA.won += 1;
      teamA.points += 3;
      teamB.lost += 1;
    } else if (match.teamAScore < match.teamBScore) {
      teamB.won += 1;
      teamB.points += 3;
      teamA.lost += 1;
    } else {
      teamA.drawn += 1;
      teamB.drawn += 1;
      teamA.points += 1;
      teamB.points += 1;
    }
  }

  for (const standing of standings.values()) {
    standing.goalDifference = standing.goalsFor - standing.goalsAgainst;
  }
  return [...standings.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      (teamOrder.get(a.teamId) ?? 0) - (teamOrder.get(b.teamId) ?? 0),
  );
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
