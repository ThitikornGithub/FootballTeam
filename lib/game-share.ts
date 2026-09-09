import type { Tournament } from '@/lib/football-types';

export const GAME_SHARE_ORIGIN =
  process.env.NEXT_PUBLIC_SHARE_SITE_URL ??
  'https://football-match-maker.b-thitikorn.chatgpt.site';

const GAME_ID_DATE_PATTERN = /^game(\d{4})(\d{2})(\d{2})-\d+$/;
const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
] as const;

export function gameShareUrl(gameId: string) {
  return `${GAME_SHARE_ORIGIN}/${encodeURIComponent(gameId)}`;
}

export function gameDateLabel(gameId: string, tournament?: Tournament) {
  const match = GAME_ID_DATE_PATTERN.exec(gameId);
  if (match) {
    const month = Number(match[2]);
    if (month >= 1 && month <= 12)
      return `${Number(match[3])} ${THAI_MONTHS[month - 1]} ${match[1]}`;
  }

  const createdAt = tournament?.createdAt;
  if (!createdAt) return 'วันแข่งขัน';
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'วันแข่งขัน';
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function gameShareDescription(gameId: string, tournament: Tournament) {
  const teamCount = tournament.teams.length;
  const matchCount = tournament.matches.length;
  return `${gameDateLabel(gameId, tournament)} • ${tournament.startTime} น. • ${teamCount} ทีม • ${matchCount} แมตช์`;
}

export const TEAM_COLOR_HEX: Record<string, string> = {
  green: '#16c965',
  red: '#ff3341',
  blue: '#246bff',
  yellow: '#ffd21f',
  white: '#f8fafc',
  black: '#171c25',
  orange: '#ff8a1f',
  purple: '#9b5cff',
};
