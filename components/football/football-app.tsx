'use client';

import {
  CalendarDays,
  CalendarRange,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  Cloud,
  CloudOff,
  Copy,
  Download,
  FolderOpen,
  GripVertical,
  LoaderCircle,
  Minus,
  Plus,
  RotateCcw,
  Save,
  Share2,
  Shield,
  Shuffle,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  BottomNavigation,
  COLOR_HEX,
  COLOR_LABEL,
  type MainView,
  NumberStepper,
  PageHeader,
  TeamBadge,
  TeamShirtIcon,
} from './shared';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { createDemoTournament, makeTeam } from '@/lib/demo-data';
import {
  addMinutes,
  assignGoalkeepers,
  calculateStandings,
  createPlayer,
  createTournament,
  extendTournamentByMatches,
  extendTournamentToEndTime,
  finishMatchWithScore,
  minutesBetween,
  prioritizeUpcomingMatches,
  reopenFinishedMatch,
  reorder,
  scheduleMetrics,
  scheduleWindowMetrics,
  setMatchScore,
  setMatchStatus,
  shuffle,
  updateTournamentSettings,
} from '@/lib/football-engine';
import {
  TEAM_COLORS,
  type Match,
  type Team,
  type TeamColor,
  type Tournament,
} from '@/lib/football-types';
import {
  canvasToPngBlob,
  downloadShareCard,
  renderStandingsShareCard,
  scheduledEndTime,
  shareCardFilename,
} from '@/lib/standings-share-card';
import {
  createSharedGame,
  deleteSharedGame,
  type FootballGameSummary,
  listSharedGames,
  loadSharedGame,
  saveSharedGame,
} from '@/lib/football-data-api';
import { TacticsScreen } from './tactics-board';

const STORAGE_KEY = 'football-match-maker-v1';
const STORAGE_GAME_ID_KEY = 'football-match-maker-game-id';
const PAGES_PATH_KEY = 'football-pages-path';
const GAME_ID_PATTERN = /^game\d{8}-[1-9]\d*$/;
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
type AppView =
  | MainView
  | 'setup'
  | 'team-detail'
  | 'match-detail'
  | 'standings'
  | 'share'
  | 'games';
type SyncStatus = 'local' | 'saving' | 'saved' | 'error';

function readLocalBackup() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return {
      tournament: stored ? (JSON.parse(stored) as Tournament) : null,
      gameId: localStorage.getItem(STORAGE_GAME_ID_KEY),
    };
  } catch {
    return { tournament: null, gameId: null };
  }
}

function writeLocalBackup(tournament: Tournament, gameId = '') {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tournament));
    if (gameId) localStorage.setItem(STORAGE_GAME_ID_KEY, gameId);
    else localStorage.removeItem(STORAGE_GAME_ID_KEY);
  } catch {
    // Neon remains the source of truth when browser storage is unavailable.
  }
}

function clearLocalBackup() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_GAME_ID_KEY);
  } catch {
    // Browser storage is only a best-effort offline backup.
  }
}

function restoreGitHubPagesPath() {
  try {
    const restoredPath = sessionStorage.getItem(PAGES_PATH_KEY);
    if (!restoredPath) return;
    sessionStorage.removeItem(PAGES_PATH_KEY);
    window.history.replaceState({}, '', restoredPath);
  } catch {
    // Continue at the root route when storage is unavailable.
  }
}

function gameIdFromPath() {
  const path = window.location.pathname;
  const relativePath =
    BASE_PATH && path.startsWith(BASE_PATH) ? path.slice(BASE_PATH.length) : path;
  const candidate = relativePath.split('/').filter(Boolean)[0] ?? '';
  return GAME_ID_PATTERN.test(candidate) ? candidate : '';
}

function gamePath(gameId?: string) {
  const root = `${BASE_PATH || ''}/`.replace(/\/+/g, '/');
  return gameId ? `${root}${gameId}` : root;
}

function bangkokDateCode() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}${value.month}${value.day}`;
}

function formatShareText(tournament: Tournament) {
  const standings = calculateStandings(tournament);
  const finishedCount = tournament.matches.filter(
    (match) => match.status === 'finished',
  ).length;
  const lines = [
    `⚽ ${tournament.name}`,
    `ตารางคะแนนล่าสุด · แข่งแล้ว ${finishedCount}/${tournament.matches.length} แมตช์`,
    '',
  ];
  standings.forEach((standing, index) => {
    const team = tournament.teams.find((item) => item.id === standing.teamId);
    if (!team) return;
    lines.push(
      `${index + 1}. ${team.name} — ${standing.points} แต้ม (${standing.played} นัด, +/- ${standing.goalDifference > 0 ? '+' : ''}${standing.goalDifference})`,
    );
  });
  lines.push(
    '',
    `เวลาตามตาราง ${tournament.startTime}–${scheduledEndTime(tournament)}`,
  );
  return lines.join('\n').trim();
}

function nextMatchAfter(tournament: Tournament, match?: Match) {
  if (!match) return undefined;
  const index = tournament.matches.findIndex((item) => item.id === match.id);
  return tournament.matches
    .slice(index + 1)
    .find((item) => item.status !== 'finished');
}

function ScorePicker({
  label,
  color,
  score,
  onChange,
}: {
  label: string;
  color: TeamColor;
  score: string;
  onChange: (score: string) => void;
}) {
  const numericScore = Number.parseInt(score, 10) || 0;
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <div className="flex min-w-0 items-center justify-center gap-2">
        <span
          className="h-3 w-3 shrink-0 rounded-full border border-slate-200"
          style={{ background: COLOR_HEX[color] }}
        />
        <p className="truncate text-sm font-black">{label}</p>
      </div>
      <div className="mt-2 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => onChange(String(Math.max(0, numericScore - 1)))}
          disabled={numericScore === 0}
          aria-label={`ลดสกอร์ ${label}`}
          className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white disabled:opacity-35"
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={score}
          onChange={(event) => {
            onChange(event.target.value.replace(/\D/g, '').slice(0, 2));
          }}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={() => !score && onChange('0')}
          aria-label={`สกอร์ทีม ${label}`}
          className="h-10 w-12 rounded-xl border border-slate-200 bg-white text-center text-xl font-black tabular-nums outline-none focus:border-[#35a95f]"
        />
        <button
          type="button"
          onClick={() => onChange(String(numericScore + 1))}
          aria-label={`เพิ่มสกอร์ ${label}`}
          className="grid h-9 w-9 place-items-center rounded-xl bg-[#e5f5e9] text-[#087632]"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function CurrentMatchControl({
  tournament,
  match,
  next,
  onOpen,
  onUpdate,
}: {
  tournament: Tournament;
  match: Match;
  next?: Match;
  onOpen: () => void;
  onUpdate: (value: Tournament) => void;
}) {
  const teamA = tournament.teams.find((team) => team.id === match.teamAId)!;
  const teamB = tournament.teams.find((team) => team.id === match.teamBId)!;
  const [scoreA, setScoreA] = useState(String(match.teamAScore ?? 0));
  const [scoreB, setScoreB] = useState(String(match.teamBScore ?? 0));
  const normalizedScoreA = Number.parseInt(scoreA, 10) || 0;
  const normalizedScoreB = Number.parseInt(scoreB, 10) || 0;
  return (
    <div className="rounded-[22px] border border-[#9dd2ab] bg-white p-4 shadow-[0_8px_24px_rgba(17,130,59,.08)]">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="font-black text-[#087632]">
            {match.status === 'current' ? 'กำลังแข่ง' : 'เกมถัดไป'} ·{' '}
            {match.startTime}
          </p>
          <p className="text-xs font-bold text-slate-400">
            เกม {match.matchNumber} · สนาม 1
          </p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="h-9 rounded-xl px-3 text-sm font-black text-[#087632]"
        >
          รายละเอียด
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ScorePicker
          label={teamA.name}
          color={teamA.color}
          score={scoreA}
          onChange={setScoreA}
        />
        <ScorePicker
          label={teamB.name}
          color={teamB.color}
          score={scoreB}
          onChange={setScoreB}
        />
      </div>
      <div className="mt-3">
        <Button
          type="button"
          onClick={() =>
            onUpdate(
              finishMatchWithScore(
                tournament,
                match.id,
                normalizedScoreA,
                normalizedScoreB,
              ),
            )
          }
          className="h-12 w-full rounded-xl bg-[#11823b] font-black"
        >
          <Check />
          บันทึกผลและจบเกม
        </Button>
      </div>
      {next && (
        <div className="mt-3 flex w-full items-center justify-between border-t border-slate-100 pt-3 text-left text-xs font-bold text-slate-500">
          <span>เกมถัดไป {next.startTime}</span>
          <span className="text-slate-800">
            {tournament.teams.find((team) => team.id === next.teamAId)?.name} vs{' '}
            {tournament.teams.find((team) => team.id === next.teamBId)?.name}
          </span>
        </div>
      )}
    </div>
  );
}

function StandingsTable({ tournament }: { tournament: Tournament }) {
  const standings = calculateStandings(tournament);
  return (
    <section className="overflow-x-auto rounded-[22px] border border-slate-200 bg-white">
      <table className="w-full min-w-[430px] text-center text-sm">
        <thead className="bg-[#e5f5e9] text-[#087632]">
          <tr>
            <th className="px-3 py-3 text-left">อันดับ / ทีม</th>
            <th className="px-2 py-3">แข่ง</th>
            <th className="px-2 py-3">ช</th>
            <th className="px-2 py-3">ส</th>
            <th className="px-2 py-3">พ</th>
            <th className="px-2 py-3">+/-</th>
            <th className="px-3 py-3">แต้ม</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((standing, index) => {
            const team = tournament.teams.find(
              (item) => item.id === standing.teamId,
            )!;
            return (
              <tr key={standing.teamId} className="border-t border-slate-100">
                <td className="px-3 py-3 text-left">
                  <div className="flex items-center gap-2 font-black">
                    <span className="w-5 text-center text-slate-400">
                      {index + 1}
                    </span>
                    <TeamShirtIcon color={team.color} size="sm" />
                    <span className="truncate">{team.name}</span>
                  </div>
                </td>
                <td className="px-2 py-3 font-bold">{standing.played}</td>
                <td className="px-2 py-3 font-bold">{standing.won}</td>
                <td className="px-2 py-3 font-bold">{standing.drawn}</td>
                <td className="px-2 py-3 font-bold">{standing.lost}</td>
                <td className="px-2 py-3 font-bold">
                  {standing.goalDifference > 0 ? '+' : ''}
                  {standing.goalDifference}
                </td>
                <td className="px-3 py-3 text-base font-black text-[#087632]">
                  {standing.points}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function EmptyHome({
  onSetup,
  onDemo,
  onGames,
}: {
  onSetup: () => void;
  onDemo: () => void;
  onGames: () => void;
}) {
  return (
    <div className="flex min-h-[calc(100dvh-140px)] flex-col items-center justify-center px-7 pb-16 text-center">
      <div className="relative mb-6 grid h-28 w-28 place-items-center rounded-[34px] bg-[#e1f4e6] text-[#11823b]">
        <Shield className="h-14 w-14 fill-current" />
        <span className="absolute -right-2 -top-2 grid h-9 w-9 place-items-center rounded-full bg-white shadow">
          <Plus className="h-5 w-5" />
        </span>
      </div>
      <h2 className="text-2xl font-black">ยังไม่มีการแข่งขัน</h2>
      <p className="mt-2 max-w-xs text-sm font-medium leading-6 text-slate-500">
        สร้างตารางแบบพบกันหมด พร้อมหมุนเวียนผู้รักษาประตูให้ทุกทีม
      </p>
      <Button
        onClick={onSetup}
        className="mt-7 h-13 w-full max-w-xs rounded-2xl bg-[#11823b] text-base font-black"
      >
        <CalendarDays />
        สร้างตารางใหม่
      </Button>
      <Button
        onClick={onDemo}
        variant="outline"
        className="mt-3 h-12 w-full max-w-xs rounded-2xl font-bold"
      >
        ลองด้วยข้อมูลตัวอย่าง
      </Button>
      <Button
        onClick={onGames}
        variant="ghost"
        className="mt-2 h-11 w-full max-w-xs rounded-2xl font-black text-[#087632]"
      >
        <FolderOpen />
        ดูเกมทั้งหมด
      </Button>
    </div>
  );
}

function HomeScreen({
  tournament,
  syncStatus,
  onNavigate,
  onOpenMatch,
  onUpdate,
}: {
  tournament: Tournament;
  syncStatus: SyncStatus;
  onNavigate: (view: AppView) => void;
  onOpenMatch: (id: string) => void;
  onUpdate: (value: Tournament) => void;
}) {
  const current =
    tournament.matches.find((match) => match.status === 'current') ??
    tournament.matches.find((match) => match.status === 'upcoming');
  const next = nextMatchAfter(tournament, current);
  const finished = tournament.matches.filter(
    (match) => match.status === 'finished',
  ).length;
  const endTime = addMinutes(
    tournament.startTime,
    tournament.availableTimeMinutes,
  );
  const actions = [
    {
      label: 'ทีม / คิว GK',
      icon: Users,
      view: 'teams' as AppView,
    },
    {
      label: 'ตารางแข่ง',
      icon: CalendarRange,
      view: 'schedule' as AppView,
    },
    {
      label: 'แชร์',
      icon: Share2,
      view: 'share' as AppView,
    },
  ];
  return (
    <>
      <PageHeader
        title="Football Match Maker"
        eyebrow={tournament.name}
        action={
          <div
            className={`flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-black ${syncStatus === 'error' ? 'bg-red-50 text-red-600' : syncStatus === 'local' ? 'bg-amber-50 text-amber-700' : 'bg-[#e1f4e6] text-[#11823b]'}`}
          >
            {syncStatus === 'saving' ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : syncStatus === 'error' || syncStatus === 'local' ? (
              <CloudOff className="h-4 w-4" />
            ) : (
              <Cloud className="h-4 w-4" />
            )}
            {syncStatus === 'saving'
              ? 'กำลังบันทึก'
              : syncStatus === 'saved'
                ? 'บันทึกแล้ว'
                : syncStatus === 'error'
                  ? 'ซิงก์ไม่สำเร็จ'
                  : 'เฉพาะเครื่อง'}
          </div>
        }
      />
      <div className="space-y-4 px-4 py-4">
        <section className="grid grid-cols-3 gap-2">
          {actions.map(({ label, icon: Icon, view }) => (
            <button
              key={label}
              onClick={() => onNavigate(view)}
              className="flex min-h-16 items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm active:scale-[.98]"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#e5f5e9] text-[#087632]">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 text-xs leading-4 font-black">
                {label}
              </span>
            </button>
          ))}
        </section>
        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="text-lg font-black">
                {current?.status === 'current' ? 'แข่งอยู่ตอนนี้' : 'เกมถัดไป'}
              </p>
              <p className="text-xs font-semibold text-slate-500">
                ใส่สกอร์และจบเกมได้จากหน้านี้
              </p>
            </div>
            {current && (
              <button
                onClick={() => onNavigate('schedule')}
                className="text-sm font-black text-[#11823b]"
              >
                ดูทั้งหมด
              </button>
            )}
          </div>
          {current ? (
            <CurrentMatchControl
              key={current.id}
              tournament={tournament}
              match={current}
              next={next}
              onOpen={() => onOpenMatch(current.id)}
              onUpdate={onUpdate}
            />
          ) : (
            <div className="rounded-3xl bg-[#e5f5e9] p-8 text-center">
              <CircleCheck className="mx-auto mb-2 h-10 w-10 text-[#11823b]" />
              <p className="text-lg font-black">แข่งครบทุกแมตช์แล้ว!</p>
            </div>
          )}
        </section>
        <section>
          <div className="mb-2 flex items-end justify-between px-1">
            <div>
              <h2 className="font-black">ตารางคะแนน</h2>
              <p className="text-xs font-bold text-slate-400">
                แข่งแล้ว {finished}/{tournament.matches.length} · จบ {endTime}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('standings')}
              className="text-sm font-black text-[#087632]"
            >
              ดูผลทั้งหมด
            </button>
          </div>
          <StandingsTable tournament={tournament} />
        </section>
      </div>
    </>
  );
}

function SetupScreen({
  tournament,
  onCancel,
  onCreate,
}: {
  tournament: Tournament | null;
  onCancel: () => void;
  onCreate: (value: Tournament) => void;
}) {
  const defaultNames = ['Green', 'Red', 'Blue', 'Yellow', 'White', 'Black'];
  const [gameName, setGameName] = useState(tournament?.name ?? 'ฟุตบอลคืนนี้');
  const [teamCount, setTeamCount] = useState(tournament?.teams.length ?? 4);
  const [drafts, setDrafts] = useState(() =>
    Array.from({ length: 8 }, (_, i) => ({
      name: tournament?.teams[i]?.name ?? defaultNames[i] ?? `Team ${i + 1}`,
      color: tournament?.teams[i]?.color ?? TEAM_COLORS[i],
    })),
  );
  const [firstTeamIndex, setFirstTeamIndex] = useState(() => {
    const teamId = tournament?.matches[0]?.teamAId;
    const index = tournament?.teams.findIndex((team) => team.id === teamId);
    return index !== undefined && index >= 0 ? index : 0;
  });
  const [secondTeamIndex, setSecondTeamIndex] = useState(() => {
    const teamId = tournament?.matches[0]?.teamBId;
    const index = tournament?.teams.findIndex((team) => team.id === teamId);
    return index !== undefined && index >= 0 ? index : 1;
  });
  const [matchMinutes, setMatchMinutes] = useState(
    tournament?.matchDurationMinutes ?? 10,
  );
  const [breakMinutes, setBreakMinutes] = useState(
    tournament?.breakDurationMinutes ?? 2,
  );
  const [startTime, setStartTime] = useState(tournament?.startTime ?? '19:00');
  const [endTime, setEndTime] = useState(
    tournament
      ? addMinutes(tournament.startTime, tournament.availableTimeMinutes)
      : '22:00',
  );
  const metrics = scheduleMetrics(
    teamCount,
    matchMinutes,
    breakMinutes,
    startTime,
  );
  const availableMinutes = minutesBetween(startTime, endTime);
  const windowMetrics = scheduleWindowMetrics(
    matchMinutes,
    breakMinutes,
    startTime,
    availableMinutes,
  );
  const hasValidTimeRange = availableMinutes > 0;
  const enough =
    hasValidTimeRange && availableMinutes >= metrics.requiredMinutes;
  function submit() {
    if (
      !enough ||
      !gameName.trim() ||
      drafts.slice(0, teamCount).some((draft) => !draft.name.trim())
    )
      return;
    const teams = drafts.slice(0, teamCount).map((draft, index) => {
      const existing = tournament?.teams[index];
      return existing
        ? { ...existing, name: draft.name.trim(), color: draft.color }
        : makeTeam(draft.name.trim(), draft.color);
    });
    onCreate(
      createTournament({
        name: gameName.trim(),
        teams,
        firstMatchTeamIds: [
          teams[firstTeamIndex]?.id ?? teams[0].id,
          teams[secondTeamIndex]?.id ?? teams[1].id,
        ],
        matchDurationMinutes: matchMinutes,
        breakDurationMinutes: breakMinutes,
        startTime,
        availableTimeMinutes: availableMinutes,
      }),
    );
  }
  return (
    <>
      <PageHeader
        title={tournament ? 'แก้ไขการแข่งขัน' : 'สร้างตารางใหม่'}
        eyebrow="Round Robin · 1 สนาม"
        onBack={onCancel}
      />
      <div className="space-y-4 px-4 py-4 pb-8">
        <section className="settings-card">
          <label htmlFor="game-name" className="section-title">
            ชื่อเกม
          </label>
          <p className="section-note mt-1">เช่น ฟุตบอลคืนวันศุกร์</p>
          <input
            id="game-name"
            value={gameName}
            onChange={(event) => setGameName(event.target.value)}
            placeholder="ตั้งชื่อเกมนี้"
            className="mt-3 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 font-bold outline-none focus:border-[#35a95f]"
          />
        </section>
        <section className="settings-card">
          <div>
            <h2 className="section-title">จำนวนทีม</h2>
            <p className="section-note">ทุกทีมเจอกันทีมละ 1 ครั้ง</p>
          </div>
          <NumberStepper
            value={teamCount}
            min={2}
            max={8}
            onChange={setTeamCount}
            suffix="ทีม"
          />
        </section>
        <section className="settings-card">
          <div className="mb-3">
            <h2 className="section-title">ชื่อทีมและสีเสื้อ</h2>
            <p className="section-note">ตั้งชื่อและแตะวงกลมสีเพื่อเลือกสีของแต่ละทีม</p>
          </div>
          <div className="space-y-3">
            {drafts.slice(0, teamCount).map((draft, index) => (
              <div
                key={index}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
              >
                <div className="flex items-center gap-3">
                  <TeamShirtIcon color={draft.color} size="sm" />
                  <input
                    aria-label={`ชื่อทีม ${index + 1}`}
                    value={draft.name}
                    onChange={(event) =>
                      setDrafts((items) =>
                        items.map((item, i) =>
                          i === index
                            ? { ...item, name: event.target.value }
                            : item,
                        ),
                      )
                    }
                    className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 font-bold outline-none focus:border-[#35a95f]"
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {TEAM_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() =>
                        setDrafts((items) =>
                          items.map((item, i) =>
                            i === index ? { ...item, color } : item,
                          ),
                        )
                      }
                      aria-label={`เลือกสี${COLOR_LABEL[color]}`}
                      aria-pressed={draft.color === color}
                      className={`h-8 w-8 rounded-full border-2 ${draft.color === color ? 'ring-2 ring-[#11823b] ring-offset-2' : ''}`}
                      style={{
                        background: COLOR_HEX[color],
                        borderColor: color === 'white' ? '#94a3b8' : '#fff',
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="settings-card">
          <div className="mb-3">
            <h2 className="section-title">กำหนดคู่แรก</h2>
            <p className="section-note">
              เลือกทีมที่พร้อมลงสนามก่อน ระหว่างรอทีมอื่นมาให้ครบ
            </p>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <label className="min-w-0">
              <span className="sr-only">ทีมแรกของแมตช์แรก</span>
              <select
                value={Math.min(firstTeamIndex, teamCount - 1)}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setFirstTeamIndex(next);
                  if (next === secondTeamIndex)
                    setSecondTeamIndex(next === 0 ? 1 : 0);
                }}
                className="h-12 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm font-black outline-none focus:border-[#35a95f]"
              >
                {drafts.slice(0, teamCount).map((draft, index) => (
                  <option key={index} value={index}>
                    {COLOR_LABEL[draft.color]} · {draft.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-sm font-black text-slate-400">VS</span>
            <label className="min-w-0">
              <span className="sr-only">ทีมที่สองของแมตช์แรก</span>
              <select
                value={Math.min(secondTeamIndex, teamCount - 1)}
                onChange={(event) => setSecondTeamIndex(Number(event.target.value))}
                className="h-12 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm font-black outline-none focus:border-[#35a95f]"
              >
                {drafts.slice(0, teamCount).map((draft, index) => (
                  <option
                    key={index}
                    value={index}
                    disabled={index === Math.min(firstTeamIndex, teamCount - 1)}
                  >
                    {COLOR_LABEL[draft.color]} · {draft.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
        <section className="settings-card space-y-4">
          <div className="setting-row">
            <div>
              <h2 className="section-title">เวลาแข่งต่อคู่</h2>
              <p className="section-note">เวลาที่เล่นจริง</p>
            </div>
            <NumberStepper
              value={matchMinutes}
              min={5}
              max={30}
              onChange={setMatchMinutes}
              suffix="นาที"
            />
          </div>
          <div className="setting-row">
            <div>
              <h2 className="section-title">พักระหว่างคู่</h2>
              <p className="section-note">เวลาเปลี่ยนทีม</p>
            </div>
            <NumberStepper
              value={breakMinutes}
              min={0}
              max={10}
              onChange={setBreakMinutes}
              suffix="นาที"
            />
          </div>
          <div className="setting-row">
            <div>
              <h2 className="section-title">สนาม</h2>
              <p className="section-note">V1 รองรับสนามเดียว</p>
            </div>
            <span className="rounded-xl bg-slate-100 px-4 py-3 font-black">
              1 สนาม 🔒
            </span>
          </div>
        </section>
        <section className="settings-card space-y-4">
          <label className="setting-row">
            <div>
              <h2 className="section-title">เวลาเริ่ม</h2>
              <p className="section-note">นัดแรกเริ่มเมื่อไร</p>
            </div>
            <input
              aria-label="เวลาเริ่ม"
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-lg font-black"
            />
          </label>
          <label className="setting-row">
            <div>
              <h2 className="section-title">เวลาจบ</h2>
              <p className="section-note">เลือกเวลาที่ต้องการเลิกสนาม</p>
            </div>
            <input
              aria-label="เวลาจบ"
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-lg font-black"
            />
          </label>
        </section>
        <section
          className={`rounded-[22px] border p-4 ${enough ? 'border-[#9dd2ab] bg-[#eef9f1]' : 'border-amber-300 bg-amber-50'}`}
        >
          <div className="flex gap-3">
            {enough ? (
              <CircleCheck className="h-7 w-7 shrink-0 text-[#11823b]" />
            ) : (
              <CircleAlert className="h-7 w-7 shrink-0 text-amber-600" />
            )}
            <div>
              <p className="font-black">
                {!hasValidTimeRange
                  ? 'เวลาจบต้องอยู่หลังเวลาเริ่ม'
                  : enough
                    ? 'เวลาพอสำหรับการแข่งขันทั้งหมด'
                    : 'เวลาไม่เพียงพอ'}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                ครบทุกคู่รอบแรก {metrics.matchCount} แมตช์ · ต้องใช้{' '}
                {metrics.requiredMinutes} นาที
              </p>
              {enough && (
                <p className="mt-1 text-sm font-black text-[#087632]">
                  จัดได้ {windowMetrics.matchCount} แมตช์ · วนคู่แข่งถึง{' '}
                  {windowMetrics.endTime}
                  {windowMetrics.remainingMinutes > 0 &&
                    ` · เหลือ ${windowMetrics.remainingMinutes} นาที`}
                </p>
              )}
              {hasValidTimeRange && !enough && (
                <p className="mt-1 text-sm font-black text-amber-700">
                  เวลาจบ {endTime} · ขาด{' '}
                  {metrics.requiredMinutes - availableMinutes} นาที
                </p>
              )}
            </div>
          </div>
        </section>
        <Button
          onClick={submit}
          disabled={
            !enough ||
            !gameName.trim() ||
            drafts.slice(0, teamCount).some((draft) => !draft.name.trim())
          }
          className="h-14 w-full rounded-2xl bg-[#11823b] text-base font-black"
        >
          <CalendarDays />
          สร้างตารางใหม่
        </Button>
      </div>
    </>
  );
}

function TeamsScreen({
  tournament,
  onOpenTeam,
}: {
  tournament: Tournament;
  onOpenTeam: (id: string) => void;
}) {
  return (
    <>
      <PageHeader
        title="ทีมทั้งหมด"
        eyebrow={`${tournament.teams.length} ทีม · เลือกทีมเพื่อดูคิว GK`}
      />
      <div className="space-y-3 px-4 py-4">
        {tournament.teams.map((team) => (
          <button
            key={team.id}
            onClick={() => onOpenTeam(team.id)}
            className="flex w-full items-center gap-3 rounded-[20px] border border-slate-200 bg-white p-4 text-left shadow-sm active:scale-[.99]"
          >
            <TeamBadge team={team} />
            <div className="ml-auto flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-500">
                ขาด {team.players.filter((player) => player.absentToday).length}
              </span>
              <ChevronRight className="h-5 w-5 text-slate-400" />
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

function TeamDetailScreen({
  team,
  onBack,
  onUpdate,
}: {
  team: Team;
  onBack: () => void;
  onUpdate: (team: Team) => void;
}) {
  const [newName, setNewName] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const eligiblePlayers = team.players.filter((player) => !player.absentToday);
  const gkOrder = [
    ...team.gkRotation.filter((id) =>
      eligiblePlayers.some((player) => player.id === id),
    ),
    ...eligiblePlayers
      .map((player) => player.id)
      .filter((id) => !team.gkRotation.includes(id)),
  ];
  function randomizeGoalkeepers() {
    const order = shuffle(eligiblePlayers.map((player) => player.id));
    onUpdate({
      ...team,
      gkRotation: order,
      gkCycleOrders: order.length ? [order] : [],
    });
  }
  function updatePlayers(players: Team['players']) {
    const ids = new Set(players.map((player) => player.id));
    onUpdate({
      ...team,
      players,
      gkRotation: [
        ...team.gkRotation.filter((id) => ids.has(id)),
        ...players
          .map((player) => player.id)
          .filter((id) => !team.gkRotation.includes(id)),
      ],
      gkCycleOrders: team.gkCycleOrders.map((order) =>
        order.filter((id) => ids.has(id)),
      ),
    });
  }
  function addPlayer() {
    const name = newName.trim();
    if (!name) return;
    updatePlayers([...team.players, createPlayer(name)]);
    setNewName('');
  }
  return (
    <>
      <PageHeader
        title={`ทีม ${team.name}`}
        eyebrow="จัดการผู้เล่น"
        onBack={onBack}
        action={<TeamShirtIcon color={team.color} size="sm" />}
      />
      <div className="space-y-4 px-4 py-4 pb-8">
        <section className="flex items-center gap-5 rounded-[24px] border border-slate-200 bg-white p-5">
          <TeamShirtIcon color={team.color} size="lg" />
          <div>
            <p className="text-2xl font-black">{team.name}</p>
            <p className="text-sm font-bold text-slate-500">
              {team.players.length} Players · พร้อม{' '}
              {team.players.filter((player) => !player.absentToday).length}
            </p>
          </div>
        </section>
        <section className="settings-card">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="section-title">ลำดับผู้รักษาประตู</h2>
              <p className="section-note">วนตามลำดับนี้ในแต่ละเกม</p>
            </div>
            <Button
              onClick={randomizeGoalkeepers}
              disabled={eligiblePlayers.length === 0}
              variant="outline"
              className="h-10 rounded-xl border-[#9dd2ab] font-black text-[#087632]"
            >
              <Shuffle />
              สุ่มลำดับ
            </Button>
          </div>
          {gkOrder.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {gkOrder.map((id, index) => (
                <div
                  key={id}
                  className="flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 p-2.5"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#11823b] text-xs font-black text-white">
                    {index + 1}
                  </span>
                  <span className="truncate font-black">
                    {team.players.find((player) => player.id === id)?.name}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-400">
              เพิ่มผู้เล่นที่มาวันนี้ก่อนสุ่มคิว GK
            </p>
          )}
        </section>
        <section className="settings-card">
          <div className="mb-3">
            <h2 className="section-title">รายชื่อผู้เล่น</h2>
            <p className="section-note">ลากหรือใช้ลูกศรเพื่อเรียงรายชื่อ</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            {team.players.length === 0 ? (
              <div className="p-8 text-center text-sm font-bold text-slate-400">
                ยังไม่มีผู้เล่น
              </div>
            ) : (
              team.players.map((player, index) => (
                <div
                  key={player.id}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragIndex !== null)
                      updatePlayers(reorder(team.players, dragIndex, index));
                    setDragIndex(null);
                  }}
                  className={`flex items-center gap-2 border-b border-slate-100 bg-white p-2 last:border-0 ${player.absentToday ? 'opacity-55' : ''}`}
                >
                  <GripVertical className="h-5 w-5 shrink-0 text-slate-300" />
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e6f5ea] text-xs font-black text-[#087632]">
                    {index + 1}
                  </span>
                  <input
                    value={player.name}
                    onChange={(event) =>
                      updatePlayers(
                        team.players.map((item) =>
                          item.id === player.id
                            ? { ...item, name: event.target.value }
                            : item,
                        ),
                      )
                    }
                    className="h-10 min-w-0 flex-1 bg-transparent font-bold outline-none"
                    aria-label={`ชื่อผู้เล่น ${index + 1}`}
                  />
                  <button
                    onClick={() =>
                      updatePlayers(
                        team.players.map((item) =>
                          item.id === player.id
                            ? { ...item, absentToday: !item.absentToday }
                            : item,
                        ),
                      )
                    }
                    className={`rounded-lg px-2 py-1.5 text-[10px] font-black ${player.absentToday ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}
                  >
                    {player.absentToday ? 'ขาดวันนี้' : 'มาวันนี้'}
                  </button>
                  <div className="flex flex-col">
                    <button
                      disabled={index === 0}
                      onClick={() =>
                        updatePlayers(reorder(team.players, index, index - 1))
                      }
                      className="p-0.5 disabled:opacity-20"
                      aria-label="เลื่อนขึ้น"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      disabled={index === team.players.length - 1}
                      onClick={() =>
                        updatePlayers(reorder(team.players, index, index + 1))
                      }
                      className="p-0.5 disabled:opacity-20"
                      aria-label="เลื่อนลง"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    onClick={() =>
                      updatePlayers(
                        team.players.filter((item) => item.id !== player.id),
                      )
                    }
                    className="grid h-9 w-9 place-items-center rounded-lg text-red-500 hover:bg-red-50"
                    aria-label={`ลบ ${player.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && addPlayer()}
              placeholder="ชื่อผู้เล่นใหม่"
              className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 font-bold outline-none focus:border-[#35a95f]"
            />
            <Button
              onClick={addPlayer}
              className="h-12 rounded-xl bg-[#11823b]"
            >
              <Plus />
              เพิ่ม
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}

function ScheduleScreen({
  tournament,
  onOpenMatch,
  onUpdate,
  onStandings,
}: {
  tournament: Tournament;
  onOpenMatch: (id: string) => void;
  onUpdate: (value: Tournament) => void;
  onStandings: () => void;
}) {
  const slotMinutes =
    tournament.matchDurationMinutes + tournament.breakDurationMinutes;
  const fieldEndTime = addMinutes(
    tournament.startTime,
    tournament.availableTimeMinutes,
  );
  const current = tournament.matches.find(
    (match) => match.status === 'current',
  );
  const upcoming = tournament.matches.filter(
    (match) => match.status === 'upcoming',
  );
  const finished = tournament.matches
    .filter((match) => match.status === 'finished')
    .reverse();
  const groups = [
    {
      label: 'กำลังแข่ง',
      matches: current ? [current] : [],
      tone: 'current' as const,
    },
    {
      label: 'เกมถัดไป',
      matches: upcoming,
      tone: 'upcoming' as const,
    },
    {
      label: 'แข่งแล้ว · ล่าสุดก่อน',
      matches: finished,
      tone: 'finished' as const,
    },
  ].filter((group) => group.matches.length > 0);
  return (
    <>
      <PageHeader
        title="ตารางการแข่งขัน"
        eyebrow={`${tournament.matches.length} แมตช์ · เวลาสนาม ${tournament.startTime}–${fieldEndTime}`}
        action={
          <Button
            onClick={onStandings}
            variant="outline"
            className="h-10 rounded-xl border-[#9dd2ab] px-3 font-black text-[#087632]"
          >
            <Trophy className="h-4 w-4" />
            ตารางคะแนน
          </Button>
        }
      />
      <div className="space-y-3 px-4 py-4 pb-6">
        <section className="overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-sm">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="w-[88px] px-3">ช่วงเวลา</TableHead>
                <TableHead>คู่แข่งขัน</TableHead>
                <TableHead className="w-[76px] pr-3 text-right">ผล</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.flatMap((group) => [
                <TableRow
                  key={`group-${group.tone}`}
                  className="border-0 bg-slate-100/80 hover:bg-slate-100/80"
                >
                  <TableCell
                    colSpan={3}
                    className={`px-3 py-2 text-[11px] font-black uppercase tracking-wide ${
                      group.tone === 'current'
                        ? 'text-[#087632]'
                        : 'text-slate-500'
                    }`}
                  >
                    {group.label}
                  </TableCell>
                </TableRow>,
                ...group.matches.map((match) => {
                  const teamA = tournament.teams.find(
                    (team) => team.id === match.teamAId,
                  )!;
                  const teamB = tournament.teams.find(
                    (team) => team.id === match.teamBId,
                  )!;
                  const hasScore =
                    match.teamAScore !== undefined &&
                    match.teamBScore !== undefined;
                  return (
                    <TableRow
                      key={match.id}
                      className={
                        match.status === 'current'
                          ? 'bg-[#eef9f1]'
                          : match.status === 'finished'
                            ? 'bg-slate-50/60'
                            : ''
                      }
                    >
                      <TableCell className="px-3 py-3 align-middle font-black tabular-nums">
                        <span className="block leading-4">
                          {match.startTime}
                        </span>
                        <span className="block text-[11px] font-bold text-slate-400">
                          –
                          {addMinutes(
                            match.startTime,
                            tournament.matchDurationMinutes,
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="p-0 align-middle">
                        <button
                          type="button"
                          onClick={() => onOpenMatch(match.id)}
                          aria-label={`เปิดเกม ${match.matchNumber}: ${teamA.name} พบ ${teamB.name}`}
                          className="grid min-h-12 w-full grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)] items-center gap-1 px-2 text-left"
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span
                              className="h-3 w-3 shrink-0 rounded-full border border-slate-200"
                              style={{ background: COLOR_HEX[teamA.color] }}
                            />
                            <span className="truncate text-sm font-black">
                              {teamA.name}
                            </span>
                          </span>
                          <span className="text-center text-xs font-bold text-slate-400">
                            vs
                          </span>
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span
                              className="h-3 w-3 shrink-0 rounded-full border border-slate-200"
                              style={{ background: COLOR_HEX[teamB.color] }}
                            />
                            <span className="truncate text-sm font-black">
                              {teamB.name}
                            </span>
                          </span>
                        </button>
                      </TableCell>
                      <TableCell className="pr-2 text-right align-middle">
                        <button
                          type="button"
                          onClick={() => onOpenMatch(match.id)}
                          aria-label={`ดูรายละเอียดเกม ${match.matchNumber}`}
                          className="inline-flex min-h-10 items-center justify-end gap-1"
                        >
                          {hasScore ? (
                            <span className="font-black tabular-nums text-[#087632]">
                              {match.teamAScore}-{match.teamBScore}
                            </span>
                          ) : (
                            <span
                              className={`rounded-full px-2 py-1 text-xs font-black ${
                                match.status === 'current'
                                  ? 'bg-[#11823b] text-white'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {match.status === 'current'
                                ? 'LIVE'
                                : match.status === 'finished'
                                  ? 'จบ'
                                  : 'รอ'}
                            </span>
                          )}
                          <ChevronRight className="h-4 w-4 text-slate-300" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                }),
              ])}
            </TableBody>
          </Table>
        </section>
        <Button
          onClick={() => onUpdate(extendTournamentByMatches(tournament, 1))}
          variant="outline"
          className="h-11 w-full rounded-xl border-[#9dd2ab] font-black text-[#087632]"
        >
          <Plus />
          เล่นต่ออีก 1 เกม
          <span className="font-bold text-slate-400">(+{slotMinutes} นาที)</span>
        </Button>
      </div>
    </>
  );
}

function StandingsScreen({
  tournament,
  onBack,
}: {
  tournament: Tournament;
  onBack: () => void;
}) {
  const results = tournament.matches.filter(
    (match) =>
      match.status === 'finished' &&
      match.teamAScore !== undefined &&
      match.teamBScore !== undefined,
  );
  return (
    <>
      <PageHeader
        title="ตารางคะแนน"
        eyebrow={`${results.length} ผลการแข่งขันที่บันทึกแล้ว`}
        onBack={onBack}
      />
      <div className="space-y-4 px-4 py-4 pb-8">
        <StandingsTable tournament={tournament} />
        <p className="px-1 text-sm font-semibold text-slate-500">
          ชนะ 3 แต้ม · เสมอ 1 แต้ม · นับเฉพาะแมตช์ที่บันทึกสกอร์แล้ว
        </p>
        <section className="settings-card">
          <h2 className="section-title mb-3">ผลการแข่งขัน</h2>
          {results.length ? (
            <div className="space-y-2">
              {[...results].reverse().map((match) => {
                const teamA = tournament.teams.find(
                  (team) => team.id === match.teamAId,
                )!;
                const teamB = tournament.teams.find(
                  (team) => team.id === match.teamBId,
                )!;
                return (
                  <div
                    key={match.id}
                    className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl bg-slate-50 p-3"
                  >
                    <span className="truncate text-right font-black">
                      {teamA.name}
                    </span>
                    <span className="rounded-lg bg-white px-3 py-1 text-lg font-black tabular-nums text-[#087632] shadow-sm">
                      {match.teamAScore} - {match.teamBScore}
                    </span>
                    <span className="truncate font-black">{teamB.name}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="rounded-xl bg-slate-50 p-4 text-center text-sm font-semibold text-slate-500">
              ยังไม่มีผลการแข่งขัน
            </p>
          )}
        </section>
      </div>
    </>
  );
}

function MatchDetailScreen({
  tournament,
  match,
  onBack,
  onUpdate,
}: {
  tournament: Tournament;
  match: Match;
  onBack: () => void;
  onUpdate: (value: Tournament) => void;
}) {
  const teamA = tournament.teams.find((team) => team.id === match.teamAId)!;
  const teamB = tournament.teams.find((team) => team.id === match.teamBId)!;
  const [scoreA, setScoreA] = useState(String(match.teamAScore ?? 0));
  const [scoreB, setScoreB] = useState(String(match.teamBScore ?? 0));
  const normalizedScoreA = Number.parseInt(scoreA, 10) || 0;
  const normalizedScoreB = Number.parseInt(scoreB, 10) || 0;
  return (
    <>
      <PageHeader
        title={`Match ${match.matchNumber}`}
        eyebrow={`สนาม 1 · ${match.startTime}–${addMinutes(match.startTime, tournament.matchDurationMinutes)}`}
        onBack={onBack}
      />
      <div className="space-y-4 px-4 py-4 pb-8">
        <section className="rounded-[26px] border border-slate-200 bg-white p-5">
          <div className="grid grid-cols-[1fr_42px_1fr] items-center">
            <div className="flex flex-col items-center">
              <TeamShirtIcon color={teamA.color} size="lg" />
              <p className="mt-1 text-lg font-black">{teamA.name}</p>
            </div>
            <span className="text-center font-black text-slate-400">VS</span>
            <div className="flex flex-col items-center">
              <TeamShirtIcon color={teamB.color} size="lg" />
              <p className="mt-1 text-lg font-black">{teamB.name}</p>
            </div>
          </div>
        </section>
        <section className="settings-card">
          <div className="mb-4 text-center">
            <h2 className="section-title">บันทึกสกอร์</h2>
            <p className="section-note">ใส่ประตูของแต่ละทีมก่อนจบเกม</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ScorePicker
              label={teamA.name}
              color={teamA.color}
              score={scoreA}
              onChange={setScoreA}
            />
            <ScorePicker
              label={teamB.name}
              color={teamB.color}
              score={scoreB}
              onChange={setScoreB}
            />
          </div>
        </section>
        {match.status === 'upcoming' && (
          <Button
            onClick={() =>
              onUpdate(setMatchStatus(tournament, match.id, 'current'))
            }
            className="h-14 w-full rounded-2xl bg-[#11823b] text-base font-black"
          >
            เริ่ม Match นี้
          </Button>
        )}
        {match.status === 'current' && (
          <Button
            onClick={() =>
              onUpdate(
                finishMatchWithScore(
                  tournament,
                  match.id,
                  normalizedScoreA,
                  normalizedScoreB,
                ),
              )
            }
            className="h-14 w-full rounded-2xl bg-[#11823b] text-base font-black"
          >
            <Check />
            บันทึกผลและจบเกม
          </Button>
        )}
        {match.status === 'finished' && (
          <div className="space-y-3">
            <Button
              onClick={() =>
                onUpdate(
                  setMatchScore(
                    tournament,
                    match.id,
                    normalizedScoreA,
                    normalizedScoreB,
                  ),
                )
              }
              variant="outline"
              className="h-12 w-full rounded-xl font-black"
            >
              บันทึกสกอร์ใหม่
            </Button>
            <Button
              onClick={() =>
                onUpdate(reopenFinishedMatch(tournament, match.id))
              }
              variant="outline"
              className="h-12 w-full rounded-xl border-amber-300 font-black text-amber-700"
            >
              <RotateCcw />
              ยกเลิกผล · กลับมาแข่งต่อ
            </Button>
            <div className="rounded-2xl bg-[#e5f5e9] p-4 text-center font-black text-[#087632]">
              <CircleCheck className="mr-2 inline h-5 w-5" />
              แมตช์นี้จบแล้ว
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ShareScreen({
  tournament,
  gameId,
  onBack,
  onNotice,
}: {
  tournament: Tournament;
  gameId: string;
  onBack: () => void;
  onNotice: (message: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isSharing, setIsSharing] = useState(false);
  const gameUrl =
    typeof window !== 'undefined' && gameId ? window.location.href : '';
  const text = [
    formatShareText(tournament),
    gameUrl ? `เปิดเกมและแก้ไขร่วมกัน: ${gameUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  useEffect(() => {
    let cancelled = false;
    async function draw() {
      await document.fonts?.ready;
      if (!cancelled && canvasRef.current) {
        renderStandingsShareCard(canvasRef.current, tournament);
      }
    }
    void draw();
    return () => {
      cancelled = true;
    };
  }, [tournament]);

  async function makeBlob() {
    if (!canvasRef.current) throw new Error('ยังสร้างรูปไม่เสร็จ');
    renderStandingsShareCard(canvasRef.current, tournament);
    return canvasToPngBlob(canvasRef.current);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      onNotice('คัดลอกสรุปตารางคะแนนแล้ว');
    } catch {
      onNotice('คัดลอกไม่สำเร็จ ลองแชร์หรือดาวน์โหลดรูปแทน');
    }
  }

  async function download() {
    try {
      const blob = await makeBlob();
      downloadShareCard(blob, shareCardFilename(tournament));
      onNotice('ดาวน์โหลดรูปตารางคะแนนแล้ว');
    } catch {
      onNotice('สร้างรูปไม่สำเร็จ กรุณาลองใหม่');
    }
  }

  async function share() {
    if (isSharing) return;
    setIsSharing(true);
    try {
      const blob = await makeBlob();
      const file = new File([blob], shareCardFilename(tournament), {
        type: 'image/png',
      });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: tournament.name,
          text: `ตารางคะแนนล่าสุด · ${tournament.name}`,
          ...(gameUrl ? { url: gameUrl } : {}),
          files: [file],
        });
      } else {
        downloadShareCard(blob, file.name);
        onNotice('อุปกรณ์นี้แชร์ไฟล์ตรงไม่ได้ จึงดาวน์โหลดรูปให้แล้ว');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      onNotice('แชร์รูปไม่สำเร็จ กรุณาลองดาวน์โหลดรูปแทน');
    } finally {
      setIsSharing(false);
    }
  }
  return (
    <>
      <PageHeader
        title="แชร์ตารางคะแนน"
        eyebrow="รูปพร้อมส่งให้เพื่อน"
        onBack={onBack}
      />
      <div className="space-y-4 px-4 py-4 pb-8">
        <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white p-2 shadow-sm">
          <canvas
            ref={canvasRef}
            aria-label={`รูปตารางคะแนน ${tournament.name}`}
            className="block h-auto w-full rounded-[20px] bg-[#f4f8f5]"
          >
            รูปตารางคะแนน {tournament.name}
          </canvas>
        </section>
        <Button
          onClick={share}
          disabled={isSharing}
          className="h-14 w-full rounded-2xl bg-[#06c755] text-base font-black hover:bg-[#05ad49]"
        >
          <Share2 />
          {isSharing ? 'กำลังสร้างรูป…' : 'แชร์รูปไป LINE / แอปอื่น'}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={download}
            variant="outline"
            className="h-12 rounded-xl font-black"
          >
            <Download />
            ดาวน์โหลดรูป
          </Button>
          <Button
            onClick={copy}
            variant="outline"
            className="h-12 rounded-xl font-black"
          >
            <Copy />
            คัดลอกข้อความ
          </Button>
        </div>
      </div>
    </>
  );
}

function formatGameDate(value: string) {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
}

function GamesScreen({
  onBack,
  onOpen,
  onDeleted,
  onNotice,
}: {
  onBack: () => void;
  onOpen: (gameId: string) => void;
  onDeleted: (gameId: string) => void;
  onNotice: (message: string) => void;
}) {
  const [games, setGames] = useState<FootballGameSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState('');
  const [confirmingId, setConfirmingId] = useState('');

  async function refresh() {
    setLoading(true);
    try {
      setGames(await listSharedGames());
    } catch {
      onNotice('โหลดรายการเกมไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setLoading(false);
    }
  }

  /* oxlint-disable react-hooks/exhaustive-deps, react/react-compiler -- load the remote game index once when this screen opens. */
  useEffect(() => {
    void refresh();
  }, []);
  /* oxlint-enable react-hooks/exhaustive-deps, react/react-compiler */

  async function removeGame(gameId: string) {
    setDeletingId(gameId);
    try {
      const deleted = await deleteSharedGame(gameId);
      if (!deleted) {
        onNotice('ไม่พบเกมนี้ในฐานข้อมูล');
        return;
      }
      setGames((items) => items.filter((game) => game.id !== gameId));
      setConfirmingId('');
      onDeleted(gameId);
      onNotice('ลบเกมออกจากฐานข้อมูลแล้ว');
    } catch {
      onNotice('ลบเกมไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setDeletingId('');
    }
  }

  const confirmingGame = games.find((game) => game.id === confirmingId);
  return (
    <>
      <PageHeader
        title="เกมทั้งหมด"
        eyebrow={`${games.length} เกมใน FootballTeam`}
        onBack={onBack}
        action={
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="grid h-10 w-10 place-items-center rounded-2xl bg-[#e1f4e6] text-[#11823b] disabled:opacity-50"
            aria-label="โหลดรายการเกมใหม่"
          >
            <RotateCcw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        }
      />
      <div className="space-y-3 px-4 py-4 pb-8">
        {loading && games.length === 0 ? (
          <div className="rounded-[22px] border border-slate-200 bg-white p-8 text-center font-bold text-slate-500">
            กำลังโหลดเกม…
          </div>
        ) : games.length === 0 ? (
          <div className="rounded-[22px] border border-slate-200 bg-white p-8 text-center">
            <FolderOpen className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 font-black">ยังไม่มีเกมในฐานข้อมูล</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              สร้างตารางใหม่แล้วเกมจะมาอยู่ที่หน้านี้
            </p>
          </div>
        ) : (
          games.map((game) => (
            <article
              key={game.id}
              className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => onOpen(game.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-base font-black">{game.name}</p>
                  <p className="mt-1 text-xs font-bold text-slate-400">
                    {game.id} · อัปเดต {formatGameDate(game.updatedAt)}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingId(game.id)}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600"
                  aria-label={`ลบ ${game.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => onOpen(game.id)}
                className="mt-3 flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 text-left"
              >
                <span className="text-sm font-bold text-slate-600">
                  {game.teamCount} ทีม · {game.finishedCount}/{game.matchCount}{' '}
                  แมตช์ · เริ่ม {game.startTime}
                </span>
                <ChevronRight className="h-5 w-5 text-slate-400" />
              </button>
            </article>
          ))
        )}
      </div>
      {confirmingGame && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/25 p-4 backdrop-blur-sm">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-game-title"
            aria-describedby="delete-game-description"
            className="w-full max-w-sm rounded-[24px] bg-white p-5 shadow-2xl"
          >
            <h2 id="delete-game-title" className="text-lg font-black">
              ลบ “{confirmingGame.name}”?
            </h2>
            <p
              id="delete-game-description"
              className="mt-2 text-sm font-semibold leading-6 text-slate-500"
            >
              เกม ตารางคะแนน รายชื่อทีม และผลแข่งจะถูกลบจากฐานข้อมูลถาวร
              ลิงก์เดิมจะเปิดเกมนี้ไม่ได้อีก
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={() => setConfirmingId('')}
                disabled={Boolean(deletingId)}
                className="h-12 rounded-xl font-black"
              >
                ยกเลิก
              </Button>
              <Button
                variant="destructive"
                onClick={() => void removeGame(confirmingGame.id)}
                disabled={Boolean(deletingId)}
                className="h-12 rounded-xl font-black"
              >
                <Trash2 />
                {deletingId ? 'กำลังลบ…' : 'ลบถาวร'}
              </Button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function SettingsPairPicker({
  label,
  teams,
  teamAId,
  teamBId,
  onTeamAChange,
  onTeamBChange,
  disabled = false,
}: {
  label: string;
  teams: Team[];
  teamAId: string;
  teamBId: string;
  onTeamAChange: (teamId: string) => void;
  onTeamBChange: (teamId: string) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="rounded-2xl bg-slate-50 p-3">
      <legend className="px-1 text-sm font-black text-slate-700">{label}</legend>
      <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <select
          aria-label={`${label} ทีมแรก`}
          value={teamAId}
          onChange={(event) => {
            const nextId = event.target.value;
            onTeamAChange(nextId);
            if (nextId === teamBId) {
              const replacement = teams.find((team) => team.id !== nextId);
              if (replacement) onTeamBChange(replacement.id);
            }
          }}
          className="h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-2 text-sm font-black outline-none focus:border-[#35a95f] disabled:opacity-50"
        >
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {COLOR_LABEL[team.color]} · {team.name}
            </option>
          ))}
        </select>
        <span className="text-xs font-black text-slate-400">VS</span>
        <select
          aria-label={`${label} ทีมที่สอง`}
          value={teamBId}
          onChange={(event) => onTeamBChange(event.target.value)}
          className="h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-2 text-sm font-black outline-none focus:border-[#35a95f] disabled:opacity-50"
        >
          {teams.map((team) => (
            <option key={team.id} value={team.id} disabled={team.id === teamAId}>
              {COLOR_LABEL[team.color]} · {team.name}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}

function SettingsScreen({
  tournament,
  gameId,
  onCreateNew,
  onSave,
  onGames,
  onTeams,
  onReset,
}: {
  tournament: Tournament;
  gameId: string;
  onCreateNew: () => void;
  onSave: (value: Tournament) => void;
  onGames: () => void;
  onTeams: () => void;
  onReset: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(tournament.name);
  const [matchMinutes, setMatchMinutes] = useState(
    tournament.matchDurationMinutes,
  );
  const [breakMinutes, setBreakMinutes] = useState(
    tournament.breakDurationMinutes,
  );
  const [startTime, setStartTime] = useState(tournament.startTime);
  const [endTime, setEndTime] = useState(
    addMinutes(tournament.startTime, tournament.availableTimeMinutes),
  );
  const editableMatches = tournament.matches.filter(
    (match) => match.status !== 'finished',
  );
  const firstQueuedMatch = editableMatches[0];
  const secondQueuedMatch = editableMatches[1];
  const fallbackTeamA = tournament.teams[0]?.id ?? '';
  const fallbackTeamB = tournament.teams[1]?.id ?? fallbackTeamA;
  const [firstPairA, setFirstPairA] = useState(
    firstQueuedMatch?.teamAId ?? fallbackTeamA,
  );
  const [firstPairB, setFirstPairB] = useState(
    firstQueuedMatch?.teamBId ?? fallbackTeamB,
  );
  const [secondPairA, setSecondPairA] = useState(
    secondQueuedMatch?.teamAId ?? fallbackTeamA,
  );
  const [secondPairB, setSecondPairB] = useState(
    secondQueuedMatch?.teamBId ?? fallbackTeamB,
  );
  const [useSecondPair, setUseSecondPair] = useState(
    Boolean(secondQueuedMatch),
  );
  const availableMinutes = minutesBetween(startTime, endTime);
  const windowMetrics = scheduleWindowMetrics(
    matchMinutes,
    breakMinutes,
    startTime,
    availableMinutes,
  );
  const protectedCount = tournament.matches.reduce(
    (count, match, index) =>
      match.status === 'upcoming' ? count : Math.max(count, index + 1),
    0,
  );
  const resultingCount = Math.max(windowMetrics.matchCount, protectedCount);
  const finishedCount = tournament.matches.filter(
    (match) => match.status === 'finished',
  ).length;
  const remainingAfterSave = Math.max(0, resultingCount - finishedCount);
  const samePairTwice =
    useSecondPair &&
    ((firstPairA === secondPairA && firstPairB === secondPairB) ||
      (firstPairA === secondPairB && firstPairB === secondPairA));
  const pairSelectionValid =
    remainingAfterSave === 0 ||
    (firstPairA !== firstPairB &&
      (!useSecondPair ||
        (remainingAfterSave >= 2 &&
          secondPairA !== secondPairB &&
          !samePairTwice)));
  const valid =
    Boolean(name.trim()) &&
    availableMinutes > 0 &&
    resultingCount > 0 &&
    pairSelectionValid;

  function saveSettings() {
    if (!valid) return;
    const updated = updateTournamentSettings(tournament, {
      name: name.trim(),
      matchDurationMinutes: matchMinutes,
      breakDurationMinutes: breakMinutes,
      startTime,
      availableTimeMinutes: availableMinutes,
    });
    const preferredPairs: Array<[string, string]> = [
      [firstPairA, firstPairB],
    ];
    if (useSecondPair)
      preferredPairs.push([secondPairA, secondPairB]);
    onSave(
      remainingAfterSave > 0
        ? prioritizeUpcomingMatches(updated, preferredPairs)
        : updated,
    );
  }

  return (
    <>
      <PageHeader title="ตั้งค่า" eyebrow="เกมที่กำลังใช้งาน" />
      <div className="space-y-4 px-4 py-4">
        <section className="settings-card space-y-4">
          <div>
            <label htmlFor="settings-game-name" className="section-title">
              ชื่อเกม
            </label>
            <input
              id="settings-game-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 font-bold outline-none focus:border-[#35a95f]"
            />
          </div>
          <div className="setting-row">
            <div>
              <h2 className="section-title">เวลาแข่งต่อคู่</h2>
              <p className="section-note">ปรับได้ระหว่างเล่น</p>
            </div>
            <NumberStepper
              value={matchMinutes}
              min={5}
              max={30}
              onChange={setMatchMinutes}
              suffix="นาที"
            />
          </div>
          <div className="setting-row">
            <div>
              <h2 className="section-title">เวลาพัก</h2>
              <p className="section-note">เวลาเปลี่ยนทีม</p>
            </div>
            <NumberStepper
              value={breakMinutes}
              min={0}
              max={10}
              onChange={setBreakMinutes}
              suffix="นาที"
            />
          </div>
          <div className="setting-row">
            <div>
              <h2 className="section-title">เวลาเริ่ม</h2>
              <p className="section-note">คำนวณเวลาทุกแมตช์ใหม่</p>
            </div>
            <input
              aria-label="เวลาเริ่ม"
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-base font-black"
            />
          </div>
          <div className="setting-row">
            <div>
              <h2 className="section-title">เวลาจบ</h2>
              <p className="section-note">เพิ่มหรือลดเกมที่ยังไม่เริ่ม</p>
            </div>
            <input
              aria-label="เวลาจบ"
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-base font-black"
            />
          </div>
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <div>
              <h2 className="section-title">
                {finishedCount > 0 ? 'กำหนดคู่ถัดไป' : 'กำหนดคู่เริ่มต้น'}
              </h2>
              <p className="section-note">
                {finishedCount > 0
                  ? 'เรียงเฉพาะเกมที่ยังไม่จบ ผลการแข่งขันเดิมจะไม่ถูกย้าย'
                  : 'เลือกได้ 1 หรือ 2 คู่ เผื่อบางทีมยังมาไม่ครบ'}
              </p>
            </div>
            {remainingAfterSave > 0 ? (
              <>
                <SettingsPairPicker
                  label={finishedCount > 0 ? 'คู่ถัดไป' : 'คู่แรก'}
                  teams={tournament.teams}
                  teamAId={firstPairA}
                  teamBId={firstPairB}
                  onTeamAChange={setFirstPairA}
                  onTeamBChange={setFirstPairB}
                />
                <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-1 text-sm font-black">
                  <span>กำหนดคู่ที่ 2 ด้วย</span>
                  <input
                    type="checkbox"
                    checked={useSecondPair}
                    onChange={(event) => setUseSecondPair(event.target.checked)}
                    disabled={remainingAfterSave < 2}
                    className="h-5 w-5 accent-[#11823b]"
                  />
                </label>
                {useSecondPair && (
                  <SettingsPairPicker
                    label={finishedCount > 0 ? 'คู่ต่อจากนั้น' : 'คู่ที่ 2'}
                    teams={tournament.teams}
                    teamAId={secondPairA}
                    teamBId={secondPairB}
                    onTeamAChange={setSecondPairA}
                    onTeamBChange={setSecondPairB}
                  />
                )}
                {useSecondPair && remainingAfterSave < 2 && (
                  <p className="text-sm font-bold text-amber-700">
                    เวลาที่ตั้งไว้เหลือเพียง 1 แมตช์ กรุณาปิดคู่ที่ 2 หรือเพิ่มเวลาจบ
                  </p>
                )}
                {samePairTwice && (
                  <p className="text-sm font-bold text-amber-700">
                    คู่แรกและคู่ที่ 2 ต้องไม่เป็นคู่เดียวกัน
                  </p>
                )}
              </>
            ) : (
              <p className="rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-500">
                ไม่มีแมตช์ที่ยังไม่จบให้จัดลำดับ
              </p>
            )}
          </div>
          <div
            className={`rounded-2xl p-3 text-sm font-bold ${valid ? 'bg-[#eef9f1] text-[#087632]' : 'bg-amber-50 text-amber-700'}`}
          >
            {availableMinutes <= 0
              ? 'เวลาจบต้องอยู่หลังเวลาเริ่ม'
              : `หลังบันทึกจะมี ${resultingCount} แมตช์ · ผลที่แข่งแล้วจะถูกเก็บไว้ทั้งหมด`}
          </div>
          <Button
            onClick={saveSettings}
            disabled={!valid}
            className="h-13 w-full rounded-xl bg-[#11823b] font-black"
          >
            <Save />
            บันทึกการตั้งค่า
          </Button>
        </section>
        <section className="settings-card">
          <h2 className="section-title">ทางลัด</h2>
          <p className="section-note mt-1">
            จำนวนทีมและรายชื่อผู้เล่นแก้ได้จากหน้าทีม โดยไม่กระทบผลแข่ง
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              onClick={onTeams}
              variant="outline"
              className="h-12 rounded-xl font-black"
            >
              <Users />
              จัดการทีม
            </Button>
            <Button
              onClick={onGames}
              variant="outline"
              className="h-12 rounded-xl font-black"
            >
              <FolderOpen />
              เกมทั้งหมด
            </Button>
          </div>
          <Button
            onClick={onCreateNew}
            variant="outline"
            className="mt-2 h-12 w-full rounded-xl font-black"
          >
            <Plus />
            สร้างตารางใหม่
          </Button>
        </section>
        <Button
          variant="destructive"
          onClick={() => setConfirming(true)}
          className="h-12 w-full rounded-xl font-black"
        >
          <Trash2 />
          {gameId ? 'ออกจากเกมนี้' : 'ลบเกมบนอุปกรณ์นี้'}
        </Button>
      </div>
      {confirming && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/25 p-4 backdrop-blur-sm">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reset-title"
            aria-describedby="reset-description"
            className="w-full max-w-sm rounded-[24px] bg-white p-5 shadow-2xl"
          >
            <h2 id="reset-title" className="text-lg font-black">
              ลบการแข่งขันนี้?
            </h2>
            <p
              id="reset-description"
              className="mt-2 text-sm font-semibold leading-6 text-slate-500"
            >
              {gameId
                ? 'เกมยังอยู่ในลิงก์เดิมและเปิดกลับมาได้ การออกจะล้างเฉพาะเกมที่เปิดอยู่บนอุปกรณ์นี้'
                : 'ทีม รายชื่อผู้เล่น ตารางแข่งขัน และประวัติ GK จะถูกลบจากอุปกรณ์นี้'}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={() => setConfirming(false)}
                className="h-12 rounded-xl font-black"
              >
                ยกเลิก
              </Button>
              <Button
                variant="destructive"
                onClick={onReset}
                className="h-12 rounded-xl font-black"
              >
                ลบทั้งหมด
              </Button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export default function FootballApp() {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [gameId, setGameId] = useState('');
  const [setupSource, setSetupSource] = useState<Tournament | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<AppView>('home');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [notice, setNotice] = useState('');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local');
  const tournamentRef = useRef<Tournament | null>(null);
  const lastRemoteStateRef = useRef('');
  const lastLocalChangeRef = useRef(0);
  const lastExitFlushRef = useRef('');
  /* oxlint-disable react/react-compiler -- hydration intentionally reads browser-only and remote state once. */
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      restoreGitHubPagesPath();
      const pathGameId = gameIdFromPath();
      if (pathGameId) {
        setGameId(pathGameId);
        try {
          const game = await loadSharedGame(pathGameId);
          if (cancelled) return;
          if (game) {
            const value = extendTournamentToEndTime(game.state);
            lastRemoteStateRef.current = JSON.stringify(value);
            setTournament(value);
            setSyncStatus('saved');
            writeLocalBackup(value, pathGameId);
          } else {
            setNotice('ไม่พบเกมจากลิงก์นี้');
          }
        } catch {
          if (cancelled) return;
          const backup = readLocalBackup();
          if (backup.tournament && backup.gameId === pathGameId) {
            setTournament(extendTournamentToEndTime(backup.tournament));
            setSyncStatus('error');
            setNotice('เชื่อมต่อเกมไม่ได้ กำลังใช้ข้อมูลสำรองของเกมนี้');
          } else {
            setNotice('เชื่อมต่อเกมจากลิงก์นี้ไม่ได้ กรุณาลองใหม่');
          }
        } finally {
          if (!cancelled) setHydrated(true);
        }
        return;
      }

      setTournament(null);
      setGameId('');
      setSyncStatus('local');
      setView('home');
      if (!cancelled) setHydrated(true);
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);
  /* oxlint-enable react/react-compiler */
  useEffect(() => {
    tournamentRef.current = tournament;
    if (!hydrated) return;
    if (tournament) {
      writeLocalBackup(tournament, gameId);
      if (!gameId) {
        return;
      }
      const serialized = JSON.stringify(tournament);
      if (serialized === lastRemoteStateRef.current) return;
      lastLocalChangeRef.current = Date.now();
      const timer = window.setTimeout(() => {
        void saveSharedGame(gameId, tournament)
          .then((game) => {
            lastRemoteStateRef.current = JSON.stringify(game.state);
            if (JSON.stringify(tournamentRef.current) === serialized)
              setSyncStatus('saved');
          })
          .catch(() => {
            setSyncStatus('error');
            setNotice('ยังซิงก์ไม่ได้ แต่ข้อมูลสำรองอยู่ในเครื่อง');
          });
      }, 450);
      return () => window.clearTimeout(timer);
    }
    clearLocalBackup();
  }, [tournament, hydrated, gameId]);
  useEffect(() => {
    if (!hydrated || !gameId) return;
    const flushLatestState = () => {
      const value = tournamentRef.current;
      if (!value) return;
      const serialized = JSON.stringify(value);
      if (
        serialized === lastRemoteStateRef.current ||
        serialized === lastExitFlushRef.current
      )
        return;
      lastExitFlushRef.current = serialized;
      void saveSharedGame(gameId, value, { keepalive: true })
        .then((game) => {
          lastRemoteStateRef.current = JSON.stringify(game.state);
          if (JSON.stringify(tournamentRef.current) === serialized)
            setSyncStatus('saved');
        })
        .catch(() => {
          lastExitFlushRef.current = '';
          setSyncStatus('error');
        });
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') flushLatestState();
    };
    window.addEventListener('pagehide', flushLatestState);
    document.addEventListener('visibilitychange', flushWhenHidden);
    return () => {
      window.removeEventListener('pagehide', flushLatestState);
      document.removeEventListener('visibilitychange', flushWhenHidden);
    };
  }, [hydrated, gameId]);
  useEffect(() => {
    if (!hydrated || !gameId) return;
    const poll = window.setInterval(() => {
      if (Date.now() - lastLocalChangeRef.current < 1600) return;
      void loadSharedGame(gameId)
        .then((game) => {
          if (!game) return;
          const serialized = JSON.stringify(game.state);
          lastRemoteStateRef.current = serialized;
          if (serialized !== JSON.stringify(tournamentRef.current)) {
            setTournament(extendTournamentToEndTime(game.state));
            setSyncStatus('saved');
          }
        })
        .catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(poll);
  }, [hydrated, gameId]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2200);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options?: { signal?: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await context.registerTool(
        {
          name: 'load_demo_tournament',
          title: 'Load demo tournament',
          description:
            'Load a four-team evening football tournament with a repeating round-robin schedule and per-team goalkeeper rotations into the visible app.',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute: () => {
            const demo = createDemoTournament();
            tournamentRef.current = demo;
            lastRemoteStateRef.current = '';
            setGameId('');
            setSyncStatus('local');
            setTournament(demo);
            window.history.replaceState({}, '', gamePath());
            setView('home');
            return {
              status: 'loaded',
              teams: demo.teams.length,
              matches: demo.matches.length,
            };
          },
        },
        { signal: lifecycle.signal },
      );
      await context.registerTool(
        {
          name: 'get_matchday_summary',
          title: 'Get matchday summary',
          description:
            'Read the current tournament name, progress, current match, and next match from the visible app.',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute: () => {
            const value = tournamentRef.current;
            if (!value) return { status: 'empty' };
            const current = value.matches.find(
              (match) => match.status === 'current',
            );
            const next = current
              ? nextMatchAfter(value, current)
              : value.matches.find((match) => match.status === 'upcoming');
            return {
              status: 'ready',
              name: value.name,
              completedMatches: value.matches.filter(
                (match) => match.status === 'finished',
              ).length,
              totalMatches: value.matches.length,
              currentMatchNumber: current?.matchNumber ?? null,
              nextMatchNumber: next?.matchNumber ?? null,
            };
          },
        },
        { signal: lifecycle.signal },
      );
    };
    void register().catch(() => undefined);
    return () => lifecycle.abort();
  }, []);
  function applyTournament(value: Tournament) {
    tournamentRef.current = value;
    lastExitFlushRef.current = '';
    setSyncStatus(
      gameId && JSON.stringify(value) !== lastRemoteStateRef.current
        ? 'saving'
        : gameId
          ? 'saved'
          : 'local',
    );
    setTournament(value);
  }
  async function publishTournament(value: Tournament, message: string) {
    tournamentRef.current = value;
    lastRemoteStateRef.current = '';
    lastExitFlushRef.current = '';
    setGameId('');
    setSyncStatus('saving');
    setTournament(value);
    setSelectedTeamId(value.teams[0]?.id ?? '');
    setView('home');
    window.history.replaceState({}, '', gamePath());
    try {
      const game = await createSharedGame(value, bangkokDateCode());
      lastRemoteStateRef.current = JSON.stringify(game.state);
      setGameId(game.id);
      setTournament(game.state);
      tournamentRef.current = game.state;
      setSyncStatus('saved');
      window.history.pushState({}, '', gamePath(game.id));
      setNotice(`${message} · แชร์ลิงก์นี้ให้เพื่อนได้เลย`);
    } catch {
      setSyncStatus('local');
      setNotice(`${message}ในเครื่อง แต่ยังสร้างลิงก์ไม่ได้`);
    }
  }
  function loadDemo() {
    const demo = createDemoTournament();
    void publishTournament(demo, 'โหลดข้อมูลตัวอย่างแล้ว');
  }
  function openNewSetup() {
    setSetupSource(null);
    setView('setup');
  }
  function openTeam(id: string) {
    setSelectedTeamId(id);
    setView('team-detail');
  }
  function openMatch(id: string) {
    setSelectedMatchId(id);
    setView('match-detail');
  }
  async function openSharedGame(gameIdToOpen: string) {
    try {
      const game = await loadSharedGame(gameIdToOpen);
      if (!game) {
        setNotice('ไม่พบเกมนี้ในฐานข้อมูล');
        return;
      }
      const value = extendTournamentToEndTime(game.state);
      lastRemoteStateRef.current = JSON.stringify(value);
      setGameId(game.id);
      setTournament(value);
      tournamentRef.current = value;
      setSyncStatus('saved');
      setSelectedTeamId(value.teams[0]?.id ?? '');
      setSelectedMatchId('');
      window.history.pushState({}, '', gamePath(game.id));
      setView('home');
    } catch {
      setNotice('เปิดเกมไม่สำเร็จ กรุณาลองใหม่');
    }
  }
  function handleDeletedGame(deletedGameId: string) {
    if (deletedGameId !== gameId) return;
    setTournament(null);
    setGameId('');
    setSyncStatus('local');
    lastRemoteStateRef.current = '';
    window.history.replaceState({}, '', gamePath());
  }
  const mainView: MainView = [
    'home',
    'teams',
    'schedule',
    'tactics',
    'settings',
  ].includes(view)
    ? (view as MainView)
    : view === 'team-detail'
      ? 'teams'
      : view === 'match-detail' || view === 'standings'
        ? 'schedule'
        : 'home';
  const selectedTeam =
    tournament?.teams.find((team) => team.id === selectedTeamId) ??
    tournament?.teams[0];
  const selectedMatch = tournament?.matches.find(
    (match) => match.id === selectedMatchId,
  );
  if (!hydrated)
    return (
      <main className="grid min-h-dvh place-items-center bg-[#edf3ee]">
        <div className="flex items-center gap-3 font-black text-[#11823b]">
          <Shield className="h-8 w-8 animate-pulse fill-current" />
          กำลังเตรียมสนาม…
        </div>
      </main>
    );
  return (
    <main className="min-h-dvh bg-[#edf3ee] text-slate-950 sm:py-7">
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-[#f8faf8] shadow-[0_22px_70px_rgba(15,45,29,.15)] sm:min-h-[844px] sm:overflow-hidden sm:rounded-[32px] sm:border sm:border-white">
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-none">
          {!tournament && !['setup', 'games'].includes(view) && (
            <>
              <PageHeader
                title="Football Match Maker"
                eyebrow="Ready when you are"
              />
              <EmptyHome
                onSetup={openNewSetup}
                onDemo={loadDemo}
                onGames={() => setView('games')}
              />
            </>
          )}
          {view === 'games' && (
            <GamesScreen
              onBack={() => setView('home')}
              onOpen={(id) => void openSharedGame(id)}
              onDeleted={handleDeletedGame}
              onNotice={setNotice}
            />
          )}
          {view === 'setup' && (
            <SetupScreen
              tournament={setupSource}
              onCancel={() => setView('home')}
              onCreate={(value) => {
                setSetupSource(null);
                void publishTournament(value, 'สร้างตารางใหม่แล้ว');
              }}
            />
          )}
          {tournament && view === 'home' && (
            <HomeScreen
              tournament={tournament}
              syncStatus={syncStatus}
              onNavigate={setView}
              onOpenMatch={openMatch}
              onUpdate={applyTournament}
            />
          )}
          {tournament && view === 'teams' && (
            <TeamsScreen tournament={tournament} onOpenTeam={openTeam} />
          )}
          {tournament && view === 'team-detail' && selectedTeam && (
            <TeamDetailScreen
              team={selectedTeam}
              onBack={() => setView('teams')}
              onUpdate={(team) =>
                applyTournament(
                  assignGoalkeepers({
                    ...tournament,
                    teams: tournament.teams.map((item) =>
                      item.id === team.id ? team : item,
                    ),
                  }),
                )
              }
            />
          )}
          {tournament && view === 'schedule' && (
            <ScheduleScreen
              tournament={tournament}
              onOpenMatch={openMatch}
              onUpdate={applyTournament}
              onStandings={() => setView('standings')}
            />
          )}
          {tournament && view === 'tactics' && (
            <TacticsScreen
              tournament={tournament}
              onUpdate={applyTournament}
            />
          )}
          {tournament && view === 'standings' && (
            <StandingsScreen
              tournament={tournament}
              onBack={() => setView('schedule')}
            />
          )}
          {tournament && view === 'match-detail' && selectedMatch && (
            <MatchDetailScreen
              tournament={tournament}
              match={selectedMatch}
              onBack={() => setView('schedule')}
              onUpdate={applyTournament}
            />
          )}
          {tournament && view === 'share' && (
            <ShareScreen
              tournament={tournament}
              gameId={gameId}
              onBack={() => setView('home')}
              onNotice={setNotice}
            />
          )}
          {tournament && view === 'settings' && (
            <SettingsScreen
              key={gameId || tournament.id}
              tournament={tournament}
              gameId={gameId}
              onCreateNew={openNewSetup}
              onSave={(value) => {
                applyTournament(value);
                setNotice('บันทึกการตั้งค่าแล้ว');
              }}
              onGames={() => setView('games')}
              onTeams={() => setView('teams')}
              onReset={() => {
                setTournament(null);
                setGameId('');
                setSyncStatus('local');
                lastRemoteStateRef.current = '';
                window.history.pushState({}, '', gamePath());
                setView('home');
                setNotice(gameId ? 'ออกจากเกมนี้แล้ว' : 'ลบการแข่งขันแล้ว');
              }}
            />
          )}
        </div>
        {tournament &&
          !['setup', 'match-detail', 'team-detail', 'share', 'games'].includes(
            view,
          ) && (
            <BottomNavigation active={mainView} onChange={setView} />
          )}
        {notice && (
          <output className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-black whitespace-nowrap text-white shadow-xl">
            <CircleCheck className="h-4 w-4 text-emerald-400" />
            {notice}
          </output>
        )}
      </div>
    </main>
  );
}
