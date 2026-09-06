import { COLOR_HEX } from '@/components/football/shared';
import { addMinutes, calculateStandings } from '@/lib/football-engine';
import type { TeamColor, Tournament } from '@/lib/football-types';

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const corner = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + corner, y);
  context.arcTo(x + width, y, x + width, y + height, corner);
  context.arcTo(x + width, y + height, x, y + height, corner);
  context.arcTo(x, y + height, x, y, corner);
  context.arcTo(x, y, x + width, y, corner);
  context.closePath();
}

function fillRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string,
) {
  roundedRect(context, x, y, width, height, radius);
  context.fillStyle = color;
  context.fill();
}

function fitText(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
) {
  if (context.measureText(value).width <= maxWidth) return value;
  let next = value;
  while (next.length > 1 && context.measureText(`${next}…`).width > maxWidth) {
    next = next.slice(0, -1);
  }
  return `${next}…`;
}

function drawTeamShirt(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  size: number,
  color: TeamColor,
) {
  const scale = size / 64;
  const left = centerX - size / 2;
  const top = centerY - size / 2;
  context.save();
  context.translate(left, top);
  context.scale(scale, scale);
  context.beginPath();
  context.moveTo(22, 7);
  context.lineTo(10, 12);
  context.lineTo(3, 26);
  context.lineTo(13, 31);
  context.lineTo(18, 23);
  context.lineTo(18, 57);
  context.lineTo(46, 57);
  context.lineTo(46, 23);
  context.lineTo(51, 31);
  context.lineTo(61, 26);
  context.lineTo(54, 12);
  context.lineTo(42, 7);
  context.bezierCurveTo(40, 12, 24, 12, 22, 7);
  context.closePath();
  context.fillStyle = COLOR_HEX[color];
  context.fill();
  context.strokeStyle = color === 'white' ? '#94a3b8' : '#ffffff';
  context.lineWidth = 1.8;
  context.lineJoin = 'round';
  context.stroke();
  context.restore();
}

function formatThaiDate(isoDate: string) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('th-TH', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function scheduledEndTime(tournament: Tournament) {
  const lastMatch = tournament.matches.at(-1);
  return lastMatch
    ? addMinutes(lastMatch.startTime, tournament.matchDurationMinutes)
    : tournament.startTime;
}

export function shareCardFilename(tournament: Tournament) {
  const safeName = tournament.name
    .trim()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `${safeName || 'football'}-standings.png`;
}

export function renderStandingsShareCard(
  canvas: HTMLCanvasElement,
  tournament: Tournament,
) {
  const context = canvas.getContext('2d');
  if (!context) return;

  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const standings = calculateStandings(tournament);
  const finishedCount = tournament.matches.filter(
    (match) => match.status === 'finished',
  ).length;
  const allFinished =
    tournament.matches.length > 0 &&
    finishedCount === tournament.matches.length;
  const leader = standings[0];
  const leaderTeam = tournament.teams.find(
    (team) => team.id === leader?.teamId,
  );
  const fontFamily = 'Tahoma, Thonburi, system-ui, sans-serif';

  context.fillStyle = '#f4f8f5';
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  context.fillStyle = '#11823b';
  context.font = `800 31px ${fontFamily}`;
  context.fillText('⚽  FOOTBALL MATCH MAKER', 66, 76);
  context.fillStyle = '#071120';
  context.font = `900 62px ${fontFamily}`;
  context.fillText(
    allFinished ? 'สรุปผลการแข่งขัน' : 'สถานะการแข่งขันล่าสุด',
    66,
    151,
  );
  context.fillStyle = '#071120';
  context.font = `900 38px ${fontFamily}`;
  context.fillText(fitText(context, tournament.name, 948), 66, 211);
  context.fillStyle = '#73819a';
  context.font = `700 27px ${fontFamily}`;
  const dateText = formatThaiDate(tournament.createdAt);
  const timeText = `${tournament.startTime}–${scheduledEndTime(tournament)}`;
  context.fillText(`${dateText}${dateText ? ' · ' : ''}${timeText}`, 66, 257);

  fillRoundedRect(context, 54, 300, 972, 145, 34, '#0f8d40');
  context.fillStyle = '#ffffff';
  context.font = `700 25px ${fontFamily}`;
  context.fillText(allFinished ? 'อันดับหนึ่งของคืนนี้' : 'ผู้นำตารางตอนนี้', 88, 352);
  context.font = `900 47px ${fontFamily}`;
  const leaderText = leaderTeam
    ? `${leaderTeam.name} ${allFinished ? 'คว้าอันดับ 1' : 'นำอันดับ 1'}`
    : 'ยังไม่มีผลการแข่งขัน';
  context.fillText(fitText(context, leaderText, 850), 88, 410);
  if (leaderTeam) {
    drawTeamShirt(context, 954, 373, 58, leaderTeam.color);
  }

  const tableX = 54;
  const tableY = 475;
  const tableWidth = 972;
  const headerHeight = 72;
  const maxRowsHeight = 560;
  const rowHeight = Math.min(
    102,
    Math.max(61, maxRowsHeight / Math.max(standings.length, 1)),
  );
  const tableHeight = headerHeight + rowHeight * standings.length;
  fillRoundedRect(
    context,
    tableX,
    tableY,
    tableWidth,
    tableHeight,
    30,
    '#ffffff',
  );
  context.save();
  roundedRect(context, tableX, tableY, tableWidth, tableHeight, 30);
  context.clip();
  context.fillStyle = '#e5f5e9';
  context.fillRect(tableX, tableY, tableWidth, headerHeight);
  context.restore();

  const columns = {
    rank: 87,
    team: 151,
    played: 563,
    won: 654,
    drawn: 733,
    lost: 812,
    difference: 900,
    points: 987,
  };
  context.font = `800 22px ${fontFamily}`;
  context.fillStyle = '#087632';
  context.textAlign = 'left';
  context.fillText('#', columns.rank, tableY + 45);
  context.fillText('ทีม', columns.team, tableY + 45);
  context.textAlign = 'center';
  context.fillText('แข่ง', columns.played, tableY + 45);
  context.fillText('ช', columns.won, tableY + 45);
  context.fillText('ส', columns.drawn, tableY + 45);
  context.fillText('พ', columns.lost, tableY + 45);
  context.fillText('+/-', columns.difference, tableY + 45);
  context.fillText('แต้ม', columns.points, tableY + 45);

  standings.forEach((standing, index) => {
    const team = tournament.teams.find((item) => item.id === standing.teamId);
    if (!team) return;
    const top = tableY + headerHeight + rowHeight * index;
    const center = top + rowHeight / 2;
    if (index > 0) {
      context.strokeStyle = '#e8edf0';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(tableX + 30, top);
      context.lineTo(tableX + tableWidth - 30, top);
      context.stroke();
    }
    context.textBaseline = 'middle';
    context.font = `900 ${rowHeight < 76 ? 24 : 28}px ${fontFamily}`;
    context.fillStyle = index === 0 ? '#11823b' : '#718096';
    context.textAlign = 'center';
    context.fillText(String(index + 1), columns.rank, center);

    drawTeamShirt(context, 132, center, rowHeight < 76 ? 30 : 36, team.color);

    context.fillStyle = '#071120';
    context.textAlign = 'left';
    context.font = `900 ${rowHeight < 76 ? 25 : 29}px ${fontFamily}`;
    context.fillText(fitText(context, team.name, 325), columns.team, center);
    context.textAlign = 'center';
    context.font = `800 ${rowHeight < 76 ? 23 : 27}px ${fontFamily}`;
    context.fillText(String(standing.played), columns.played, center);
    context.fillText(String(standing.won), columns.won, center);
    context.fillText(String(standing.drawn), columns.drawn, center);
    context.fillText(String(standing.lost), columns.lost, center);
    context.fillText(
      `${standing.goalDifference > 0 ? '+' : ''}${standing.goalDifference}`,
      columns.difference,
      center,
    );
    context.fillStyle = '#087632';
    context.font = `900 ${rowHeight < 76 ? 26 : 31}px ${fontFamily}`;
    context.fillText(String(standing.points), columns.points, center);
    context.textBaseline = 'alphabetic';
  });

  const summaryY = Math.min(1138, tableY + tableHeight + 34);
  fillRoundedRect(context, 54, summaryY, 972, 92, 26, '#e5f5e9');
  context.fillStyle = '#087632';
  context.font = `800 27px ${fontFamily}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(
    `แข่งแล้ว ${finishedCount}/${tournament.matches.length} แมตช์  ·  ตารางถึง ${scheduledEndTime(tournament)}`,
    CARD_WIDTH / 2,
    summaryY + 47,
  );

  context.fillStyle = '#758198';
  context.font = `700 24px ${fontFamily}`;
  context.fillText(
    'ชนะ 3 แต้ม · เสมอ 1 แต้ม · แชร์จาก Football Match Maker',
    CARD_WIDTH / 2,
    1282,
  );
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
}

export function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('ไม่สามารถสร้างรูปภาพได้'));
    }, 'image/png');
  });
}

export function downloadShareCard(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
