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
