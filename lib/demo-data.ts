import {
  createPlayer,
  createTournament,
  makeId,
  shuffle,
} from './football-engine';
import type { Team, TeamColor, Tournament } from './football-types';

const rosters = [
  ['Bank', 'Jack', 'Tom', 'Tum', 'Game', 'First', 'Ball'],
  ['Nut', 'Pete', 'Aof', 'Win', 'Art', 'Boy', 'Non'],
  ['Arm', 'Joe', 'Max', 'Tee', 'Mix', 'Top', 'Beam'],
  ['Ton', 'Nine', 'Golf', 'Ice', 'Ken', 'Pond', 'James'],
  ['First', 'M', 'New', 'Ohm', 'Palm', 'Q', 'Ray'],
  ['Ball', 'Boss', 'Champ', 'Dew', 'Earth', 'Film', 'Gun'],
];

const names = ['Green', 'Red', 'Blue', 'Yellow', 'White', 'Black'];
const colors: TeamColor[] = [
  'green',
  'red',
  'blue',
  'yellow',
  'white',
  'black',
];

export function makeTeam(
  name: string,
  color: TeamColor,
  playerNames: string[] = [],
): Team {
  const players = playerNames.map(createPlayer);
  const rotation = shuffle(players.map((player) => player.id));
  return {
    id: makeId('team'),
    name,
    color,
    players,
    gkRotation: rotation,
    gkCycleOrders: rotation.length ? [rotation] : [],
  };
}

export function createDemoTournament(): Tournament {
  const teams = names
    .slice(0, 4)
    .map((name, index) => makeTeam(name, colors[index], rosters[index]));
  return createTournament({
    name: 'Friendly Match',
    teams,
    matchDurationMinutes: 10,
    breakDurationMinutes: 2,
    startTime: '19:00',
    availableTimeMinutes: 180,
  });
}
