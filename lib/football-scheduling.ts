type Fixture = { teamAId: string; teamBId: string };

type Plan = {
  order: number[];
  meetings: number[];
  played: number[];
  lastPlayed: number[];
  lastMeeting: number[];
  consecutive: number[];
  backToBack: number[];
  longRests: number[];
  triples: number;
  quickRematches: number;
  restDifference: number;
  longestRest: number;
  rank: number[];
};

function comparePlans(a: Plan, b: Plan) {
  for (let index = 0; index < a.rank.length; index += 1) {
    const difference = a.rank[index] - b.rank[index];
    if (difference) return difference;
  }
  // Stable sorting preserves the canonical pair order for equal-quality plans.
  return 0;
}

function spread(values: number[]) {
  return Math.max(...values) - Math.min(...values);
}

function squares(values: number[]) {
  return values.reduce((total, value) => total + value * value, 0);
}

/**
 * Method B: bounded beam search over the complete remaining schedule. It
 * compares cumulative burdens, not just the teams in the very next match.
 * Pair coverage is a hard constraint; hand-picked/fixed matches are history,
 * so an impossible manual override is repaired going forward, never rewritten.
 * This is a deterministic heuristic, not a proof of global optimality.
 */
export function balancedPairOrder(
  teamIds: string[],
  fixtures: Fixture[],
  history: Fixture[],
  matchCount: number,
): number[] {
  if (!fixtures.length || matchCount <= 0) return [];
  const teamIndex = new Map(teamIds.map((id, index) => [id, index]));
  const key = (a: string, b: string) => [a, b].sort().join(':');
  const fixtureIndex = new Map(
    fixtures.map((fixture, index) => [
      key(fixture.teamAId, fixture.teamBId),
      index,
    ]),
  );
  const teams = fixtures.map((fixture) => [
    teamIndex.get(fixture.teamAId)!,
    teamIndex.get(fixture.teamBId)!,
  ]);
  // Six-slot separation forces the same six-match cycle forever for four
  // teams. Allow four slots so subsequent sets can share the resting burden.
  const minimumSeparation = Math.min(
    fixtures.length,
    teamIds.length === 4 ? 4 : 6,
  );
  const initial: Plan = {
    order: [],
    meetings: fixtures.map(() => 0),
    played: teamIds.map(() => 0),
    lastPlayed: teamIds.map(() => -1),
    lastMeeting: fixtures.map(() => -1),
    consecutive: teamIds.map(() => 0),
    backToBack: teamIds.map(() => 0),
    longRests: teamIds.map(() => 0),
    triples: 0,
    quickRematches: 0,
    restDifference: 0,
    longestRest: 0,
    rank: [],
  };

  function record(plan: Plan, pairIndex: number, slot: number) {
    const [a, b] = teams[pairIndex];
    const lastMeeting = plan.lastMeeting[pairIndex];
    if (lastMeeting >= 0)
      plan.quickRematches += Math.max(
        0,
        minimumSeparation - (slot - lastMeeting),
      );
    if (plan.lastPlayed[a] >= 0 && plan.lastPlayed[b] >= 0)
      plan.restDifference += Math.abs(plan.lastPlayed[a] - plan.lastPlayed[b]);
    for (const team of [a, b]) {
      const last = plan.lastPlayed[team];
      const rest = last < 0 ? undefined : slot - last - 1;
      if (rest === 0) {
        plan.backToBack[team] += 1;
        plan.consecutive[team] += 1;
      } else plan.consecutive[team] = 1;
      if (plan.consecutive[team] > 2) plan.triples += 1;
      if (rest !== undefined) {
        plan.longestRest = Math.max(plan.longestRest, rest);
        // The normal interval is roughly half the number of teams. Count
        // excess waiting as a burden and spread it across teams as well.
        plan.longRests[team] += Math.max(
          0,
          rest - Math.max(1, Math.floor(teamIds.length / 2) - 1),
        );
      }
      plan.played[team] += 1;
      plan.lastPlayed[team] = slot;
    }
    plan.meetings[pairIndex] += 1;
    plan.lastMeeting[pairIndex] = slot;
    plan.rank = [
      plan.triples,
      plan.quickRematches,
      spread(plan.played),
      squares(plan.played),
      Math.max(...plan.backToBack),
      squares(plan.backToBack),
      plan.longestRest,
      Math.max(...plan.longRests),
      squares(plan.longRests),
      plan.restDifference,
    ];
  }

  let fixedCount = 0;
  for (const fixture of history) {
    const index = fixtureIndex.get(key(fixture.teamAId, fixture.teamBId));
    if (index !== undefined) record(initial, index, fixedCount++);
  }

  // Small phone-friendly search budget. Long all-day schedules still inspect
  // the full horizon, with fewer alternatives; no factorial enumeration.
  const beamWidth = matchCount > 96 ? 12 : teamIds.length <= 4 ? 96 : 24;
  let beam = [initial];
  for (let offset = 0; offset < matchCount; offset += 1) {
    const candidates: Plan[] = [];
    for (const plan of beam) {
      const leastMeetings = Math.min(...plan.meetings);
      for (let pairIndex = 0; pairIndex < fixtures.length; pairIndex += 1) {
        if (plan.meetings[pairIndex] !== leastMeetings) continue;
        const next: Plan = {
          ...plan,
          order: [...plan.order, pairIndex],
          meetings: [...plan.meetings],
          played: [...plan.played],
          lastPlayed: [...plan.lastPlayed],
          lastMeeting: [...plan.lastMeeting],
          consecutive: [...plan.consecutive],
          backToBack: [...plan.backToBack],
          longRests: [...plan.longRests],
          rank: [],
        };
        record(next, pairIndex, fixedCount + offset);
        candidates.push(next);
      }
    }
    candidates.sort(comparePlans);
    beam = candidates.slice(0, beamWidth);
  }
  return beam[0]?.order ?? [];
}
