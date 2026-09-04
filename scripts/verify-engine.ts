import { createDemoTournament } from '../lib/demo-data';
import {
  assignGoalkeepers,
  calculateStandings,
  extendTournamentByMatches,
  extendTournamentToEndTime,
  finishMatchWithScore,
  minutesBetween,
  scheduleMetrics,
  scheduleWindowMetrics,
  skipGoalkeeper,
} from '../lib/football-engine';

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

const afterFinish = finishMatchWithScore(
  afterSkip,
  afterSkip.matches[0].id,
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
const continuedTournament = extendTournamentByMatches(afterFinish, 1);
assert(
  continuedTournament.matches.length === 16 &&
    continuedTournament.availableTimeMinutes === 192 &&
    continuedTournament.matches.at(-1)?.startTime === '22:00',
  'Playing on must add one match and extend the end time by one slot',
);

console.log(
  'Engine checks passed: defaults, repeats, scores, standings, overtime, GK fairness, and progress.',
);
