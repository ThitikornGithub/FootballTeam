import type {
  Match,
  MatchScorer,
  Player,
  ScheduleConfig,
  Team,
  Tournament,
} from './football-types';

// Must stay in step with the bound parseTournament enforces in football-schema.
export const MAX_AVAILABLE_TIME_MINUTES = 1440;

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
  // Whoever closed the previous cycle must not open this one, or that player
  // keeps goal two matches running. With two players no shuffle satisfies both
  // rules at once, so repair the order rather than reshuffling for it.
  const previousLast = previous?.at(-1);
  if (previousLast !== undefined && result[0] === previousLast) {
    const swapIndex = result.findIndex(
      (item, index) => index > 0 && item !== previousLast,
    );
    if (swapIndex > 0)
      [result[0], result[swapIndex]] = [result[swapIndex], result[0]];
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
  const difference = endTotal - startTotal;
  if (difference === 0) return 0;
  return difference > 0 ? difference : difference + 24 * 60;
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

function pairKey(teamAId: string, teamBId: string) {
  return [teamAId, teamBId].sort().join(':');
}

function includesTeam(pair: Pick<Pair, 'teamAId' | 'teamBId'>, teamId: string) {
  return pair.teamAId === teamId || pair.teamBId === teamId;
}

function balancedFuturePairs(
  teamIds: string[],
  fixedMatches: Array<Pick<Match, 'teamAId' | 'teamBId'>>,
  matchCount: number,
  preferredPairs: Array<[string, string]> = [],
) {
  if (teamIds.length < 2 || matchCount <= 0) return [];
  const teamIdSet = new Set(teamIds);
  const canonicalPairs = fairRoundRobin(teamIds);
  const pairCounts = new Map(
    canonicalPairs.map((pair) => [pairKey(pair.teamAId, pair.teamBId), 0]),
  );
  const teamCounts = new Map(teamIds.map((teamId) => [teamId, 0]));
  const sequence: Array<Pick<Pair, 'teamAId' | 'teamBId'>> = [];
  const roundsPerCycle =
    teamIds.length % 2 === 0 ? teamIds.length - 1 : teamIds.length;

  function record(pair: Pick<Pair, 'teamAId' | 'teamBId'>) {
    const key = pairKey(pair.teamAId, pair.teamBId);
    if (!pairCounts.has(key)) return;
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    teamCounts.set(pair.teamAId, (teamCounts.get(pair.teamAId) ?? 0) + 1);
    teamCounts.set(pair.teamBId, (teamCounts.get(pair.teamBId) ?? 0) + 1);
    sequence.push(pair);
  }

  fixedMatches.forEach(record);
  const generated: Pair[] = [];
  function appendPair(canonical: Pair, orientation?: [string, string]) {
    const key = pairKey(canonical.teamAId, canonical.teamBId);
    const previousCount = pairCounts.get(key) ?? 0;
    const useReverse = !orientation && previousCount % 2 === 1;
    const teamAId =
      orientation?.[0] ?? (useReverse ? canonical.teamBId : canonical.teamAId);
    const teamBId =
      orientation?.[1] ?? (useReverse ? canonical.teamAId : canonical.teamBId);
    const pair = {
      teamAId,
      teamBId,
      roundNumber: canonical.roundNumber + previousCount * roundsPerCycle,
    };
    generated.push(pair);
    record(pair);
  }

  const usedPreferred = new Set<string>();
  for (const [teamAId, teamBId] of preferredPairs) {
    if (
      generated.length >= matchCount ||
      teamAId === teamBId ||
      !teamIdSet.has(teamAId) ||
      !teamIdSet.has(teamBId)
    )
      continue;
    const key = pairKey(teamAId, teamBId);
    if (usedPreferred.has(key)) continue;
    const canonical = canonicalPairs.find(
      (pair) => pairKey(pair.teamAId, pair.teamBId) === key,
    );
    if (!canonical) continue;
    usedPreferred.add(key);
    appendPair(canonical, [teamAId, teamBId]);
  }

  while (generated.length < matchCount) {
    const last = sequence.at(-1);
    const previous = sequence.at(-2);
    const ranked = canonicalPairs
      .map((pair, canonicalIndex) => {
        const teams = [pair.teamAId, pair.teamBId];
        const threeInARow = teams.filter(
          (teamId) =>
            last &&
            previous &&
            includesTeam(last, teamId) &&
            includesTeam(previous, teamId),
        ).length;
        const overlapsLast = last
          ? teams.filter((teamId) => includesTeam(last, teamId)).length
          : 0;
        return {
          pair,
          canonicalIndex,
          pairCount: pairCounts.get(pairKey(pair.teamAId, pair.teamBId)) ?? 0,
          threeInARow,
          overlapsLast,
          teamLoad:
            (teamCounts.get(pair.teamAId) ?? 0) +
            (teamCounts.get(pair.teamBId) ?? 0),
        };
      })
      .sort(
        (a, b) =>
          a.pairCount - b.pairCount ||
          a.threeInARow - b.threeInARow ||
          a.overlapsLast - b.overlapsLast ||
          a.teamLoad - b.teamLoad ||
          a.canonicalIndex - b.canonicalIndex,
      );
    const next = ranked[0]?.pair;
    if (!next) break;
    appendPair(next);
  }

  return generated;
}

function lockedMatchesForPlanning(tournament: Tournament) {
  const hasFinished = tournament.matches.some(
    (match) => match.status === 'finished',
  );
  return hasFinished
    ? tournament.matches.filter((match) => match.status !== 'upcoming')
    : [];
}

export function recommendUpcomingPairs(
  tournament: Tournament,
  matchCount = 2,
  preferredPairs: Array<[string, string]> = [],
): Array<[string, string]> {
  return balancedFuturePairs(
    tournament.teams.map((team) => team.id),
    lockedMatchesForPlanning(tournament),
    matchCount,
    preferredPairs,
  ).map((pair) => [pair.teamAId, pair.teamBId]);
}

export function pairMeetingCount(
  tournament: Tournament,
  teamAId: string,
  teamBId: string,
) {
  const key = pairKey(teamAId, teamBId);
  return lockedMatchesForPlanning(tournament).filter(
    (match) => pairKey(match.teamAId, match.teamBId) === key,
  ).length;
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
    // Copied, or the queue and the first cycle would be one array under two
    // names, and a later edit to either would silently rewrite both.
    team.gkRotation = [...(cycleOrders[0] ?? eligibleIds)];

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

function assignGoalkeepersPreservingCurrent(
  tournament: Tournament,
  matches: Match[],
  lockedCurrent?: Match,
) {
  const assigned = assignGoalkeepers({
    ...tournament,
    matches: lockedCurrent
      ? matches.map((match) =>
          match.id === lockedCurrent.id
            ? { ...match, status: 'finished' as const }
            : match,
        )
      : matches,
  });
  return lockedCurrent
    ? {
        ...assigned,
        matches: assigned.matches.map((match) =>
          match.id === lockedCurrent.id
            ? { ...match, status: 'current' as const }
            : match,
        ),
      }
    : assigned;
}

export function createTournament(config: ScheduleConfig): Tournament {
  const slotMinutes = config.matchDurationMinutes + config.breakDurationMinutes;
  const windowMetrics = scheduleWindowMetrics(
    config.matchDurationMinutes,
    config.breakDurationMinutes,
    config.startTime,
    config.availableTimeMinutes,
  );
  const pairs = balancedFuturePairs(
    config.teams.map((team) => team.id),
    [],
    windowMetrics.matchCount,
    config.firstMatchTeamIds ? [config.firstMatchTeamIds] : [],
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
  const lockedCurrent = tournament.matches.some(
    (match) => match.status === 'finished',
  )
    ? tournament.matches.find((match) => match.status === 'current')
    : undefined;
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
  const generatedPairs = balancedFuturePairs(
    tournament.teams.map((team) => team.id),
    tournament.matches,
    Math.max(0, targetCount - tournament.matches.length),
  );
  const matches: Match[] = Array.from(
    { length: targetCount },
    (_, index) => index,
  ).flatMap((index) => {
    const existing = tournament.matches[index];
    if (existing)
      return [
        {
          ...existing,
          matchNumber: index + 1,
          startTime: addMinutes(settings.startTime, index * slotMinutes),
        },
      ];
    const pair = generatedPairs[index - tournament.matches.length];
    // Fewer than two teams produces no pairings, so there is no match to add.
    if (!pair) return [];
    return [
      {
        id: makeId('match'),
        matchNumber: index + 1,
        roundNumber: pair.roundNumber,
        teamAId: pair.teamAId,
        teamBId: pair.teamBId,
        startTime: addMinutes(settings.startTime, index * slotMinutes),
        status: 'upcoming' as const,
      },
    ];
  });

  if (matches.length && !matches.some((match) => match.status === 'current')) {
    const firstUpcoming = matches.find((match) => match.status === 'upcoming');
    if (firstUpcoming) firstUpcoming.status = 'current';
  }

  return assignGoalkeepersPreservingCurrent(
    {
      ...tournament,
      ...settings,
      name: settings.name.trim(),
      matches,
    },
    matches,
    lockedCurrent,
  );
}

export function reshuffleUpcomingMatches(
  tournament: Tournament,
  preferredPairs: Array<[string, string]>,
): Tournament {
  const finishedMatchesExist = tournament.matches.some(
    (match) => match.status === 'finished',
  );
  const lockedCurrent = finishedMatchesExist
    ? tournament.matches.find((match) => match.status === 'current')
    : undefined;
  const editableMatches = tournament.matches.filter(
    (match) => match.status !== 'finished' && match.id !== lockedCurrent?.id,
  );
  if (!editableMatches.length) return tournament;

  const lockedMatches = tournament.matches.filter(
    (match) => match.status === 'finished' || match.id === lockedCurrent?.id,
  );
  const generatedPairs = balancedFuturePairs(
    tournament.teams.map((team) => team.id),
    lockedMatches,
    editableMatches.length,
    preferredPairs,
  );
  const slotMinutes =
    tournament.matchDurationMinutes + tournament.breakDurationMinutes;
  let editableIndex = 0;
  const matches = tournament.matches.map((match, index) => {
    const scheduled = {
      matchNumber: index + 1,
      startTime: addMinutes(tournament.startTime, index * slotMinutes),
    };
    if (match.status === 'finished' || match.id === lockedCurrent?.id)
      return { ...match, ...scheduled };
    const pair = generatedPairs[editableIndex];
    const existingId = match.id;
    editableIndex += 1;
    // Before the first result the live match is reshuffleable, so a score
    // already typed into it used to be dropped by changing any setting. Keep it
    // whenever the fixture is unchanged; a different pairing starts blank.
    const samePairing =
      pair.teamAId === match.teamAId && pair.teamBId === match.teamBId;
    return {
      id: existingId,
      ...pair,
      ...scheduled,
      teamAScore: samePairing ? match.teamAScore : undefined,
      teamBScore: samePairing ? match.teamBScore : undefined,
      scorers: samePairing ? match.scorers : undefined,
      teamAGkPlayerId: undefined,
      teamBGkPlayerId: undefined,
      status:
        !lockedCurrent && editableIndex === 1
          ? ('current' as const)
          : ('upcoming' as const),
    };
  });

  return assignGoalkeepersPreservingCurrent(
    { ...tournament, matches },
    matches,
    lockedCurrent,
  );
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
  const pairs = balancedFuturePairs(
    tournament.teams.map((team) => team.id),
    tournament.matches,
    windowMetrics.matchCount - tournament.matches.length,
  );
  const hasCurrent = tournament.matches.some(
    (match) => match.status === 'current',
  );
  const matches = [
    ...tournament.matches,
    ...pairs.map((pair, offset) => {
      const index = tournament.matches.length + offset;
      return {
        id: makeId('match'),
        matchNumber: index + 1,
        roundNumber: pair.roundNumber,
        teamAId: pair.teamAId,
        teamBId: pair.teamBId,
        startTime: addMinutes(tournament.startTime, index * slotMinutes),
        status:
          !hasCurrent && offset === 0
            ? ('current' as const)
            : ('upcoming' as const),
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
    // parseTournament rejects anything past a full day, so an unclamped total
    // would make the saved game unreadable on every device.
    availableTimeMinutes: Math.min(
      MAX_AVAILABLE_TIME_MINUTES,
      tournament.availableTimeMinutes + Math.max(0, matchCount) * slotMinutes,
    ),
  });
}

function normalizeScore(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function setMatchScore(
  tournament: Tournament,
  matchId: string,
  teamAScore: number,
  teamBScore: number,
): Tournament {
  const normalizedA = normalizeScore(teamAScore);
  const normalizedB = normalizeScore(teamBScore);
  return {
    ...tournament,
    matches: tournament.matches.map((match) =>
      match.id === matchId
        ? { ...match, teamAScore: normalizedA, teamBScore: normalizedB }
        : match,
    ),
  };
}

export function setMatchScorers(
  tournament: Tournament,
  matchId: string,
  scorers: MatchScorer[],
): Tournament {
  return {
    ...tournament,
    matches: tournament.matches.map((match) =>
      match.id === matchId
        ? {
            ...match,
            scorers: scorers
              .filter(
                (scorer) =>
                  (scorer.teamId === match.teamAId ||
                    scorer.teamId === match.teamBId) &&
                  scorer.playerName.trim() &&
                  scorer.goals > 0,
              )
              .map((scorer) => ({
                ...scorer,
                playerName: scorer.playerName.trim().slice(0, 60),
                goals: Math.min(99, Math.max(1, Math.floor(scorer.goals))),
              })),
          }
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

export type TopScorer = {
  teamId: string;
  playerId?: string;
  playerName: string;
  goals: number;
};

export function calculateTopScorers(
  tournament: Tournament,
  limit = 3,
): TopScorer[] {
  const totals = new Map<string, TopScorer & { firstSeen: number }>();
  let firstSeen = 0;
  for (const match of tournament.matches) {
    if (match.status !== 'finished') continue;
    for (const scorer of match.scorers ?? []) {
      const normalizedName = scorer.playerName.trim().toLocaleLowerCase();
      const key = scorer.playerId
        ? `${scorer.teamId}:id:${scorer.playerId}`
        : `${scorer.teamId}:name:${normalizedName}`;
      const existing = totals.get(key);
      if (existing) existing.goals += scorer.goals;
      else {
        totals.set(key, {
          teamId: scorer.teamId,
          playerId: scorer.playerId,
          playerName: scorer.playerName.trim(),
          goals: scorer.goals,
          firstSeen,
        });
        firstSeen += 1;
      }
    }
  }
  return [...totals.values()]
    .sort(
      (first, second) =>
        second.goals - first.goals ||
        first.firstSeen - second.firstSeen ||
        first.playerName.localeCompare(second.playerName, 'th'),
    )
    .slice(0, Math.max(0, limit))
    .map(({ firstSeen: _firstSeen, ...scorer }) => scorer);
}

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
  // Finishing a match that was not the live one must leave the live match
  // alone rather than promoting a second current match.
  const liveElsewhere = tournament.matches.some(
    (match, index) => index !== targetIndex && match.status === 'current',
  );
  // Prefer the next match in the running order, but fall back to any upcoming
  // one so finishing a match started out of turn still leaves a live match.
  const promoteIndex =
    status === 'finished' && !liveElsewhere
      ? (() => {
          const next = tournament.matches.findIndex(
            (match, index) =>
              index > targetIndex && match.status === 'upcoming',
          );
          return next >= 0
            ? next
            : tournament.matches.findIndex(
                (match) => match.status === 'upcoming',
              );
        })()
      : -1;
  const matches = tournament.matches.map((match, index) => {
    if (index === targetIndex) return { ...match, status };
    if (status === 'current' && match.status === 'current')
      return { ...match, status: 'upcoming' as const };
    if (index === promoteIndex) return { ...match, status: 'current' as const };
    return match;
  });
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

export function createPlayer(
  name: string,
  positions: Player['positions'] = [],
): Player {
  return { id: makeId('player'), name, absentToday: false, positions };
}

export function reorder<T>(items: T[], from: number, to: number) {
  const result = [...items];
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    from >= items.length ||
    to < 0 ||
    to >= items.length
  )
    return result;
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}
