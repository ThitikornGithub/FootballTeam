import type { Match, Tournament } from './football-types';

export const INITIAL_SYNC_RETRY_MS = 3500;
export const MAX_SYNC_RETRY_MS = 30000;

export function syncRetryDelayMs(attempt: number) {
  return Math.min(
    MAX_SYNC_RETRY_MS,
    INITIAL_SYNC_RETRY_MS * 2 ** Math.max(0, attempt),
  );
}

// Postgres jsonb stores object keys in its own order, so a game read back from
// the database serializes differently from the same game built in the app.
// Compare through this whenever the question is "is this the same data".
export function canonicalJson(value: unknown) {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([first], [second]) =>
            first < second ? -1 : first > second ? 1 : 0,
          ),
        )
      : item,
  );
}

export function newestPendingState<T>(
  inFlightState: T,
  queuedState: T | null,
  currentState: T | null,
) {
  return queuedState ?? currentState ?? inFlightState;
}

// The synced copy a phone's unsent edits were made on: the revision it had and
// that copy as canonicalJson. Kept with the offline backup, so a later session
// can tell "nobody else saved since" from "someone else saved first".
export type SyncBase = { revision: number; state: string };

export type UnsavedChange = { title: string; detail: string };

function resultLabel(match: Match) {
  const score =
    match.teamAScore === undefined || match.teamBScore === undefined
      ? 'ยังไม่มีสกอร์'
      : `${match.teamAScore}-${match.teamBScore}`;
  const status =
    match.status === 'finished'
      ? ' จบแล้ว'
      : match.status === 'current'
        ? ' กำลังแข่ง'
        : ' ยังไม่เริ่ม';
  return `${score}${status}`;
}

function hasResult(match: Match) {
  return (
    match.status === 'finished' ||
    match.teamAScore !== undefined ||
    Boolean(match.scorers?.length)
  );
}

function scorersLabel(match: Match) {
  return (match.scorers ?? [])
    .map((scorer) => `${scorer.playerName} ${scorer.goals}`)
    .join(', ');
}

// Scorer ids are random per phone, so two phones entering the same goal
// compare by who scored rather than by id. Goalkeepers follow from the match
// status and are left out, or finishing a match would read as two changes.
function resultKey(match: Match | undefined) {
  if (!match) return '';
  return canonicalJson([
    match.teamAScore ?? null,
    match.teamBScore ?? null,
    match.status,
    (match.scorers ?? []).map((scorer) => [
      scorer.teamId,
      scorer.playerId ?? null,
      scorer.playerName,
      scorer.goals,
    ]),
  ]);
}

// What this phone changed that the database does not hold, in terms the group
// can act on: which match, what this phone had, and what everyone sees now.
// Only changes made on this phone are listed. A goal someone else entered is
// not something this phone lost, and listing it would invite entering it twice.
// Without a base (an older backup) every difference is listed.
export function describeUnsavedChanges(
  local: Tournament,
  remote: Tournament,
  base: Tournament | null,
): UnsavedChange[] {
  const teamName = (teamId: string) =>
    local.teams.find((team) => team.id === teamId)?.name ??
    remote.teams.find((team) => team.id === teamId)?.name ??
    'ทีม';
  const changes: UnsavedChange[] = [];
  for (const match of local.matches) {
    const mine = resultKey(match);
    const before = base?.matches.find((item) => item.id === match.id);
    const latest = remote.matches.find((item) => item.id === match.id);
    if (!latest || resultKey(latest) === mine) continue;
    if (base && resultKey(before) === mine) continue;
    // Finishing a match also makes the next one live. With no score on
    // either side there is nothing to enter again, so it is not worth a line.
    if (!hasResult(match) && !hasResult(latest)) continue;
    const scorers = scorersLabel(match);
    changes.push({
      title: `Match ${match.matchNumber} · ${teamName(match.teamAId)} vs ${teamName(match.teamBId)}`,
      detail: `เครื่องนี้ ${resultLabel(match)}${scorers && scorers !== scorersLabel(latest) ? ` (ยิง: ${scorers})` : ''} · ล่าสุด ${resultLabel(latest)}`,
    });
  }
  const changed = (pick: (tournament: Tournament) => unknown) => {
    const mine = canonicalJson(pick(local));
    return (
      mine !== canonicalJson(pick(remote)) &&
      (!base || mine !== canonicalJson(pick(base)))
    );
  };
  const other: string[] = [];
  if (
    changed((tournament) =>
      tournament.teams.map((team) => [
        team.id,
        team.name,
        team.color,
        team.players,
        team.gkRotation,
        team.gkRotationLocked ?? false,
      ]),
    )
  )
    other.push('ผู้เล่น ทีม หรือคิว GK');
  if (
    changed((tournament) => [
      tournament.name,
      tournament.matchDurationMinutes,
      tournament.breakDurationMinutes,
      tournament.startTime,
      tournament.availableTimeMinutes,
      tournament.matches.map((match) => [
        match.id,
        match.teamAId,
        match.teamBId,
      ]),
    ])
  )
    other.push('การตั้งค่าหรือลำดับแมตช์');
  if (changed((tournament) => tournament.tactics ?? null))
    other.push('กระดานแท็กติก');
  if (changed((tournament) => tournament.closedAt ?? null))
    other.push(local.closedAt ? 'การกดจบเกมวันนี้' : 'การเปิดเกมต่อ');
  if (other.length)
    changes.push({ title: 'การแก้ไขอื่น', detail: other.join(', ') });
  return changes;
}
