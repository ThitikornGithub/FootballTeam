import type { Team, TeamColor } from './football-types';

export const TEAM_COLOR_NAMES: Record<TeamColor, string> = {
  green: 'Green',
  red: 'Red',
  blue: 'Blue',
  yellow: 'Yellow',
  white: 'White',
  black: 'Black',
  orange: 'Orange',
  purple: 'Purple',
};

// This version identifies teams by shirt color, not editable names. Keep
// legacy stored names intact while showing one short English color name.
export function teamNameForDisplay(team: Pick<Team, 'color'>): string {
  return TEAM_COLOR_NAMES[team.color];
}

// Teams are named by their shirt colour here, so two teams must never share
// one: the table would show the same name twice. Picking a colour another
// team wears hands that team the colour this one is leaving.
export function withSwappedTeamColor<T extends { color: TeamColor }>(
  teams: T[],
  index: number,
  color: TeamColor,
): T[] {
  const previous = teams[index]?.color;
  if (!previous || previous === color) return teams;
  return teams.map((team, position) =>
    position === index
      ? { ...team, color }
      : team.color === color
        ? { ...team, color: previous }
        : team,
  );
}
