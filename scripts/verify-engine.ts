import { createDemoTournament } from '../lib/demo-data';
import { assignGoalkeepers, scheduleMetrics, setMatchStatus, skipGoalkeeper } from '../lib/football-engine';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const tournament = createDemoTournament();
assert(tournament.matches.length === 15, 'Six teams must create 15 matches');
assert(tournament.matches.filter((match) => match.status === 'current').length === 1, 'Exactly one match starts current');

const pairKeys = tournament.matches.map((match) => [match.teamAId, match.teamBId].sort().join(':'));
assert(new Set(pairKeys).size === 15, 'Every pair must appear exactly once');

for (const team of tournament.teams) {
  const teamMatches = tournament.matches.filter((match) => match.teamAId === team.id || match.teamBId === team.id);
  assert(teamMatches.length === 5, `${team.name} must play five matches`);
  const goalkeeperIds = teamMatches.map((match) => match.teamAId === team.id ? match.teamAGkPlayerId : match.teamBGkPlayerId);
  assert(new Set(goalkeeperIds).size === goalkeeperIds.length, `${team.name} must not repeat a GK before the cycle completes`);
}

for (let index = 1; index < tournament.matches.length; index += 1) {
  const previous = tournament.matches[index - 1];
  const current = tournament.matches[index];
  const overlap = [previous.teamAId, previous.teamBId].some((id) => id === current.teamAId || id === current.teamBId);
  assert(!overlap, `Match ${current.matchNumber} should not force a team to play consecutively`);
}

const metrics = scheduleMetrics(6, 10, 2, '18:00');
assert(metrics.matchCount === 15 && metrics.requiredMinutes === 180 && metrics.endTime === '21:00', 'Time calculation must match the V1 example');

const first = tournament.matches[0];
const firstTeam = tournament.teams.find((team) => team.id === first.teamAId)!;
const originalGk = first.teamAGkPlayerId;
const absentTeams = tournament.teams.map((team) => team.id === firstTeam.id ? { ...team, players: team.players.map((player) => player.id === originalGk ? { ...player, absentToday: true } : player) } : team);
const afterAbsent = assignGoalkeepers({ ...tournament, teams: absentTeams });
assert(afterAbsent.matches[0].teamAGkPlayerId !== originalGk, 'Absent player must be removed from today\'s GK rotation');

const beforeSkip = afterAbsent.matches[0].teamAGkPlayerId;
const afterSkip = skipGoalkeeper(afterAbsent, afterAbsent.matches[0].id, firstTeam.id);
assert(afterSkip.matches[0].teamAGkPlayerId !== beforeSkip, 'Skipping GK must advance the queue');

const afterFinish = setMatchStatus(afterSkip, afterSkip.matches[0].id, 'finished');
assert(afterFinish.matches[0].status === 'finished' && afterFinish.matches[1].status === 'current', 'Finishing a match must advance the live match');

console.log('Engine checks passed: round robin, rest order, time, GK fairness, absence, skip, and progress.');
