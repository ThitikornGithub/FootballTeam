import { createDemoTournament, makeTeam } from '../lib/demo-data';
import {
  assignGoalkeepers,
  calculateStandings,
  calculateTopScorers,
  createTournament,
  extendTournamentByMatches,
  extendTournamentToEndTime,
  finishMatchWithScore,
  minutesBetween,
  pairMeetingCount,
  recommendUpcomingPairs,
  reopenFinishedMatch,
  reshuffleUpcomingMatches,
  scheduleMetrics,
  scheduleWindowMetrics,
  setMatchScore,
  setMatchScorers,
  setMatchStatus,
  skipGoalkeeper,
  updateTournamentSettings,
} from '../lib/football-engine';
import {
  autoPlaceTeamMarkers,
  formationsForPlayerCount,
  goalkeeperForTeam,
} from '../lib/football-tactics';
import { parseTournament } from '../lib/football-schema';
import {
  MAX_SYNC_RETRY_MS,
  newestPendingState,
  syncRetryDelayMs,
} from '../lib/football-sync';
import { TEAM_COLORS, type Match } from '../lib/football-types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function meetingCounts(matches: Match[]) {
  const counts = new Map<string, number>();
  for (const match of matches) {
    const key = [match.teamAId, match.teamBId].sort().join(':');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()];
}

const tournament = createDemoTournament();
assert(
  tournament.teams.length === 4 && tournament.matches.length === 15,
  'The default four teams must fill the three-hour window with 15 matches',
);
assert(
  tournament.matches.filter((match) => match.status === 'current').length === 1,
  'Exactly one match starts current',
);

const pairKeys = tournament.matches.map((match) =>
  [match.teamAId, match.teamBId].sort().join(':'),
);
assert(
  new Set(pairKeys.slice(0, 6)).size === 6,
  'Every pair must appear exactly once before the next cycle',
);

for (let teamCount = 2; teamCount <= 8; teamCount += 1) {
  const teams = Array.from({ length: teamCount }, (_, index) =>
    makeTeam(`Team ${index + 1}`, TEAM_COLORS[index]),
  );
  const pairCount = (teamCount * (teamCount - 1)) / 2;
  const generated = createTournament({
    name: `${teamCount} teams`,
    teams,
    firstMatchTeamIds: [teams.at(-1)!.id, teams[0].id],
    matchDurationMinutes: 7,
    breakDurationMinutes: 1,
    startTime: '19:00',
    availableTimeMinutes: pairCount * 8,
  });
  assert(
    meetingCounts(generated.matches).length === pairCount,
    `A ${teamCount}-team first cycle must contain every pairing exactly once`,
  );
  let extended = generated;
  for (let index = 0; index < 3; index += 1) {
    extended = extendTournamentByMatches(extended, 1);
  }
  const extendedCounts = meetingCounts(extended.matches);
  assert(
    Math.max(...extendedCounts) - Math.min(...extendedCounts) <= 1,
    `A ${teamCount}-team schedule must stay balanced after repeated extensions`,
  );
}

for (const team of tournament.teams) {
  const teamMatches = tournament.matches.filter(
    (match) => match.teamAId === team.id || match.teamBId === team.id,
  );
  assert(
    teamMatches.length >= 7,
    `${team.name} must play throughout the evening`,
  );
  const goalkeeperIds = teamMatches
    .slice(0, team.players.length)
    .map((match) =>
      match.teamAId === team.id ? match.teamAGkPlayerId : match.teamBGkPlayerId,
    );
  assert(
    new Set(goalkeeperIds).size === goalkeeperIds.length,
    `${team.name} must not repeat a GK before the cycle completes`,
  );
}

for (const team of tournament.teams) {
  for (let index = 2; index < tournament.matches.length; index += 1) {
    const playsThreeInARow = tournament.matches
      .slice(index - 2, index + 1)
      .every((match) => match.teamAId === team.id || match.teamBId === team.id);
    assert(
      !playsThreeInARow,
      `${team.name} should not play three matches in a row`,
    );
  }
}

const metrics = scheduleMetrics(6, 10, 2, '18:00');
assert(
  metrics.matchCount === 15 &&
    metrics.requiredMinutes === 180 &&
    metrics.endTime === '21:00',
  'Time calculation must match the V1 example',
);
assert(
  minutesBetween('18:00', '22:00') === 240 &&
    minutesBetween('23:00', '01:00') === 120 &&
    minutesBetween('22:00', '22:00') === 0,
  'End-time selection must calculate same-day and overnight windows',
);
const windowMetrics = scheduleWindowMetrics(10, 2, '19:00', 180);
assert(
  windowMetrics.matchCount === 15 &&
    windowMetrics.endTime === '22:00' &&
    windowMetrics.remainingMinutes === 0,
  'The schedule must fill the selected end-time window',
);

assert(
  tournament.matches.at(-1)?.startTime === '21:48',
  'Four teams must repeat only after every pairing and fill the window',
);

const legacyTournament = {
  ...tournament,
  matches: tournament.matches.slice(0, 6),
};
const extendedTournament = extendTournamentToEndTime(legacyTournament);
assert(
  extendedTournament.matches.length === 15 &&
    extendedTournament.matches[14].startTime === '21:48',
  'A saved one-cycle schedule must extend to the selected end time',
);

const first = tournament.matches[0];
const firstTeam = tournament.teams.find((team) => team.id === first.teamAId)!;
const originalGk = first.teamAGkPlayerId;
const absentTeams = tournament.teams.map((team) =>
  team.id === firstTeam.id
    ? {
        ...team,
        players: team.players.map((player) =>
          player.id === originalGk ? { ...player, absentToday: true } : player,
        ),
      }
    : team,
);
const afterAbsent = assignGoalkeepers({ ...tournament, teams: absentTeams });
assert(
  afterAbsent.matches[0].teamAGkPlayerId !== originalGk,
  "Absent player must be removed from today's GK rotation",
);

const beforeSkip = afterAbsent.matches[0].teamAGkPlayerId;
const afterSkip = skipGoalkeeper(
  afterAbsent,
  afterAbsent.matches[0].id,
  firstTeam.id,
);
assert(
  afterSkip.matches[0].teamAGkPlayerId !== beforeSkip,
  'Skipping GK must advance the queue',
);

const liveScoreDraft = setMatchScore(afterSkip, afterSkip.matches[0].id, 2, 1);
assert(
  liveScoreDraft.matches[0].status === 'current' &&
    liveScoreDraft.matches[0].teamAScore === 2 &&
    liveScoreDraft.matches[0].teamBScore === 1 &&
    calculateStandings(liveScoreDraft).every((row) => row.played === 0),
  'A live score draft must persist without affecting standings before the match finishes',
);

const liveScoreWithScorers = setMatchScorers(
  liveScoreDraft,
  liveScoreDraft.matches[0].id,
  [
    {
      id: 'scorer-1',
      teamId: liveScoreDraft.matches[0].teamAId,
      playerId: liveScoreDraft.teams[0].players[1].id,
      playerName: liveScoreDraft.teams[0].players[1].name,
      goals: 2,
    },
    {
      id: 'scorer-2',
      teamId: liveScoreDraft.matches[0].teamBId,
      playerName: 'Guest scorer',
      goals: 1,
    },
  ],
);
assert(
  calculateTopScorers(liveScoreWithScorers).length === 0,
  'Live scorer drafts must not enter the top-scorer ranking before the match finishes',
);

const afterFinish = finishMatchWithScore(
  liveScoreWithScorers,
  liveScoreWithScorers.matches[0].id,
  3,
  1,
);
assert(
  calculateTopScorers(afterFinish)[0]?.goals === 2,
  'Finished scorer records must produce a descending top-scorer ranking',
);
assert(
  afterFinish.matches[0].status === 'finished' &&
    afterFinish.matches[0].teamAScore === 3 &&
    afterFinish.matches[0].teamBScore === 1 &&
    afterFinish.matches[1].status === 'current',
  'Saving a score must finish the match and advance the live match',
);
const standings = calculateStandings(afterFinish);
assert(
  standings[0].teamId === afterFinish.matches[0].teamAId &&
    standings[0].points === 3 &&
    standings[0].goalDifference === 2,
  'A saved result must update the standings',
);
const [teamOne, teamTwo, teamThree, teamFour] = afterFinish.teams;
const updatedDuringPlay = updateTournamentSettings(afterFinish, {
  name: afterFinish.name,
  matchDurationMinutes: 8,
  breakDurationMinutes: 1,
  startTime: afterFinish.startTime,
  availableTimeMinutes: afterFinish.availableTimeMinutes,
});
assert(
  updatedDuringPlay.matches[1].teamAId === afterFinish.matches[1].teamAId &&
    updatedDuringPlay.matches[1].teamBId === afterFinish.matches[1].teamBId &&
    updatedDuringPlay.matches[1].teamAGkPlayerId ===
      afterFinish.matches[1].teamAGkPlayerId &&
    updatedDuringPlay.matches[1].teamBGkPlayerId ===
      afterFinish.matches[1].teamBGkPlayerId &&
    updatedDuringPlay.matches[1].status === 'current',
  'Changing time settings during play must preserve the live pairing and goalkeepers',
);
const reshuffledAfterStart = reshuffleUpcomingMatches(updatedDuringPlay, [
  [teamOne.id, teamTwo.id],
  [teamThree.id, teamFour.id],
]);
assert(
  reshuffledAfterStart.matches[0].id === afterFinish.matches[0].id &&
    reshuffledAfterStart.matches[0].status === 'finished' &&
    reshuffledAfterStart.matches[0].teamAScore === 3 &&
    reshuffledAfterStart.matches[0].teamBScore === 1,
  'Reshuffling must preserve every finished match and its score',
);
assert(
  reshuffledAfterStart.matches[1].id === afterFinish.matches[1].id &&
    reshuffledAfterStart.matches[1].status === 'current' &&
    reshuffledAfterStart.matches[1].teamAId ===
      afterFinish.matches[1].teamAId &&
    reshuffledAfterStart.matches[1].teamBId ===
      afterFinish.matches[1].teamBId &&
    reshuffledAfterStart.matches[1].teamAGkPlayerId ===
      afterFinish.matches[1].teamAGkPlayerId &&
    reshuffledAfterStart.matches[1].teamBGkPlayerId ===
      afterFinish.matches[1].teamBGkPlayerId,
  'Reshuffling during play must preserve the live match and its goalkeepers',
);
assert(
  reshuffledAfterStart.matches[2].teamAId === teamOne.id &&
    reshuffledAfterStart.matches[2].teamBId === teamTwo.id &&
    reshuffledAfterStart.matches[3].teamAId === teamThree.id &&
    reshuffledAfterStart.matches[3].teamBId === teamFour.id,
  'Preferred pairs must become the first and second matches after the live match',
);
const reshuffledMeetingCounts = meetingCounts(reshuffledAfterStart.matches);
assert(
  reshuffledMeetingCounts.length === 6 &&
    Math.max(...reshuffledMeetingCounts) -
      Math.min(...reshuffledMeetingCounts) <=
      1,
  'Reshuffling must balance every pairing across the complete schedule',
);
const reshuffledOpening = reshuffleUpcomingMatches(tournament, [
  [teamThree.id, teamOne.id],
  [teamTwo.id, teamFour.id],
]);
assert(
  reshuffledOpening.matches[0].status === 'current' &&
    reshuffledOpening.matches[0].teamAId === teamThree.id &&
    reshuffledOpening.matches[0].teamBId === teamOne.id &&
    reshuffledOpening.matches[1].teamAId === teamTwo.id &&
    reshuffledOpening.matches[1].teamBId === teamFour.id,
  'Before play starts, the selected opening pair and second pair must lead the reshuffled schedule',
);
assert(
  new Set(
    reshuffledOpening.matches
      .slice(0, 6)
      .map((match) => [match.teamAId, match.teamBId].sort().join(':')),
  ).size === 6,
  'Choosing the opening pairs must still keep every pairing in the first cycle',
);
let afterOneCycle = tournament;
for (let index = 0; index < 6; index += 1) {
  const current = afterOneCycle.matches.find(
    (match) => match.status === 'current',
  );
  assert(current, 'A current match must exist while completing a cycle');
  afterOneCycle = finishMatchWithScore(afterOneCycle, current.id, 0, 0);
}
const [recommendedPair] = recommendUpcomingPairs(afterOneCycle, 1);
assert(
  Boolean(recommendedPair) &&
    pairMeetingCount(afterOneCycle, recommendedPair[0], recommendedPair[1]) ===
      1,
  'The recommendation must prefer a pairing that has played fewer times',
);
const reopened = reopenFinishedMatch(afterFinish, afterFinish.matches[0].id);
assert(
  reopened.matches[0].status === 'current' &&
    reopened.matches[1].status === 'upcoming' &&
    calculateStandings(reopened)[0].points === 0,
  'Undoing a finished match must restore it as current and recalculate standings',
);
const continuedTournament = extendTournamentByMatches(afterFinish, 1);
assert(
  continuedTournament.matches.length === 16 &&
    continuedTournament.availableTimeMinutes === 192 &&
    continuedTournament.matches.at(-1)?.startTime === '22:00',
  'Playing on must add one match and extend the end time by one slot',
);
let completedTournament = reshuffledOpening;
while (true) {
  const current = completedTournament.matches.find(
    (match) => match.status === 'current',
  );
  if (!current) break;
  completedTournament = finishMatchWithScore(
    completedTournament,
    current.id,
    0,
    0,
  );
}
let extendedThreeTimes = completedTournament;
for (let index = 0; index < 3; index += 1) {
  extendedThreeTimes = extendTournamentByMatches(extendedThreeTimes, 1);
}
const overtimeMeetingCounts = meetingCounts(extendedThreeTimes.matches);
assert(
  extendedThreeTimes.matches.length === 18 &&
    extendedThreeTimes.matches.filter((match) => match.status === 'current')
      .length === 1 &&
    overtimeMeetingCounts.length === 6 &&
    overtimeMeetingCounts.every((count) => count === 3),
  'Adding three matches after a custom schedule must recommend the missing pairs and restore perfect balance',
);
const switchedCurrent = setMatchStatus(
  tournament,
  tournament.matches[3].id,
  'current',
);
assert(
  switchedCurrent.matches[0].status === 'upcoming' &&
    switchedCurrent.matches[3].status === 'current',
  'Starting a future match must not silently finish the previous live match',
);
assert(
  parseTournament(tournament) !== null,
  'A generated tournament must pass runtime validation',
);
assert(
  tournament.teams.every((team) =>
    team.players.every((player) => (player.positions?.length ?? 0) > 0),
  ),
  'Demo players must demonstrate one or more playable positions',
);
assert(
  tournament.teams.some((team) =>
    team.players.some((player) => player.positions?.includes('winger')),
  ),
  'Demo players must include the winger position',
);
const tacticMarkers = autoPlaceTeamMarkers({
  team: tournament.teams[0],
  isTeamA: true,
  playerCount: 6,
  formation: '1-3-2',
  goalkeeperId: tournament.teams[0].players[2].id,
});
assert(
  goalkeeperForTeam(tournament.teams[0])?.id ===
    tournament.teams[0].gkRotation[0],
  'Tactics Auto must use the first available player in the GK queue',
);
assert(
  tacticMarkers.length === 6 &&
    tacticMarkers[0].playerId === tournament.teams[0].players[2].id &&
    tacticMarkers[0].x === 50 &&
    tacticMarkers[0].y === 91 &&
    tacticMarkers.every((marker) => Boolean(marker.playerId)),
  'A formation must use the selected GK and only real players on the pitch',
);
assert(
  formationsForPlayerCount(5).length === 4 &&
    formationsForPlayerCount(6).length === 6 &&
    formationsForPlayerCount(7).length === 7 &&
    formationsForPlayerCount(7).includes('1-4-1-1'),
  'Each player count must expose the expanded formation choices',
);
assert(
  autoPlaceTeamMarkers({
    team: tournament.teams[0],
    isTeamA: true,
    playerCount: 7,
    formation: '1-4-1-1',
  }).length === 7,
  'Changing to seven players must immediately produce seven real player markers',
);
const allPlayersMarkedAbsent = {
  ...tournament.teams[0],
  players: tournament.teams[0].players.map((player) => ({
    ...player,
    absentToday: true,
  })),
};
assert(
  autoPlaceTeamMarkers({
    team: allPlayersMarkedAbsent,
    isTeamA: true,
    playerCount: 7,
    formation: '1-4-1-1',
  }).length === 7,
  'Tactics must fall back to the full roster instead of hiding an entire team',
);
const emptyTeamMarkers = autoPlaceTeamMarkers({
  team: { ...tournament.teams[0], players: [], gkRotation: [] },
  isTeamA: false,
  playerCount: 7,
  formation: '1-3-3',
});
assert(
  emptyTeamMarkers.length === 7 &&
    emptyTeamMarkers.every(
      (marker, index) =>
        marker.playerId === undefined && marker.label === `P${index + 1}`,
    ),
  'A team without a roster must keep seven numbered placeholders on the pitch',
);
const legacyPlayersWithoutPositions = {
  ...tournament,
  teams: tournament.teams.map((team) => ({
    ...team,
    players: team.players.map(({ positions: _positions, ...player }) => player),
  })),
};
assert(
  parseTournament(legacyPlayersWithoutPositions) !== null,
  'Persisted players created before position tags existed must remain valid',
);
const legacyGoalkeeperPosition = {
  ...tournament,
  teams: tournament.teams.map((team, teamIndex) => ({
    ...team,
    players: team.players.map((player, playerIndex) =>
      teamIndex === 0 && playerIndex === 0
        ? { ...player, positions: ['goalkeeper', 'defender'] }
        : player,
    ),
  })),
};
const migratedGoalkeeperPosition = parseTournament(legacyGoalkeeperPosition);
assert(
  migratedGoalkeeperPosition?.teams[0].players[0].positions?.join(',') ===
    'defender',
  'Legacy goalkeeper position tags must migrate to field positions without losing the game',
);
assert(
  parseTournament({
    ...tournament,
    teams: tournament.teams.map((team, teamIndex) => ({
      ...team,
      players: team.players.map((player, playerIndex) =>
        teamIndex === 0 && playerIndex === 0
          ? { ...player, positions: ['goalkeeper', 'goalkeeper'] }
          : player,
      ),
    })),
  }) === null,
  'Runtime validation must reject duplicate or malformed player positions',
);
assert(
  parseTournament({
    ...tournament,
    matches: [{ ...tournament.matches[0], teamAScore: 100, teamBScore: 0 }],
  }) === null,
  'Runtime validation must reject impossible persisted score values',
);
assert(
  parseTournament({
    ...tournament,
    matches: tournament.matches.map((match, index) =>
      index === 0
        ? {
            ...match,
            scorers: [
              {
                id: 'invalid-scorer',
                teamId: tournament.teams[2].id,
                playerName: 'Wrong team',
                goals: 1,
              },
            ],
          }
        : match,
    ),
  }) === null,
  'Runtime validation must reject scorer records from teams outside the match',
);
const persistedTactics = {
  teamAId: tournament.teams[0].id,
  teamBId: tournament.teams[1].id,
  matchId: tournament.matches[0].id,
  playerCount: 6 as const,
  teamAFormation: '1-3-2' as const,
  teamBFormation: 'auto' as const,
  teamAGkPlayerId: tournament.matches[0].teamAGkPlayerId,
  teamBGkPlayerId: tournament.matches[0].teamBGkPlayerId,
  markers: [
    {
      id: 'tactic-ball',
      kind: 'ball' as const,
      label: 'บอล',
      x: 50,
      y: 50,
    },
  ],
  notes: 'ทดสอบแผน',
  animationSteps: [
    {
      id: 'step-1',
      title: 'เริ่มต้น',
      markers: [
        {
          id: 'tactic-ball',
          kind: 'ball' as const,
          label: 'บอล',
          x: 50,
          y: 50,
        },
      ],
      paths: [
        {
          id: 'path-1',
          kind: 'pass' as const,
          from: { x: 50, y: 50 },
          to: { x: 60, y: 35 },
        },
      ],
    },
  ],
};
assert(
  parseTournament({
    ...tournament,
    teams: tournament.teams.map((team, index) => ({
      ...team,
      gkRotationLocked: index === 0,
    })),
    tactics: persistedTactics,
  }) !== null,
  'Runtime validation must accept the GK lock and animated tactics state',
);
const tacticsWithMissingPlayer = parseTournament({
  ...tournament,
  matches: tournament.matches.map((match, index) =>
    index === 0
      ? {
          ...match,
          status: 'current',
          teamAGkPlayerId: 'missing-player',
          scorers: [
            {
              id: 'legacy-scorer',
              teamId: match.teamAId,
              playerId: 'missing-player',
              playerName: 'อดีตผู้เล่น',
              goals: 1,
            },
          ],
        }
      : match,
  ),
  tactics: {
    ...persistedTactics,
    matchId: 'missing-match',
    markers: [
      ...persistedTactics.markers,
      {
        id: 'legacy-player-marker',
        kind: 'player' as const,
        teamId: tournament.teams[0].id,
        playerId: 'missing-player',
        label: 'อดีตผู้เล่น',
        x: 40,
        y: 70,
      },
    ],
  },
});
assert(
  tacticsWithMissingPlayer?.matches[0].teamAGkPlayerId === undefined &&
    tacticsWithMissingPlayer?.matches[0].scorers?.[0].playerId === undefined &&
    tacticsWithMissingPlayer?.matches[0].scorers?.[0].playerName ===
      'อดีตผู้เล่น' &&
    tacticsWithMissingPlayer?.tactics?.matchId === undefined &&
    tacticsWithMissingPlayer?.tactics?.markers[1].playerId === undefined,
  'Runtime validation must repair stale player references without losing historical names',
);
assert(
  parseTournament({
    ...tournament,
    tactics: {
      ...persistedTactics,
      markers: [
        persistedTactics.markers[0],
        { ...persistedTactics.markers[0] },
      ],
    },
  }) === null,
  'Runtime validation must reject duplicate tactic markers and multiple balls',
);
assert(
  parseTournament({
    ...tournament,
    tactics: {
      ...persistedTactics,
      animationSteps: [
        {
          ...persistedTactics.animationSteps[0],
          paths: [
            {
              ...persistedTactics.animationSteps[0].paths[0],
              to: { x: 101, y: 35 },
            },
          ],
        },
      ],
    },
  }) === null,
  'Runtime validation must reject tactic paths outside the pitch',
);

assert(
  syncRetryDelayMs(0) === 3500 &&
    syncRetryDelayMs(1) === 7000 &&
    syncRetryDelayMs(8) === MAX_SYNC_RETRY_MS,
  'Sync retries must back off and stop increasing after the maximum delay',
);
const inFlightState = { score: 0 };
const currentState = { score: 2 };
const queuedState = { score: 3 };
assert(
  newestPendingState(inFlightState, queuedState, currentState) ===
    queuedState &&
    newestPendingState(inFlightState, null, currentState) === currentState,
  'A failed save must keep the newest queued or current state instead of restoring the stale in-flight state',
);

console.log(
  'Engine checks passed: defaults, 2-8 team pairing coverage, recommendations, balanced overtime, opening pairs, future reshuffling, player positions, formations, live-score and scorer drafts, Top 3, standings, GK fairness, progress, switching, sync backoff, and persisted-state validation.',
);
