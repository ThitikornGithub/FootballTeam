import { createDemoTournament } from '../lib/demo-data';
import {
  assignGoalkeepers,
  calculateStandings,
  extendTournamentByMatches,
  extendTournamentToEndTime,
  finishMatchWithScore,
  minutesBetween,
  reopenFinishedMatch,
  reshuffleUpcomingMatches,
  scheduleMetrics,
  scheduleWindowMetrics,
  setMatchScore,
  setMatchStatus,
  skipGoalkeeper,
  updateTournamentSettings,
} from '../lib/football-engine';
import { parseTournament } from '../lib/football-schema';
import {
  MAX_SYNC_RETRY_MS,
  newestPendingState,
  syncRetryDelayMs,
} from '../lib/football-sync';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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
    minutesBetween('22:00', '18:00') === 0,
  'End-time selection must calculate the available same-day window',
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

const afterFinish = finishMatchWithScore(
  liveScoreDraft,
  liveScoreDraft.matches[0].id,
  3,
  1,
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
const reshuffledFutureCycle = reshuffledAfterStart.matches
  .slice(2, 8)
  .map((match) => [match.teamAId, match.teamBId].sort().join(':'));
assert(
  new Set(reshuffledFutureCycle).size === 6,
  'The reshuffled future cycle must still contain every four-team pairing',
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
const persistedTactics = {
  teamAId: tournament.teams[0].id,
  teamBId: tournament.teams[1].id,
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
  'Engine checks passed: defaults, repeats, opening pairs, future reshuffling, player positions, live-score drafts, standings, overtime, GK fairness, progress, switching, sync backoff, and persisted-state validation.',
);
