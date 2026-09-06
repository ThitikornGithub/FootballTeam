export const TEAM_COLORS = [
  'green',
  'red',
  'blue',
  'yellow',
  'white',
  'black',
  'orange',
  'purple',
] as const;

export type TeamColor = (typeof TEAM_COLORS)[number];

export type Player = {
  id: string;
  name: string;
  absentToday: boolean;
};

export type Team = {
  id: string;
  name: string;
  color: TeamColor;
  players: Player[];
  gkRotation: string[];
  gkCycleOrders: string[][];
  gkRotationLocked?: boolean;
};

export type MatchStatus = 'upcoming' | 'current' | 'finished';

export type Match = {
  id: string;
  matchNumber: number;
  roundNumber: number;
  teamAId: string;
  teamBId: string;
  startTime: string;
  teamAScore?: number;
  teamBScore?: number;
  teamAGkPlayerId?: string;
  teamBGkPlayerId?: string;
  status: MatchStatus;
};

export type TacticMarker = {
  id: string;
  kind: 'player' | 'ball';
  teamId?: string;
  playerId?: string;
  label: string;
  x: number;
  y: number;
};

export type TacticPath = {
  id: string;
  kind: 'run' | 'pass';
  from: { x: number; y: number };
  to: { x: number; y: number };
};

export type TacticStep = {
  id: string;
  title: string;
  markers: TacticMarker[];
  paths: TacticPath[];
};

export type TacticsBoard = {
  teamAId: string;
  teamBId: string;
  markers: TacticMarker[];
  notes: string;
  animationSteps?: TacticStep[];
};

export type Tournament = {
  id: string;
  name: string;
  teams: Team[];
  numberOfFields: 1;
  matchDurationMinutes: number;
  breakDurationMinutes: number;
  startTime: string;
  availableTimeMinutes: number;
  matches: Match[];
  tactics?: TacticsBoard;
  createdAt: string;
};

export type TeamDraft = Pick<Team, 'name' | 'color'>;

export type ScheduleConfig = {
  name: string;
  teams: Team[];
  firstMatchTeamIds?: [string, string];
  matchDurationMinutes: number;
  breakDurationMinutes: number;
  startTime: string;
  availableTimeMinutes: number;
};
