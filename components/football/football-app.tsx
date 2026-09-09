'use client';

import {
  CalendarDays,
  CalendarRange,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Cloud,
  CloudOff,
  Copy,
  Download,
  FolderOpen,
  GripVertical,
  LoaderCircle,
  Lock,
  LockOpen,
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
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  calculateTopScorers,
  createPlayer,
  createTournament,
  extendTournamentByMatches,
  extendTournamentToEndTime,
  finishMatchWithScore,
  makeId,
  minutesBetween,
  pairMeetingCount,
  recommendUpcomingPairs,
  reshuffleUpcomingMatches,
  reopenFinishedMatch,
  reorder,
  scheduleMetrics,
  scheduleWindowMetrics,
  setMatchScore,
  setMatchScorers,
  setMatchStatus,
  shuffle,
  updateTournamentSettings,
} from '@/lib/football-engine';
import {
  PLAYER_POSITIONS,
  TEAM_COLORS,
  type Match,
  type MatchScorer,
  type PlayerPosition,
  type Team,
  type TeamColor,
  type Tournament,
} from '@/lib/football-types';
import {
  ClientOutdatedError,
  CorruptGameStateError,
  createSharedGame,
  deleteSharedGame,
  type FootballGameSummary,
  type StoredFootballGame,
  listSharedGames,
  loadSharedGame,
  prefetchSharedGames,
  readCachedSharedGames,
  RevisionConflictError,
  saveSharedGame,
} from '@/lib/football-data-api';
import { parseTournament } from '@/lib/football-schema';
import { newestPendingState, syncRetryDelayMs } from '@/lib/football-sync';
const TacticsScreen = lazy(() =>
  import('./tactics-board').then((module) => ({
    default: module.TacticsScreen,
  })),
);

const STORAGE_KEY = 'football-match-maker-v1';
const STORAGE_GAME_ID_KEY = 'football-match-maker-game-id';
const STORAGE_PENDING_SYNC_KEY = 'football-match-maker-pending-sync';
const STORAGE_GAME_BACKUP_PREFIX = 'football-match-maker-game-backup-v2:';
const MAX_SYNCED_GAME_BACKUPS = 12;
const PAGES_PATH_KEY = 'football-pages-path';
const ALL_GAMES_PATH_SEGMENT = 'allgames';
const GAME_ID_PATTERN = /^game\d{8}-[1-9]\d*$/;
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const PLAYER_POSITION_META: Record<
  PlayerPosition,
  { shortLabel: string; fullLabel: string; className: string }
> = {
  defender: {
    shortLabel: 'D',
    fullLabel: 'กองหลัง',
    className: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  midfielder: {
    shortLabel: 'M',
    fullLabel: 'กองกลาง',
    className: 'border-violet-200 bg-violet-50 text-violet-700',
  },
  winger: {
    shortLabel: 'W',
    fullLabel: 'ปีก',
    className: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  },
  forward: {
    shortLabel: 'F',
    fullLabel: 'กองหน้า',
    className: 'border-rose-200 bg-rose-50 text-rose-700',
  },
};
type AppView =
  | MainView
  | 'setup'
  | 'team-detail'
  | 'match-detail'
  | 'standings'
  | 'share'
  | 'games';
type SyncStatus =
  | 'local'
  | 'loading'
  | 'saving'
  | 'saved'
  | 'error'
  | 'conflict';

function gameBackupKey(gameId: string) {
  return `${STORAGE_GAME_BACKUP_PREFIX}${gameId}`;
}

function pruneSyncedGameBackups() {
  try {
    const syncedBackups: { key: string; savedAt: number }[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(STORAGE_GAME_BACKUP_PREFIX)) continue;
      const stored = localStorage.getItem(key);
      if (!stored) continue;
      let backup: { pendingSync?: unknown; savedAt?: unknown };
      try {
        backup = JSON.parse(stored) as typeof backup;
      } catch {
        continue;
      }
      // Pending edits may be the only unsynced copy, so never prune them.
      if (backup.pendingSync === true) continue;
      syncedBackups.push({
        key,
        savedAt:
          typeof backup.savedAt === 'number' && Number.isFinite(backup.savedAt)
            ? backup.savedAt
            : 0,
      });
    }
    syncedBackups
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(MAX_SYNCED_GAME_BACKUPS)
      .forEach(({ key }) => localStorage.removeItem(key));
  } catch {
    // Browser storage is only a best-effort offline backup.
  }
}

// Returns the message for a failure that retrying cannot fix, and an empty
// string for ordinary errors that should keep retrying.
function blockingSyncNotice(error: unknown) {
  if (error instanceof ClientOutdatedError)
    return 'แอปเวอร์ชันนี้เก่ากว่าฐานข้อมูล กรุณารีเฟรชหน้าเพื่อซิงก์ต่อ';
  if (error instanceof CorruptGameStateError)
    return 'ข้อมูลเกมนี้เสียหาย จึงซิงก์ต่อไม่ได้';
  return '';
}

function readLocalBackup(gameId = '') {
  try {
    if (gameId) {
      const storedGame = localStorage.getItem(gameBackupKey(gameId));
      if (storedGame) {
        const backup = JSON.parse(storedGame) as {
          tournament?: unknown;
          pendingSync?: unknown;
        };
        return {
          tournament: parseTournament(backup.tournament),
          gameId,
          pendingSync: backup.pendingSync === true,
        };
      }
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    const tournament = stored ? parseTournament(JSON.parse(stored)) : null;
    const legacyGameId = localStorage.getItem(STORAGE_GAME_ID_KEY);
    if (gameId && legacyGameId !== gameId)
      return { tournament: null, gameId, pendingSync: false };
    if (!gameId && legacyGameId)
      return { tournament: null, gameId: null, pendingSync: false };
    return {
      tournament,
      gameId: legacyGameId,
      pendingSync: localStorage.getItem(STORAGE_PENDING_SYNC_KEY) === '1',
    };
  } catch {
    return { tournament: null, gameId: null, pendingSync: false };
  }
}

function writeLocalBackup(
  tournament: Tournament,
  gameId = '',
  pendingSync = false,
) {
  try {
    if (gameId) {
      localStorage.setItem(
        gameBackupKey(gameId),
        JSON.stringify({ tournament, pendingSync, savedAt: Date.now() }),
      );
      pruneSyncedGameBackups();
      if (localStorage.getItem(STORAGE_GAME_ID_KEY) === gameId) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_GAME_ID_KEY);
        localStorage.removeItem(STORAGE_PENDING_SYNC_KEY);
      }
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tournament));
    localStorage.removeItem(STORAGE_GAME_ID_KEY);
    localStorage.removeItem(STORAGE_PENDING_SYNC_KEY);
  } catch {
    // Neon remains the source of truth when browser storage is unavailable.
  }
}

function clearLocalBackup(gameId = '') {
  try {
    if (gameId) {
      localStorage.removeItem(gameBackupKey(gameId));
      if (localStorage.getItem(STORAGE_GAME_ID_KEY) !== gameId) return;
    }
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_GAME_ID_KEY);
    localStorage.removeItem(STORAGE_PENDING_SYNC_KEY);
  } catch {
    // Browser storage is only a best-effort offline backup.
  }
}

function markLocalBackupSyncedIfUnchanged(gameId: string, saved: Tournament) {
  const backup = readLocalBackup(gameId);
  if (
    backup.tournament &&
    JSON.stringify(backup.tournament) === JSON.stringify(saved)
  )
    writeLocalBackup(saved, gameId, false);
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

function routeSegmentFromPath() {
  const path = window.location.pathname;
  const relativePath =
    BASE_PATH && path.startsWith(BASE_PATH)
      ? path.slice(BASE_PATH.length)
      : path;
  return relativePath.split('/').filter(Boolean)[0] ?? '';
}

function gameIdFromPath() {
  const candidate = routeSegmentFromPath();
  return GAME_ID_PATTERN.test(candidate) ? candidate : '';
}

function allGamesFromPath() {
  return routeSegmentFromPath() === ALL_GAMES_PATH_SEGMENT;
}

function gamePath(gameId?: string) {
  const root = `${BASE_PATH || ''}/`.replace(/\/+/g, '/');
  return gameId ? `${root}${gameId}` : root;
}

function allGamesPath() {
  return `${gamePath()}${ALL_GAMES_PATH_SEGMENT}`;
}

function bangkokDateCode() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}${value.month}${value.day}`;
}

function defaultGameName() {
  const date = new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date());
  return `Friendly Match · ${date}`;
}

function scheduledEndTime(tournament: Tournament) {
  const lastMatch = tournament.matches.at(-1);
  return lastMatch
    ? addMinutes(lastMatch.startTime, tournament.matchDurationMinutes)
    : tournament.startTime;
}

function isNextDayTime(tournament: Tournament, time: string) {
  return time < tournament.startTime;
}

function displayTournamentTime(tournament: Tournament, time: string) {
  return `${time}${isNextDayTime(tournament, time) ? ' (+1 วัน)' : ''}`;
}

function displayMatchTimeRange(tournament: Tournament, match: Match) {
  const endTime = addMinutes(match.startTime, tournament.matchDurationMinutes);
  const startsNextDay = isNextDayTime(tournament, match.startTime);
  const endsNextDay = startsNextDay || endTime < match.startTime;
  return `${match.startTime}${startsNextDay ? ' (+1 วัน)' : ''}–${endTime}${endsNextDay ? ' (+1 วัน)' : ''}`;
}

function formatShareText(tournament: Tournament) {
  const standings = calculateStandings(tournament);
  const topScorers = calculateTopScorers(tournament, 3);
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
  if (topScorers.length) {
    lines.push('', '🔥 ดาวซัลโว');
    topScorers.forEach((scorer, index) => {
      const team = tournament.teams.find((item) => item.id === scorer.teamId);
      lines.push(
        `${index + 1}. ${scorer.playerName}${team ? ` (${team.name})` : ''} — ${scorer.goals} ประตู`,
      );
    });
  }
  lines.push(
    '',
    `เวลาตามตาราง ${tournament.startTime}–${displayTournamentTime(tournament, scheduledEndTime(tournament))}`,
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
  onEditingChange,
}: {
  label: string;
  color: TeamColor;
  score: string;
  onChange: (score: string) => void;
  onEditingChange?: (editing: boolean) => void;
}) {
  const numericScore = Number.parseInt(score, 10) || 0;
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <div className="flex min-w-0 items-center justify-center gap-2">
        <TeamShirtIcon color={color} size="xs" />
        <p className="truncate text-sm font-black">{label}</p>
      </div>
      <div className="mt-2 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => onChange(String(Math.max(0, numericScore - 1)))}
          disabled={numericScore === 0}
          aria-label={`ลดสกอร์ ${label}`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white disabled:opacity-35"
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
          onFocus={(event) => {
            event.currentTarget.select();
            onEditingChange?.(true);
          }}
          onBlur={() => {
            if (!score) onChange('0');
            onEditingChange?.(false);
          }}
          aria-label={`สกอร์ทีม ${label}`}
          className="h-11 w-14 shrink-0 rounded-xl border border-slate-200 bg-white text-center text-xl font-black tabular-nums outline-none focus:border-[#35a95f]"
        />
        <button
          type="button"
          onClick={() => onChange(String(Math.min(99, numericScore + 1)))}
          disabled={numericScore >= 99}
          aria-label={`เพิ่มสกอร์ ${label}`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e5f5e9] text-[#087632] disabled:opacity-35"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ScorerEditor({
  tournament,
  match,
  onUpdate,
  teamAScore = match.teamAScore ?? 0,
  teamBScore = match.teamBScore ?? 0,
  compact = false,
}: {
  tournament: Tournament;
  match: Match;
  onUpdate: (value: Tournament) => void;
  teamAScore?: number;
  teamBScore?: number;
  compact?: boolean;
}) {
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const sides = [
    {
      teamId: match.teamAId,
      score: teamAScore,
    },
    {
      teamId: match.teamBId,
      score: teamBScore,
    },
  ];

  function saveScorers(scorers: MatchScorer[]) {
    onUpdate(setMatchScorers(tournament, match.id, scorers));
  }

  function addScorer(teamId: string, score: number) {
    const name = (draftNames[teamId] ?? '').trim();
    const team = tournament.teams.find((item) => item.id === teamId);
    if (!name || !team || score <= 0) return;
    const teamScorers = (match.scorers ?? []).filter(
      (scorer) => scorer.teamId === teamId,
    );
    if (teamScorers.reduce((total, scorer) => total + scorer.goals, 0) >= score)
      return;
    const player = team.players.find(
      (item) =>
        item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    const existing = (match.scorers ?? []).find(
      (scorer) =>
        scorer.teamId === teamId &&
        (player
          ? scorer.playerId === player.id
          : !scorer.playerId &&
            scorer.playerName.toLocaleLowerCase() === name.toLocaleLowerCase()),
    );
    const next = existing
      ? (match.scorers ?? []).map((scorer) =>
          scorer.id === existing.id
            ? { ...scorer, goals: scorer.goals + 1 }
            : scorer,
        )
      : [
          ...(match.scorers ?? []),
          {
            id: makeId('scorer'),
            teamId,
            playerId: player?.id,
            playerName: player?.name ?? name,
            goals: 1,
          },
        ];
    saveScorers(next);
    setDraftNames((current) => ({ ...current, [teamId]: '' }));
  }

  function changeGoals(scorerId: string, delta: number, score: number) {
    const target = (match.scorers ?? []).find(
      (scorer) => scorer.id === scorerId,
    );
    if (!target) return;
    const attributed = (match.scorers ?? [])
      .filter((scorer) => scorer.teamId === target.teamId)
      .reduce((total, scorer) => total + scorer.goals, 0);
    if (delta > 0 && attributed >= score) return;
    saveScorers(
      (match.scorers ?? []).flatMap((scorer) => {
        if (scorer.id !== scorerId) return [scorer];
        const goals = scorer.goals + delta;
        return goals > 0 ? [{ ...scorer, goals }] : [];
      }),
    );
  }

  const attributedGoals = (match.scorers ?? []).reduce(
    (total, scorer) => total + scorer.goals,
    0,
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${compact ? 'mt-3' : 'mt-4'} flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition-colors hover:bg-slate-50`}
      >
        <span className="flex min-w-0 items-center gap-2 text-sm font-black text-slate-800">
          <span aria-hidden="true">⚽</span>
          บันทึกผู้ทำประตู
        </span>
        <span
          className={`shrink-0 text-xs font-black ${attributedGoals ? 'text-[#087632]' : 'text-slate-400'}`}
        >
          {attributedGoals ? `ระบุแล้ว ${attributedGoals} ประตู` : 'ไม่บังคับ'}
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88dvh] overflow-y-auto rounded-[24px] bg-white p-4 sm:max-w-md">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="text-lg font-black text-slate-950">
              บันทึกผู้ทำประตู
            </DialogTitle>
            <DialogDescription className="font-semibold leading-5 text-slate-500">
              ไม่บังคับ · เพิ่มเฉพาะเมื่ออยากเก็บอันดับดาวซัลโว
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            {sides.map((side) => {
              const team = tournament.teams.find(
                (item) => item.id === side.teamId,
              );
              if (!team) return null;
              const scorers = (match.scorers ?? []).filter(
                (scorer) => scorer.teamId === side.teamId,
              );
              const attributed = scorers.reduce(
                (total, scorer) => total + scorer.goals,
                0,
              );
              const listId = `players-${match.id}-${side.teamId}`;
              return (
                <div key={side.teamId} className="rounded-2xl bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <TeamShirtIcon color={team.color} size="xs" />
                      <span className="truncate text-sm font-black">
                        {team.name}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-black ${attributed > side.score ? 'text-red-600' : 'text-slate-400'}`}
                    >
                      ระบุ {attributed}/{side.score}
                    </span>
                  </div>
                  <form
                    className="mt-2 flex gap-1.5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      addScorer(side.teamId, side.score);
                    }}
                  >
                    <input
                      list={listId}
                      value={draftNames[side.teamId] ?? ''}
                      disabled={side.score <= 0 || attributed >= side.score}
                      onChange={(event) =>
                        setDraftNames((current) => ({
                          ...current,
                          [side.teamId]: event.target.value.slice(0, 60),
                        }))
                      }
                      placeholder={side.score > 0 ? 'ชื่อคนยิง' : 'เพิ่มสกอร์ก่อน'}
                      aria-label={`ชื่อผู้ทำประตูทีม ${team.name}`}
                      className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-[#35a95f] disabled:bg-slate-100"
                    />
                    <datalist id={listId}>
                      {team.players
                        .filter((player) => !player.absentToday)
                        .map((player) => (
                          <option key={player.id} value={player.name}>
                            {player.name}
                          </option>
                        ))}
                    </datalist>
                    <button
                      type="submit"
                      disabled={
                        side.score <= 0 ||
                        attributed >= side.score ||
                        !(draftNames[side.teamId] ?? '').trim()
                      }
                      className="h-10 shrink-0 rounded-xl bg-[#e5f5e9] px-3 text-sm font-black text-[#087632] disabled:opacity-40"
                    >
                      เพิ่ม
                    </button>
                  </form>
                  {scorers.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {scorers.map((scorer) => (
                        <div
                          key={scorer.id}
                          className="flex min-w-0 items-center gap-1 rounded-xl bg-white px-2 py-1.5"
                        >
                          <span className="min-w-0 flex-1 truncate text-sm font-black">
                            {scorer.playerName}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              changeGoals(scorer.id, -1, side.score)
                            }
                            aria-label={`ลดประตู ${scorer.playerName}`}
                            className="grid h-8 w-8 place-items-center rounded-lg bg-slate-50 text-slate-600"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-5 text-center text-sm font-black tabular-nums">
                            {scorer.goals}
                          </span>
                          <button
                            type="button"
                            disabled={attributed >= side.score}
                            onClick={() =>
                              changeGoals(scorer.id, 1, side.score)
                            }
                            aria-label={`เพิ่มประตู ${scorer.playerName}`}
                            className="grid h-8 w-8 place-items-center rounded-lg bg-[#e5f5e9] text-[#087632] disabled:opacity-35"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              saveScorers(
                                (match.scorers ?? []).filter(
                                  (item) => item.id !== scorer.id,
                                ),
                              )
                            }
                            aria-label={`ลบผู้ทำประตู ${scorer.playerName}`}
                            className="grid h-8 w-8 place-items-center text-red-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {attributed > side.score && (
                    <p className="mt-1.5 text-xs font-bold text-red-600">
                      จำนวนผู้ทำประตูมากกว่าสกอร์ โปรดลดจำนวนก่อนจบเกม
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter className="mx-0 mb-0 rounded-xl border-0 bg-white p-0 pt-1">
            <Button
              type="button"
              onClick={() => setOpen(false)}
              className="h-11 w-full rounded-xl bg-[#11823b] font-black"
            >
              เสร็จแล้ว
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
  const hasScorerOverflow = [
    { teamId: match.teamAId, score: normalizedScoreA },
    { teamId: match.teamBId, score: normalizedScoreB },
  ].some(
    (side) =>
      (match.scorers ?? [])
        .filter((scorer) => scorer.teamId === side.teamId)
        .reduce((total, scorer) => total + scorer.goals, 0) > side.score,
  );

  const [editingScore, setEditingScore] = useState(false);
  /* oxlint-disable react/react-compiler -- keep the score editor aligned with remote updates for the same match. */
  useEffect(() => {
    // Adopting a remote score mid-keystroke would wipe the digits being typed,
    // so wait until the field is left before following the shared game again.
    if (editingScore) return;
    setScoreA(String(match.teamAScore ?? 0));
    setScoreB(String(match.teamBScore ?? 0));
  }, [editingScore, match.id, match.teamAScore, match.teamBScore]);
  /* oxlint-enable react/react-compiler */

  function updateDraftScore(team: 'a' | 'b', value: string) {
    if (team === 'a') setScoreA(value);
    else setScoreB(value);
    if (value === '') return;
    onUpdate(
      setMatchScore(
        tournament,
        match.id,
        team === 'a' ? Number.parseInt(value, 10) || 0 : normalizedScoreA,
        team === 'b' ? Number.parseInt(value, 10) || 0 : normalizedScoreB,
      ),
    );
  }

  return (
    <div className="rounded-[22px] border border-[#9dd2ab] bg-white p-4 shadow-[0_8px_24px_rgba(17,130,59,.08)]">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="font-black text-[#087632]">
            {match.status === 'current' ? 'กำลังแข่ง' : 'เกมถัดไป'} ·{' '}
            {displayTournamentTime(tournament, match.startTime)}
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
      <div className="grid grid-cols-1 gap-2 min-[370px]:grid-cols-2">
        <ScorePicker
          label={teamA.name}
          color={teamA.color}
          score={scoreA}
          onChange={(value) => updateDraftScore('a', value)}
          onEditingChange={setEditingScore}
        />
        <ScorePicker
          label={teamB.name}
          color={teamB.color}
          score={scoreB}
          onChange={(value) => updateDraftScore('b', value)}
          onEditingChange={setEditingScore}
        />
      </div>
      <ScorerEditor
        tournament={tournament}
        match={match}
        onUpdate={onUpdate}
        teamAScore={normalizedScoreA}
        teamBScore={normalizedScoreB}
        compact
      />
      <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11px] font-bold text-slate-500">
        <Cloud className="h-3.5 w-3.5 text-[#11823b]" />
        สกอร์ระหว่างแข่งบันทึกอัตโนมัติ กดจบเกมเมื่อแข่งเสร็จ
      </p>
      <div className="mt-3">
        <Button
          type="button"
          disabled={hasScorerOverflow}
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
        {hasScorerOverflow && (
          <p className="mt-1.5 text-center text-xs font-bold text-red-600">
            ผู้ทำประตูรวมมากกว่าสกอร์ จึงยังจบเกมไม่ได้
          </p>
        )}
      </div>
      {next && (
        <div className="mt-3 flex w-full items-center justify-between border-t border-slate-100 pt-3 text-left text-xs font-bold text-slate-500">
          <span>
            เกมถัดไป {displayTournamentTime(tournament, next.startTime)}
          </span>
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
    <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white">
      <table className="w-full table-fixed text-center text-xs sm:text-sm">
        <colgroup>
          <col className="w-[42%]" />
          <col className="w-[10%]" />
          <col className="w-[7%]" />
          <col className="w-[7%]" />
          <col className="w-[7%]" />
          <col className="w-[11%]" />
          <col className="w-[16%]" />
        </colgroup>
        <thead className="bg-[#e5f5e9] text-[#087632]">
          <tr>
            <th className="px-2 py-3 text-left">ทีม</th>
            <th className="px-1 py-3">แข่ง</th>
            <th title="ชนะ" className="border-l border-emerald-100 px-0 py-3">
              ช
            </th>
            <th title="เสมอ" className="border-l border-emerald-100 px-0 py-3">
              ส
            </th>
            <th title="แพ้" className="border-l border-emerald-100 px-0 py-3">
              พ
            </th>
            <th className="px-1 py-3">+/-</th>
            <th className="px-2 py-3">แต้ม</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((standing, index) => {
            const team = tournament.teams.find(
              (item) => item.id === standing.teamId,
            )!;
            return (
              <tr key={standing.teamId} className="border-t border-slate-100">
                <th
                  scope="row"
                  aria-label={`อันดับ ${index + 1} ทีม ${team.name}`}
                  className="px-2 py-3 text-left"
                >
                  <div className="flex min-w-0 items-center gap-1.5 font-black">
                    <span className="w-4 shrink-0 text-center text-slate-400">
                      {index + 1}
                    </span>
                    <TeamShirtIcon color={team.color} size="xs" />
                    <span className="min-w-0 truncate">{team.name}</span>
                  </div>
                </th>
                <td className="px-1 py-3 font-bold">{standing.played}</td>
                <td className="border-l border-slate-100 px-0 py-3 font-bold tabular-nums">
                  {standing.won}
                </td>
                <td className="border-l border-slate-100 px-0 py-3 font-bold tabular-nums">
                  {standing.drawn}
                </td>
                <td className="border-l border-slate-100 px-0 py-3 font-bold tabular-nums">
                  {standing.lost}
                </td>
                <td className="px-1 py-3 font-bold">
                  {standing.goalDifference > 0 ? '+' : ''}
                  {standing.goalDifference}
                </td>
                <td className="px-2 py-3 text-base font-black text-[#087632]">
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
  recoverableDraft,
  onRecover,
  onDiscardDraft,
}: {
  onSetup: () => void;
  onDemo: () => void;
  onGames: () => void;
  recoverableDraft: Tournament | null;
  onRecover: () => void;
  onDiscardDraft: () => void;
}) {
  return (
    <div className="flex min-h-[calc(100dvh-140px)] flex-col items-center justify-center px-7 pb-16 text-center">
      <div className="relative mb-6 grid h-28 w-28 place-items-center rounded-[34px] bg-[#e1f4e6] text-[#11823b]">
        <Shield className="h-14 w-14 fill-current" />
        <span className="absolute -right-2 -top-2 grid h-9 w-9 place-items-center rounded-full bg-white shadow">
          <Plus className="h-5 w-5" />
        </span>
      </div>
      <p className="max-w-xs text-sm font-medium leading-6 text-slate-500">
        สร้างตารางแบบพบกันหมด พร้อมหมุนเวียนผู้รักษาประตูให้ทุกทีม
      </p>
      {recoverableDraft && (
        <section className="mt-5 w-full max-w-xs rounded-2xl border border-amber-200 bg-amber-50 p-3 text-left">
          <p className="truncate font-black text-amber-900">
            มีเกมที่ยังไม่ได้บันทึก: {recoverableDraft.name}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              onClick={onRecover}
              className="h-10 rounded-xl bg-amber-700 font-black"
            >
              เปิดต่อ
            </Button>
            <Button
              onClick={onDiscardDraft}
              variant="outline"
              className="h-10 rounded-xl font-black"
            >
              ไม่ใช้แล้ว
            </Button>
          </div>
        </section>
      )}
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
  gameId,
  syncStatus,
  onNavigate,
  onOpenMatch,
  onUpdate,
  onPublish,
  onCopyLink,
}: {
  tournament: Tournament;
  gameId: string;
  syncStatus: SyncStatus;
  onNavigate: (view: AppView) => void;
  onOpenMatch: (id: string) => void;
  onUpdate: (value: Tournament) => void;
  onPublish: () => void;
  onCopyLink: () => void;
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
            aria-label={`สถานะข้อมูล: ${syncStatus}`}
            title={`สถานะข้อมูล: ${syncStatus}`}
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2 min-[350px]:px-2.5 text-xs font-black ${syncStatus === 'conflict' ? 'bg-orange-50 text-orange-700' : syncStatus === 'error' ? 'bg-red-50 text-red-600' : syncStatus === 'local' ? 'bg-amber-50 text-amber-700' : 'bg-[#e1f4e6] text-[#11823b]'}`}
          >
            {syncStatus === 'saving' || syncStatus === 'loading' ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : syncStatus === 'error' ||
              syncStatus === 'local' ||
              syncStatus === 'conflict' ? (
              <CloudOff className="h-4 w-4" />
            ) : (
              <Cloud className="h-4 w-4" />
            )}
            <span className="hidden min-[350px]:inline">
              {syncStatus === 'loading'
                ? 'กำลังอัปเดต'
                : syncStatus === 'saving'
                  ? 'กำลังบันทึก'
                  : syncStatus === 'saved'
                    ? 'บันทึกแล้ว'
                    : syncStatus === 'error'
                      ? 'ซิงก์ไม่สำเร็จ'
                      : syncStatus === 'conflict'
                        ? 'ข้อมูลชนกัน'
                        : 'เฉพาะเครื่อง'}
            </span>
          </div>
        }
      />
      <div className="space-y-4 px-4 py-4">
        {syncStatus === 'local' && (
          <button
            type="button"
            onClick={onPublish}
            className="flex w-full items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 p-3 text-left text-sm font-black text-amber-900"
          >
            <span>เกมนี้อยู่เฉพาะเครื่อง</span>
            <span className="text-[#087632]">บันทึกขึ้นฐานข้อมูล</span>
          </button>
        )}
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
        {gameId && (
          <button
            type="button"
            onClick={onCopyLink}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[#9dd2ab] bg-[#eef9f1] text-sm font-black text-[#087632] active:scale-[.99]"
          >
            <Copy className="h-4 w-4" />
            คัดลอกลิงก์เกมให้เพื่อน
          </button>
        )}
        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="text-lg font-black">
                {current
                  ? current.status === 'current'
                    ? 'แข่งอยู่ตอนนี้'
                    : 'เกมถัดไป'
                  : 'การแข่งขันจบแล้ว'}
              </p>
              <p className="text-xs font-semibold text-slate-500">
                {current
                  ? 'ใส่สกอร์และจบเกมได้จากหน้านี้'
                  : 'ดูผลการแข่งขันและตารางคะแนนได้ด้านล่าง'}
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
  copyMode = false,
  onCancel,
  onCreate,
}: {
  tournament: Tournament | null;
  copyMode?: boolean;
  onCancel: () => void;
  onCreate: (value: Tournament) => void;
}) {
  const defaultNames = ['Green', 'Red', 'Blue', 'Yellow', 'White', 'Black'];
  const [gameName, setGameName] = useState(
    copyMode && tournament
      ? `${tournament.name} ใหม่`
      : (tournament?.name ?? defaultGameName()),
  );
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
    tournament?.matchDurationMinutes ?? 7,
  );
  const [breakMinutes, setBreakMinutes] = useState(
    tournament?.breakDurationMinutes ?? 1,
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
  const endsNextDay = endTime < startTime;
  const enough =
    hasValidTimeRange && availableMinutes >= metrics.requiredMinutes;
  function changeTeamCount(next: number) {
    setTeamCount(next);
    setFirstTeamIndex((current) => Math.min(current, next - 1));
    setSecondTeamIndex((current) => {
      const first = Math.min(firstTeamIndex, next - 1);
      const bounded = Math.min(current, next - 1);
      return bounded === first ? (first === 0 ? 1 : 0) : bounded;
    });
  }
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
        title={
          copyMode
            ? 'สร้างเกมจากการตั้งค่าเดิม'
            : tournament
              ? 'แก้ไขการแข่งขัน'
              : 'สร้างตารางใหม่'
        }
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
            onChange={changeTeamCount}
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
                      className={`h-10 w-10 rounded-full border-2 ${draft.color === color ? 'ring-2 ring-[#11823b] ring-offset-2' : ''}`}
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
            <h2 className="section-title">กำหนดคู่เปิดสนาม</h2>
            <p className="section-note">
              เลือกสีเสื้อของสองทีมแรกที่จะแข่ง แล้วระบบจะจัดคู่ที่เหลือให้ครบ
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
                onChange={(event) =>
                  setSecondTeamIndex(Number(event.target.value))
                }
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
              <p className="section-note">รองรับ 1 สนาม</p>
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
              <p className="section-note">
                เลือกเวลาที่ต้องการเลิกสนาม{endsNextDay ? ' · วันถัดไป' : ''}
              </p>
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
        eyebrow={`${tournament.teams.length} ทีม · จัดผู้เล่น ตำแหน่ง และคิว GK`}
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

function PlayerPositionPicker({
  playerName,
  positions,
  onChange,
  compact = false,
}: {
  playerName: string;
  positions: PlayerPosition[];
  onChange: (positions: PlayerPosition[]) => void;
  compact?: boolean;
}) {
  return (
    <fieldset
      className={`flex min-w-0 items-center ${compact ? 'shrink-0 flex-nowrap gap-0.5' : 'flex-wrap gap-1.5'}`}
    >
      <legend className="sr-only">ตำแหน่งที่ {playerName || 'ผู้เล่น'} เล่นได้</legend>
      {PLAYER_POSITIONS.map((position) => {
        const meta = PLAYER_POSITION_META[position];
        const selected = positions.includes(position);
        return (
          <button
            key={position}
            type="button"
            aria-pressed={selected}
            aria-label={`${selected ? 'ยกเลิก' : 'เลือก'}${meta.fullLabel}ให้ ${playerName || 'ผู้เล่น'}`}
            title={meta.fullLabel}
            onClick={() =>
              onChange(
                selected
                  ? positions.filter((item) => item !== position)
                  : PLAYER_POSITIONS.filter(
                      (item) => item === position || positions.includes(item),
                    ),
              )
            }
            className={`${compact ? 'grid h-8 w-6 shrink-0 place-items-center rounded-lg p-0 text-[10px]' : 'min-h-9 rounded-full px-3 text-xs'} border font-black transition ${selected ? meta.className : 'border-slate-200 bg-white text-slate-400'}`}
          >
            {meta.shortLabel}
          </button>
        );
      })}
    </fieldset>
  );
}

function rosterSignature(players: Team['players']) {
  return players.map((player) => player.id).join(',');
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
  const [newPositions, setNewPositions] = useState<PlayerPosition[]>([]);
  const [dragPlayers, setDragPlayers] = useState<Team['players'] | null>(null);
  const [draggingPlayerId, setDraggingPlayerId] = useState<string | null>(null);
  const dragPlayersRef = useRef<Team['players'] | null>(null);
  const draggingPlayerIdRef = useRef<string | null>(null);
  const dragBaselineRef = useRef('');
  const rotationLocked = Boolean(team.gkRotationLocked);
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
    if (rotationLocked) return;
    const order = shuffle(eligiblePlayers.map((player) => player.id));
    onUpdate({
      ...team,
      gkRotation: order,
      gkCycleOrders: order.length ? [order] : [],
    });
  }
  function toggleGoalkeeperLock() {
    onUpdate({ ...team, gkRotationLocked: !rotationLocked });
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
  function startPlayerDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
    playerId: string,
  ) {
    if (team.players.length < 2 || event.button !== 0) return;
    event.preventDefault();
    const players = [...team.players];
    dragPlayersRef.current = players;
    dragBaselineRef.current = rosterSignature(team.players);
    draggingPlayerIdRef.current = playerId;
    setDragPlayers(players);
    setDraggingPlayerId(playerId);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function movePlayerDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const players = dragPlayersRef.current;
    const playerId = draggingPlayerIdRef.current;
    if (!playerId || !players) return;
    event.preventDefault();
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-player-id]');
    const targetId = target?.dataset.playerId;
    const fromIndex = players.findIndex((player) => player.id === playerId);
    const toIndex = players.findIndex((player) => player.id === targetId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    const nextPlayers = reorder(players, fromIndex, toIndex);
    dragPlayersRef.current = nextPlayers;
    setDragPlayers(nextPlayers);
  }
  function finishPlayerDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
    saveOrder: boolean,
  ) {
    if (!draggingPlayerIdRef.current) return;
    event.preventDefault();
    const nextPlayers = dragPlayersRef.current;
    const baseline = dragBaselineRef.current;
    dragPlayersRef.current = null;
    draggingPlayerIdRef.current = null;
    setDragPlayers(null);
    setDraggingPlayerId(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    // A sync from another device can rewrite the roster mid-drag; committing
    // the snapshot taken at drag start would silently undo it.
    if (baseline !== rosterSignature(team.players)) return;
    if (saveOrder && nextPlayers) updatePlayers(nextPlayers);
  }
  function addPlayer() {
    const name = newName.trim();
    if (!name) return;
    updatePlayers([...team.players, createPlayer(name, newPositions)]);
    setNewName('');
    setNewPositions([]);
  }
  const displayedPlayers = dragPlayers ?? team.players;
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
              {team.players.length} คน · พร้อม{' '}
              {team.players.filter((player) => !player.absentToday).length}
            </p>
          </div>
        </section>
        <section className="settings-card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="section-title">ลำดับผู้รักษาประตู</h2>
              <p className="section-note">
                {rotationLocked
                  ? 'ล็อกแล้ว · ปลดล็อกก่อนสุ่มลำดับใหม่'
                  : 'วนตามลำดับนี้ในแต่ละเกม'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={randomizeGoalkeepers}
                disabled={eligiblePlayers.length === 0 || rotationLocked}
                variant="outline"
                className="h-10 rounded-xl border-[#9dd2ab] px-3 font-black text-[#087632]"
              >
                <Shuffle />
                สุ่มลำดับ
              </Button>
              <Button
                onClick={toggleGoalkeeperLock}
                variant={rotationLocked ? 'default' : 'outline'}
                aria-pressed={rotationLocked}
                className={`h-10 rounded-xl px-3 font-black ${rotationLocked ? 'bg-slate-900 text-white' : 'border-slate-300 text-slate-700'}`}
              >
                {rotationLocked ? <Lock /> : <LockOpen />}
                {rotationLocked ? 'ปลดล็อก' : 'ล็อกคิว'}
              </Button>
            </div>
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
            <p className="section-note">
              ลากที่หมายเลขเพื่อเรียง · ตำแหน่ง D หลัง · M กลาง · W ปีก · F หน้า
            </p>
          </div>
          <div>
            {team.players.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm font-bold text-slate-400">
                ยังไม่มีผู้เล่น
              </div>
            ) : (
              <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {displayedPlayers.map((player, index) => (
                  <div
                    key={player.id}
                    data-player-id={player.id}
                    className={`flex min-w-0 items-center gap-1.5 px-2 py-2 transition ${draggingPlayerId === player.id ? 'relative z-10 bg-emerald-50 shadow-md' : 'bg-white'}`}
                  >
                    <button
                      type="button"
                      onPointerDown={(event) =>
                        startPlayerDrag(event, player.id)
                      }
                      onPointerMove={movePlayerDrag}
                      onPointerUp={(event) => finishPlayerDrag(event, true)}
                      onPointerCancel={(event) =>
                        finishPlayerDrag(event, false)
                      }
                      className="flex h-9 w-9 shrink-0 touch-none items-center justify-center gap-0.5 rounded-lg bg-[#e6f5ea] text-xs font-black text-[#087632] cursor-grab active:cursor-grabbing"
                      aria-label={`ลากเพื่อย้ายลำดับ ${player.name} ปัจจุบันลำดับ ${index + 1}`}
                      title="กดค้างแล้วลากเพื่อเรียงลำดับ"
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                      {index + 1}
                    </button>
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
                      className={`h-9 min-w-[54px] flex-1 rounded-lg bg-slate-50 px-2 text-sm font-bold outline-none focus:ring-2 focus:ring-[#9dd2ab] ${player.absentToday ? 'text-slate-400 line-through' : ''}`}
                      aria-label={`ชื่อผู้เล่น ${index + 1}`}
                    />
                    <PlayerPositionPicker
                      compact
                      playerName={player.name}
                      positions={player.positions ?? []}
                      onChange={(positions) =>
                        updatePlayers(
                          team.players.map((item) =>
                            item.id === player.id
                              ? { ...item, positions }
                              : item,
                          ),
                        )
                      }
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
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${player.absentToday ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-[#087632]'}`}
                      aria-label={`${player.absentToday ? 'เปลี่ยนเป็นมาวันนี้' : 'เปลี่ยนเป็นขาดวันนี้'}: ${player.name}`}
                      title={player.absentToday ? 'ขาดวันนี้' : 'มาวันนี้'}
                    >
                      {player.absentToday ? (
                        <CircleAlert className="h-4 w-4" />
                      ) : (
                        <CircleCheck className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updatePlayers(
                          team.players.filter((item) => item.id !== player.id),
                        )
                      }
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-red-500 hover:bg-red-50"
                      aria-label={`ลบ ${player.name}`}
                      title="ลบผู้เล่น"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-3 rounded-2xl bg-slate-50 p-3">
            <label htmlFor="new-player-name" className="text-sm font-black">
              เพิ่มผู้เล่น
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="new-player-name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && addPlayer()}
                placeholder="ชื่อผู้เล่นใหม่"
                className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 font-bold outline-none focus:border-[#35a95f]"
              />
              <Button
                onClick={addPlayer}
                disabled={!newName.trim()}
                className="h-12 rounded-xl bg-[#11823b]"
              >
                <Plus />
                เพิ่ม
              </Button>
            </div>
            <div className="mt-3">
              <p className="mb-2 text-xs font-bold text-slate-500">
                ตำแหน่งที่เล่นได้: D · M · W · F (เลือกได้หลายตำแหน่ง)
              </p>
              <PlayerPositionPicker
                playerName={newName || 'ผู้เล่นใหม่'}
                positions={newPositions}
                onChange={setNewPositions}
              />
            </div>
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
  const finished = tournament.matches.filter(
    (match) => match.status === 'finished',
  );
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
      label: 'แข่งแล้ว · ล่าสุดอยู่ล่างสุด',
      matches: finished,
      tone: 'finished' as const,
    },
  ].filter((group) => group.matches.length > 0);
  return (
    <>
      <PageHeader
        title="ตารางการแข่งขัน"
        eyebrow={`${tournament.matches.length} แมตช์ · เวลาสนาม ${tournament.startTime}–${displayTournamentTime(tournament, fieldEndTime)}`}
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
                <TableHead className="w-[44px] px-1 text-center text-[11px]">
                  แมตช์
                </TableHead>
                <TableHead className="w-[58px] px-1.5">เวลา</TableHead>
                <TableHead>คู่แข่งขัน</TableHead>
                <TableHead className="w-[52px] pr-2 text-right">ผล</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.flatMap((group) => [
                <TableRow
                  key={`group-${group.tone}`}
                  className="border-0 bg-slate-100/80 hover:bg-slate-100/80"
                >
                  <TableCell
                    colSpan={4}
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
                  const matchEndTime = addMinutes(
                    match.startTime,
                    tournament.matchDurationMinutes,
                  );
                  const startsNextDay = isNextDayTime(
                    tournament,
                    match.startTime,
                  );
                  const endsNextDay = isNextDayTime(tournament, matchEndTime);
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
                      <TableCell className="w-[44px] px-1 py-3 text-center align-middle">
                        <span
                          className={`inline-flex min-w-8 justify-center rounded-lg px-1.5 py-1 text-xs font-black tabular-nums ${match.status === 'current' ? 'bg-[#11823b] text-white' : 'bg-slate-100 text-slate-600'}`}
                        >
                          M{match.matchNumber}
                        </span>
                      </TableCell>
                      <TableCell className="px-1.5 py-3 align-middle text-xs font-black tabular-nums">
                        <span className="block leading-4">
                          {match.startTime}
                        </span>
                        <span className="block text-[11px] font-bold text-slate-400">
                          –{matchEndTime}
                        </span>
                        {(startsNextDay || endsNextDay) && (
                          <span className="block text-[9px] font-black leading-3 text-[#087632]">
                            {startsNextDay ? '+1 วัน' : 'จบ +1 วัน'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="p-0 align-middle">
                        <button
                          type="button"
                          onClick={() => onOpenMatch(match.id)}
                          aria-label={`เปิดเกม ${match.matchNumber}: ${teamA.name} พบ ${teamB.name}`}
                          className="grid min-h-12 w-full grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)] items-center gap-1 px-1 text-left min-[370px]:px-2"
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            <TeamShirtIcon color={teamA.color} size="xs" />
                            <span className="truncate text-sm font-black">
                              {teamA.name}
                            </span>
                          </span>
                          <span className="text-center text-xs font-bold text-slate-400">
                            vs
                          </span>
                          <span className="flex min-w-0 items-center gap-1.5">
                            <TeamShirtIcon color={teamB.color} size="xs" />
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
  const [showAllResults, setShowAllResults] = useState(false);
  const results = tournament.matches.filter(
    (match) =>
      match.status === 'finished' &&
      match.teamAScore !== undefined &&
      match.teamBScore !== undefined,
  );
  const visibleResults = showAllResults
    ? [...results].reverse()
    : [...results].reverse().slice(0, 5);
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
              {visibleResults.map((match) => {
                const teamA = tournament.teams.find(
                  (team) => team.id === match.teamAId,
                )!;
                const teamB = tournament.teams.find(
                  (team) => team.id === match.teamBId,
                )!;
                return (
                  <div key={match.id} className="rounded-xl bg-slate-50 p-3">
                    <p className="mb-1 text-xs font-bold text-slate-400">
                      Match {match.matchNumber} · {match.startTime}
                    </p>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <span className="truncate text-right font-black">
                        {teamA.name}
                      </span>
                      <span className="rounded-lg bg-white px-3 py-1 text-lg font-black tabular-nums text-[#087632] shadow-sm">
                        {match.teamAScore} - {match.teamBScore}
                      </span>
                      <span className="truncate font-black">{teamB.name}</span>
                    </div>
                  </div>
                );
              })}
              {results.length > 5 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowAllResults((value) => !value)}
                  className="h-11 w-full rounded-xl font-black text-[#087632]"
                >
                  {showAllResults ? 'ย่อรายการ' : `ดูทั้งหมด ${results.length} ผล`}
                </Button>
              )}
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
  const hasScorerOverflow = [
    { teamId: match.teamAId, score: normalizedScoreA },
    { teamId: match.teamBId, score: normalizedScoreB },
  ].some(
    (side) =>
      (match.scorers ?? [])
        .filter((scorer) => scorer.teamId === side.teamId)
        .reduce((total, scorer) => total + scorer.goals, 0) > side.score,
  );

  const [editingScore, setEditingScore] = useState(false);
  /* oxlint-disable react/react-compiler -- keep the score editor aligned with remote updates for the same match. */
  useEffect(() => {
    // Adopting a remote score mid-keystroke would wipe the digits being typed,
    // so wait until the field is left before following the shared game again.
    if (editingScore) return;
    setScoreA(String(match.teamAScore ?? 0));
    setScoreB(String(match.teamBScore ?? 0));
  }, [editingScore, match.id, match.teamAScore, match.teamBScore]);
  /* oxlint-enable react/react-compiler */

  function updateDraftScore(team: 'a' | 'b', value: string) {
    if (team === 'a') setScoreA(value);
    else setScoreB(value);
    if (value === '' || match.status === 'finished') return;
    onUpdate(
      setMatchScore(
        tournament,
        match.id,
        team === 'a' ? Number.parseInt(value, 10) || 0 : normalizedScoreA,
        team === 'b' ? Number.parseInt(value, 10) || 0 : normalizedScoreB,
      ),
    );
  }

  return (
    <>
      <PageHeader
        title={`Match ${match.matchNumber}`}
        eyebrow={`สนาม 1 · ${displayMatchTimeRange(tournament, match)}`}
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
          <div className="grid grid-cols-1 gap-2 min-[370px]:grid-cols-2">
            <ScorePicker
              label={teamA.name}
              color={teamA.color}
              score={scoreA}
              onChange={(value) => updateDraftScore('a', value)}
              onEditingChange={setEditingScore}
            />
            <ScorePicker
              label={teamB.name}
              color={teamB.color}
              score={scoreB}
              onChange={(value) => updateDraftScore('b', value)}
              onEditingChange={setEditingScore}
            />
          </div>
          <ScorerEditor
            tournament={tournament}
            match={match}
            onUpdate={onUpdate}
            teamAScore={normalizedScoreA}
            teamBScore={normalizedScoreB}
          />
          {match.status !== 'finished' && (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11px] font-bold text-slate-500">
              <Cloud className="h-3.5 w-3.5 text-[#11823b]" />
              สกอร์นี้บันทึกอัตโนมัติ แต่ยังไม่คิดในตารางคะแนน
            </p>
          )}
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
            disabled={hasScorerOverflow}
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
              disabled={hasScorerOverflow}
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
      const [{ renderStandingsShareCard }] = await Promise.all([
        import('@/lib/standings-share-card'),
        document.fonts?.ready,
      ]);
      if (!cancelled && canvasRef.current) {
        renderStandingsShareCard(canvasRef.current, tournament);
      }
    }
    void draw();
    return () => {
      cancelled = true;
    };
  }, [tournament]);

  async function makeShareCard() {
    if (!canvasRef.current) throw new Error('ยังสร้างรูปไม่เสร็จ');
    const {
      canvasToPngBlob,
      downloadShareCard,
      renderStandingsShareCard,
      shareCardFilename,
    } = await import('@/lib/standings-share-card');
    renderStandingsShareCard(canvasRef.current, tournament);
    return {
      blob: await canvasToPngBlob(canvasRef.current),
      downloadShareCard,
      filename: shareCardFilename(tournament),
    };
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
      const { blob, downloadShareCard, filename } = await makeShareCard();
      downloadShareCard(blob, filename);
      onNotice('ดาวน์โหลดรูปตารางคะแนนแล้ว');
    } catch {
      onNotice('สร้างรูปไม่สำเร็จ กรุณาลองใหม่');
    }
  }

  async function share() {
    if (isSharing) return;
    setIsSharing(true);
    try {
      const { blob, downloadShareCard, filename } = await makeShareCard();
      const file = new File([blob], filename, {
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
  onOpen: (gameId: string) => void | Promise<void>;
  onDeleted: (gameId: string) => void;
  onNotice: (message: string) => void;
}) {
  const [games, setGames] = useState<FootballGameSummary[]>(() =>
    readCachedSharedGames(),
  );
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [confirmingId, setConfirmingId] = useState('');
  const refreshTokenRef = useRef(0);

  async function refresh(force = false) {
    // A manual reload can resolve before the load this screen starts on mount,
    // so only the newest request is allowed to publish its result.
    const token = refreshTokenRef.current + 1;
    refreshTokenRef.current = token;
    setLoading(true);
    try {
      const list = await listSharedGames({ force });
      if (refreshTokenRef.current !== token) return;
      setGames(list);
    } catch {
      if (refreshTokenRef.current !== token) return;
      onNotice('โหลดรายการเกมไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      if (refreshTokenRef.current === token) setLoading(false);
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
      // An older list request may have captured this game before deletion.
      // Invalidate it and finish the spinner it no longer owns.
      refreshTokenRef.current += 1;
      setLoading(false);
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

  async function openGame(gameId: string) {
    if (openingId) return;
    setOpeningId(gameId);
    try {
      await onOpen(gameId);
    } finally {
      setOpeningId('');
    }
  }

  const confirmingGame = games.find((game) => game.id === confirmingId);
  return (
    <>
      <PageHeader
        title="เกมทั้งหมด"
        eyebrow={`${games.length} เกมใน FootballTeam${loading && games.length ? ' · กำลังอัปเดต' : ''}`}
        onBack={onBack}
        action={
          <button
            type="button"
            onClick={() => void refresh(true)}
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
          Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="rounded-[22px] border border-slate-200 bg-white p-4"
              aria-hidden="true"
            >
              <Skeleton className="h-5 w-2/3 rounded-lg" />
              <Skeleton className="mt-2 h-3 w-4/5 rounded-lg" />
              <Skeleton className="mt-4 h-10 w-full rounded-xl" />
            </div>
          ))
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
                  onClick={() => void openGame(game.id)}
                  disabled={Boolean(openingId)}
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
                onClick={() => void openGame(game.id)}
                disabled={Boolean(openingId)}
                className="mt-3 flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 text-left"
              >
                <span className="text-sm font-bold text-slate-600">
                  {openingId === game.id
                    ? 'กำลังเปิดเกม…'
                    : `${game.teamCount} ทีม · ${game.finishedCount}/${game.matchCount} แมตช์ · เริ่ม ${game.startTime}`}
                </span>
                {openingId === game.id ? (
                  <LoaderCircle className="h-5 w-5 animate-spin text-[#11823b]" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-slate-400" />
                )}
              </button>
            </article>
          ))
        )}
      </div>
      <AlertDialog
        open={Boolean(confirmingGame)}
        onOpenChange={(open) => !open && !deletingId && setConfirmingId('')}
      >
        <AlertDialogContent className="rounded-[24px] p-5">
          <AlertDialogHeader className="place-items-start text-left">
            <AlertDialogTitle className="text-lg font-black">
              ลบ “{confirmingGame?.name}”?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left font-semibold leading-6">
              เกม ตารางคะแนน รายชื่อทีม และผลแข่งจะถูกลบจากฐานข้อมูลถาวร
              ลิงก์เดิมจะเปิดเกมนี้ไม่ได้อีก
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-2 grid grid-cols-2 bg-white">
            <AlertDialogCancel
              disabled={Boolean(deletingId)}
              className="h-12 rounded-xl font-black"
            >
              ยกเลิก
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                confirmingGame && void removeGame(confirmingGame.id)
              }
              disabled={Boolean(deletingId)}
              className="h-12 rounded-xl font-black"
            >
              <Trash2 />
              {deletingId ? 'กำลังลบ…' : 'ลบถาวร'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  meetingCount,
  recommendation,
  disabled = false,
}: {
  label: string;
  teams: Team[];
  teamAId: string;
  teamBId: string;
  onTeamAChange: (teamId: string) => void;
  onTeamBChange: (teamId: string) => void;
  meetingCount?: number;
  recommendation?: [string, string];
  disabled?: boolean;
}) {
  function renderTeam(team: Team) {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <TeamShirtIcon color={team.color} size="xs" />
        <span className="min-w-0 truncate font-black">{team.name}</span>
        <span className="hidden text-xs font-bold text-slate-400 min-[390px]:inline">
          {COLOR_LABEL[team.color]}
        </span>
      </span>
    );
  }

  const recommendationA = teams.find((team) => team.id === recommendation?.[0]);
  const recommendationB = teams.find((team) => team.id === recommendation?.[1]);
  const selectedIsRecommended = Boolean(
    recommendation &&
    ((teamAId === recommendation[0] && teamBId === recommendation[1]) ||
      (teamAId === recommendation[1] && teamBId === recommendation[0])),
  );

  return (
    <fieldset className="rounded-2xl border border-slate-100 bg-slate-50 p-2.5">
      <legend className="px-1.5 text-sm font-black text-slate-700">
        {label}
      </legend>
      <div className="mt-0.5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
        <Select
          value={teamAId}
          disabled={disabled}
          onValueChange={(nextId) => {
            if (!nextId) return;
            onTeamAChange(nextId);
            if (nextId === teamBId) {
              const replacement = teams.find((team) => team.id !== nextId);
              if (replacement) onTeamBChange(replacement.id);
            }
          }}
        >
          <SelectTrigger
            aria-label={`${label} ทีมแรก`}
            className="h-11 w-full min-w-0 rounded-xl border-slate-200 bg-white px-2 text-sm focus-visible:border-[#35a95f] focus-visible:ring-[#35a95f]/15"
          >
            <SelectValue>
              {(value) => {
                const selected = teams.find((team) => team.id === value);
                return selected ? renderTeam(selected) : 'เลือกทีม';
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="start">
            {teams.map((team) => (
              <SelectItem key={team.id} value={team.id} className="py-2">
                {renderTeam(team)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs font-black text-slate-400">VS</span>
        <Select
          value={teamBId}
          disabled={disabled}
          onValueChange={(nextId) => {
            if (nextId) onTeamBChange(nextId);
          }}
        >
          <SelectTrigger
            aria-label={`${label} ทีมที่สอง`}
            className="h-11 w-full min-w-0 rounded-xl border-slate-200 bg-white px-2 text-sm focus-visible:border-[#35a95f] focus-visible:ring-[#35a95f]/15"
          >
            <SelectValue>
              {(value) => {
                const selected = teams.find((team) => team.id === value);
                return selected ? renderTeam(selected) : 'เลือกทีม';
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            {teams.map((team) => (
              <SelectItem
                key={team.id}
                value={team.id}
                disabled={team.id === teamAId}
                className="py-2"
              >
                {renderTeam(team)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {typeof meetingCount === 'number' && (
        <div className="mt-2 space-y-1.5">
          <p className="px-1 text-xs font-bold text-slate-500">
            คู่นี้เล่นแล้วหรือกำลังเล่น {meetingCount} ครั้ง
          </p>
          {selectedIsRecommended ? (
            <p className="rounded-xl bg-[#e5f4e9] px-2.5 py-2 text-xs font-black text-[#087632]">
              ✓ ระบบแนะนำคู่นี้เพื่อให้จำนวนการพบกันสมดุล
            </p>
          ) : recommendationA && recommendationB ? (
            <button
              type="button"
              onClick={() => {
                onTeamAChange(recommendationA.id);
                onTeamBChange(recommendationB.id);
              }}
              className="flex min-h-10 w-full items-center justify-between gap-2 rounded-xl bg-[#e5f4e9] px-2.5 py-2 text-left text-xs font-black text-[#087632]"
            >
              <span className="min-w-0">คู่แนะนำ</span>
              <span className="flex min-w-0 items-center gap-1">
                <TeamShirtIcon color={recommendationA.color} size="xs" />
                <span className="truncate">{recommendationA.name}</span>
                <span>vs</span>
                <TeamShirtIcon color={recommendationB.color} size="xs" />
                <span className="truncate">{recommendationB.name}</span>
              </span>
              <span className="shrink-0">ใช้คู่นี้</span>
            </button>
          ) : null}
        </div>
      )}
    </fieldset>
  );
}

function settingsDraftFrom(tournament: Tournament) {
  const finishedCount = tournament.matches.filter(
    (match) => match.status === 'finished',
  ).length;
  const lockedCurrent =
    finishedCount > 0
      ? tournament.matches.find((match) => match.status === 'current')
      : undefined;
  const [firstQueuedMatch, secondQueuedMatch] = tournament.matches.filter(
    (match) => match.status !== 'finished' && match.id !== lockedCurrent?.id,
  );
  const recommendations = recommendUpcomingPairs(tournament, 2);
  const fallbackTeamA = tournament.teams[0]?.id ?? '';
  const fallbackTeamB = tournament.teams[1]?.id ?? fallbackTeamA;
  return {
    name: tournament.name,
    teamColors: Object.fromEntries(
      tournament.teams.map((team) => [team.id, team.color]),
    ) as Record<string, TeamColor>,
    matchMinutes: tournament.matchDurationMinutes,
    breakMinutes: tournament.breakDurationMinutes,
    startTime: tournament.startTime,
    endTime: addMinutes(tournament.startTime, tournament.availableTimeMinutes),
    firstPairA:
      (finishedCount > 0 ? recommendations[0]?.[0] : undefined) ??
      firstQueuedMatch?.teamAId ??
      fallbackTeamA,
    firstPairB:
      (finishedCount > 0 ? recommendations[0]?.[1] : undefined) ??
      firstQueuedMatch?.teamBId ??
      fallbackTeamB,
    secondPairA:
      (finishedCount > 0 ? recommendations[1]?.[0] : undefined) ??
      secondQueuedMatch?.teamAId ??
      fallbackTeamA,
    secondPairB:
      (finishedCount > 0 ? recommendations[1]?.[1] : undefined) ??
      secondQueuedMatch?.teamBId ??
      fallbackTeamB,
    useSecondPair: Boolean(secondQueuedMatch),
  };
}

// Everything the draft above is derived from. This screen stays mounted while
// a background poll applies an update from another device, so the form has to
// notice when the game it was seeded from is no longer the current one.
function settingsSourceSignature(tournament: Tournament) {
  return JSON.stringify([
    tournament.name,
    tournament.matchDurationMinutes,
    tournament.breakDurationMinutes,
    tournament.startTime,
    tournament.availableTimeMinutes,
    tournament.teams.map((team) => [team.id, team.color]),
    tournament.matches.map((match) => [
      match.id,
      match.status,
      match.teamAId,
      match.teamBId,
    ]),
  ]);
}

function SettingsScreen({
  tournament,
  gameId,
  onCreateNew,
  onCopySettings,
  onSave,
  onGames,
  onTeams,
  onDelete,
}: {
  tournament: Tournament;
  gameId: string;
  onCreateNew: () => void;
  onCopySettings: () => void;
  onSave: (value: Tournament) => void;
  onGames: () => void;
  onTeams: () => void;
  onDelete: () => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [initialDraft] = useState(() => settingsDraftFrom(tournament));
  const [name, setName] = useState(initialDraft.name);
  const [teamColors, setTeamColors] = useState(initialDraft.teamColors);
  const selectableTeams = tournament.teams.map((team) => ({
    ...team,
    color: teamColors[team.id] ?? team.color,
  }));
  const [matchMinutes, setMatchMinutes] = useState(initialDraft.matchMinutes);
  const [breakMinutes, setBreakMinutes] = useState(initialDraft.breakMinutes);
  const [startTime, setStartTime] = useState(initialDraft.startTime);
  const [endTime, setEndTime] = useState(initialDraft.endTime);
  const [firstPairA, setFirstPairA] = useState(initialDraft.firstPairA);
  const [firstPairB, setFirstPairB] = useState(initialDraft.firstPairB);
  const [secondPairA, setSecondPairA] = useState(initialDraft.secondPairA);
  const [secondPairB, setSecondPairB] = useState(initialDraft.secondPairB);
  const [useSecondPair, setUseSecondPair] = useState(
    initialDraft.useSecondPair,
  );
  const sourceSignature = settingsSourceSignature(tournament);
  const seededSignatureRef = useRef(sourceSignature);
  useEffect(() => {
    if (seededSignatureRef.current === sourceSignature) return;
    seededSignatureRef.current = sourceSignature;
    const draft = settingsDraftFrom(tournament);
    setName(draft.name);
    setTeamColors(draft.teamColors);
    setMatchMinutes(draft.matchMinutes);
    setBreakMinutes(draft.breakMinutes);
    setStartTime(draft.startTime);
    setEndTime(draft.endTime);
    setFirstPairA(draft.firstPairA);
    setFirstPairB(draft.firstPairB);
    setSecondPairA(draft.secondPairA);
    setSecondPairB(draft.secondPairB);
    setUseSecondPair(draft.useSecondPair);
  }, [sourceSignature, tournament]);
  const finishedCount = tournament.matches.filter(
    (match) => match.status === 'finished',
  ).length;
  const lockedCurrent =
    finishedCount > 0
      ? tournament.matches.find((match) => match.status === 'current')
      : undefined;
  const availableMinutes = minutesBetween(startTime, endTime);
  const endsNextDay = endTime < startTime;
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
  const remainingAfterSave = Math.max(
    0,
    resultingCount - finishedCount - (lockedCurrent ? 1 : 0),
  );
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
  const firstRecommendation =
    finishedCount > 0 ? recommendUpcomingPairs(tournament, 1)[0] : undefined;
  const secondRecommendation =
    finishedCount > 0
      ? recommendUpcomingPairs(tournament, 2, [[firstPairA, firstPairB]])[1]
      : undefined;

  function saveSettings() {
    if (!valid) return;
    const updated = updateTournamentSettings(tournament, {
      name: name.trim(),
      matchDurationMinutes: matchMinutes,
      breakDurationMinutes: breakMinutes,
      startTime,
      availableTimeMinutes: availableMinutes,
    });
    const updatedWithColors = {
      ...updated,
      teams: updated.teams.map((team) => ({
        ...team,
        color: teamColors[team.id] ?? team.color,
      })),
    };
    const preferredPairs: Array<[string, string]> = [[firstPairA, firstPairB]];
    if (useSecondPair) preferredPairs.push([secondPairA, secondPairB]);
    onSave(
      remainingAfterSave > 0
        ? reshuffleUpcomingMatches(updatedWithColors, preferredPairs)
        : updatedWithColors,
    );
  }

  async function deleteGame() {
    if (deleting) return;
    setDeleting(true);
    const deleted = await onDelete();
    if (!deleted) setDeleting(false);
  }

  return (
    <>
      <PageHeader title="ตั้งค่า" eyebrow="เกมที่กำลังใช้งาน" />
      <div className="space-y-4 px-4 py-4">
        <section className="settings-card">
          <h2 className="section-title">ทางลัด</h2>
          <p className="section-note mt-1">
            รายชื่อผู้เล่นและคิว GK แก้ได้จากหน้าทีม โดยไม่กระทบผลแข่ง
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
            onClick={onCopySettings}
            variant="outline"
            className="mt-2 h-12 w-full rounded-xl font-black"
          >
            <Copy />
            สร้างเกมใหม่จากการตั้งค่านี้
          </Button>
          <Button
            onClick={onCreateNew}
            variant="outline"
            className="mt-3 h-12 w-full rounded-xl font-black"
          >
            <Plus />
            สร้างตารางใหม่
          </Button>
        </section>
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
          <div className="border-t border-slate-100 pt-4">
            <h2 className="section-title">สีเสื้อทีม</h2>
            <p className="section-note">
              เปลี่ยนเฉพาะสีที่แสดง ประวัติการพบกันยังนับเป็นทีมเดิม
            </p>
            <div className="mt-3 space-y-2">
              {tournament.teams.map((team) => (
                <div
                  key={team.id}
                  className="flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 px-2 py-1.5"
                >
                  <TeamShirtIcon
                    color={teamColors[team.id] ?? team.color}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-black">
                    {team.name}
                  </span>
                  <div className="flex shrink-0 justify-end gap-0.5">
                    {TEAM_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={`เปลี่ยนสีเสื้อทีม ${team.name} เป็น${COLOR_LABEL[color]}`}
                        aria-pressed={
                          (teamColors[team.id] ?? team.color) === color
                        }
                        onClick={() =>
                          setTeamColors((current) => ({
                            ...current,
                            [team.id]: color,
                          }))
                        }
                        className={`h-6 w-6 rounded-full border-2 ${(teamColors[team.id] ?? team.color) === color ? 'ring-2 ring-[#11823b] ring-offset-1' : ''}`}
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
              <p className="section-note">
                เพิ่มหรือลดเกมที่ยังไม่เริ่ม{endsNextDay ? ' · วันถัดไป' : ''}
              </p>
            </div>
            <input
              aria-label="เวลาจบ"
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-base font-black"
            />
          </div>
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <div>
              <h2 className="section-title">
                {finishedCount > 0 ? 'กำหนดเกมถัดไป' : 'กำหนดคู่เปิดสนาม'}
              </h2>
              <p className="section-note">
                {finishedCount > 0
                  ? 'เกมที่กำลังแข่งจะไม่เปลี่ยน ระบบจะจัดเกมที่เหลือใหม่ให้ทุกทีมพบกันครบ'
                  : 'เลือกสีเสื้อของสองทีมแรก แล้วระบบจะจัดเกมที่เหลือให้ทุกทีมพบกันครบ'}
              </p>
            </div>
            {remainingAfterSave > 0 ? (
              <>
                <SettingsPairPicker
                  label={finishedCount > 0 ? 'เกมถัดไป' : 'คู่เปิดสนาม'}
                  teams={selectableTeams}
                  teamAId={firstPairA}
                  teamBId={firstPairB}
                  onTeamAChange={setFirstPairA}
                  onTeamBChange={setFirstPairB}
                  meetingCount={
                    finishedCount > 0
                      ? pairMeetingCount(tournament, firstPairA, firstPairB)
                      : undefined
                  }
                  recommendation={firstRecommendation}
                />
                <label className="flex min-h-10 items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 text-sm font-black text-slate-700">
                  <span>
                    {finishedCount > 0 ? 'กำหนดเกมถัดไปอีก 1 คู่' : 'กำหนดคู่ที่ 2 ด้วย'}
                  </span>
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
                    label={finishedCount > 0 ? 'เกมถัดไปลำดับที่ 2' : 'คู่ที่ 2'}
                    teams={selectableTeams}
                    teamAId={secondPairA}
                    teamBId={secondPairB}
                    onTeamAChange={setSecondPairA}
                    onTeamBChange={setSecondPairB}
                    meetingCount={
                      finishedCount > 0
                        ? pairMeetingCount(tournament, secondPairA, secondPairB)
                        : undefined
                    }
                    recommendation={secondRecommendation}
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
        <Button
          variant="destructive"
          onClick={() => setConfirming(true)}
          disabled={deleting}
          className="h-12 w-full rounded-xl font-black"
        >
          <Trash2 />
          {gameId ? 'ลบเกมส์นี้' : 'ลบเกมบนอุปกรณ์นี้'}
        </Button>
      </div>
      <AlertDialog
        open={confirming}
        onOpenChange={(open) => !deleting && setConfirming(open)}
      >
        <AlertDialogContent className="rounded-[24px] p-5">
          <AlertDialogHeader className="place-items-start text-left">
            <AlertDialogTitle className="text-lg font-black">
              {gameId ? 'ลบเกมส์นี้ออกจากฐานข้อมูล?' : 'ลบเกมนี้ออกจากอุปกรณ์?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left font-semibold leading-6">
              {gameId
                ? 'เกม ตารางคะแนน รายชื่อทีม และผลแข่งจะถูกลบถาวร ลิงก์เดิมจะเปิดเกมนี้ไม่ได้อีก'
                : 'ทีม รายชื่อผู้เล่น ตารางแข่งขัน และประวัติ GK จะถูกลบจากอุปกรณ์นี้'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-2 grid grid-cols-2 bg-white">
            <AlertDialogCancel
              disabled={deleting}
              className="h-12 rounded-xl font-black"
            >
              ยกเลิก
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void deleteGame()}
              disabled={deleting}
              className="h-12 rounded-xl font-black"
            >
              {deleting ? 'กำลังลบ…' : gameId ? 'ลบเกมส์ถาวร' : 'ลบทั้งหมด'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function FootballApp() {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [gameId, setGameId] = useState('');
  const [setupSource, setSetupSource] = useState<Tournament | null>(null);
  const [setupCopyMode, setSetupCopyMode] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<AppView>('home');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [notice, setNotice] = useState('');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local');
  const [recoverableDraft, setRecoverableDraft] = useState<Tournament | null>(
    null,
  );
  const [conflictRemote, setConflictRemote] =
    useState<StoredFootballGame | null>(null);
  const conflictRemoteRef = useRef<StoredFootballGame | null>(null);
  const tournamentRef = useRef<Tournament | null>(null);
  const gameIdRef = useRef('');
  const lastRemoteStateRef = useRef('');
  const remoteRevisionRef = useRef(0);
  const queuedStateRef = useRef<Tournament | null>(null);
  const saveInFlightRef = useRef(false);
  const dirtyRef = useRef(false);
  const remoteHydrationInFlightRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);
  const retryAttemptRef = useRef(0);
  const syncSessionRef = useRef(0);
  const openRequestRef = useRef(0);
  const pollFailureCountRef = useRef(0);
  const pollFailedRef = useRef(false);

  function cancelScheduledRetry(resetAttempt = true) {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (resetAttempt) retryAttemptRef.current = 0;
  }

  function scheduleSyncRetry(targetGameId: string) {
    if (retryTimerRef.current !== null) return;
    const delay = syncRetryDelayMs(retryAttemptRef.current);
    retryAttemptRef.current += 1;
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      void flushSharedState(targetGameId);
    }, delay);
  }

  async function flushSharedState(
    targetGameId = gameIdRef.current,
    options: { keepalive?: boolean } = {},
  ) {
    if (
      !targetGameId ||
      saveInFlightRef.current ||
      conflictRemoteRef.current ||
      remoteRevisionRef.current < 1 ||
      (retryTimerRef.current !== null && !options.keepalive)
    )
      return;
    const value = queuedStateRef.current ?? tournamentRef.current;
    if (!value) return;
    const requestSession = syncSessionRef.current;
    const requestStillActive = () =>
      requestSession === syncSessionRef.current &&
      gameIdRef.current === targetGameId;
    const serialized = JSON.stringify(value);
    if (serialized === lastRemoteStateRef.current) {
      queuedStateRef.current = null;
      dirtyRef.current = false;
      setSyncStatus('saved');
      writeLocalBackup(value, targetGameId, false);
      return;
    }

    queuedStateRef.current = null;
    saveInFlightRef.current = true;
    let conflictDetected = false;
    let saveSucceeded = false;
    setSyncStatus('saving');
    try {
      const game = await saveSharedGame(
        targetGameId,
        value,
        remoteRevisionRef.current,
        options,
      );
      saveSucceeded = true;
      if (!requestStillActive()) {
        markLocalBackupSyncedIfUnchanged(targetGameId, value);
        return;
      }
      remoteRevisionRef.current = game.revision;
      lastRemoteStateRef.current = JSON.stringify(game.state);
      cancelScheduledRetry();
      const latestSerialized = JSON.stringify(tournamentRef.current);
      if (latestSerialized !== serialized) {
        queuedStateRef.current = tournamentRef.current;
        dirtyRef.current = true;
        if (tournamentRef.current)
          writeLocalBackup(tournamentRef.current, targetGameId, true);
      } else {
        dirtyRef.current = false;
        setSyncStatus('saved');
        writeLocalBackup(value, targetGameId, false);
      }
    } catch (error) {
      if (!requestStillActive()) return;
      const latestPending = newestPendingState(
        value,
        queuedStateRef.current,
        tournamentRef.current,
      );
      queuedStateRef.current = latestPending;
      dirtyRef.current = true;
      writeLocalBackup(latestPending, targetGameId, true);
      if (error instanceof RevisionConflictError) {
        conflictDetected = true;
        cancelScheduledRetry(false);
        remoteRevisionRef.current = error.latest.revision;
        conflictRemoteRef.current = error.latest;
        setConflictRemote(error.latest);
        setSyncStatus('conflict');
      } else {
        const blockingNotice = blockingSyncNotice(error);
        setSyncStatus('error');
        setNotice(blockingNotice || 'ยังซิงก์ไม่ได้ แต่ข้อมูลสำรองอยู่ในเครื่อง');
        if (!blockingNotice && !options.keepalive)
          scheduleSyncRetry(targetGameId);
      }
    } finally {
      saveInFlightRef.current = false;
      if (!requestStillActive()) {
        const activeGameId = gameIdRef.current;
        if (
          activeGameId &&
          queuedStateRef.current &&
          !conflictRemoteRef.current &&
          !options.keepalive
        )
          window.setTimeout(() => void flushSharedState(activeGameId), 0);
      } else if (
        saveSucceeded &&
        queuedStateRef.current &&
        !conflictDetected &&
        !conflictRemoteRef.current &&
        !options.keepalive
      ) {
        window.setTimeout(() => void flushSharedState(targetGameId), 0);
      }
    }
  }

  /* oxlint-disable react/react-compiler -- hydration intentionally reads browser-only and remote state once. */
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      restoreGitHubPagesPath();
      const pathGameId = gameIdFromPath();
      const pathShowsAllGames = allGamesFromPath();
      const backup = readLocalBackup(pathGameId);
      if (pathGameId) {
        gameIdRef.current = pathGameId;
        setGameId(pathGameId);
        const backupForGame =
          backup.gameId === pathGameId ? backup.tournament : null;
        if (backupForGame) {
          const cachedValue = extendTournamentToEndTime(backupForGame);
          tournamentRef.current = cachedValue;
          lastRemoteStateRef.current = JSON.stringify(cachedValue);
          queuedStateRef.current = backup.pendingSync ? cachedValue : null;
          dirtyRef.current = backup.pendingSync;
          setTournament(cachedValue);
          setSyncStatus('loading');
          setHydrated(true);
        }
        remoteHydrationInFlightRef.current = true;
        try {
          const game = await loadSharedGame(pathGameId);
          if (cancelled) return;
          if (game) {
            const remoteValue = extendTournamentToEndTime(game.state);
            const remoteSerialized = JSON.stringify(remoteValue);
            lastRemoteStateRef.current = remoteSerialized;
            remoteRevisionRef.current = game.revision;
            const pendingLocalValue =
              (backup.pendingSync || dirtyRef.current) &&
              (tournamentRef.current ?? backupForGame);
            if (pendingLocalValue) {
              const localValue = extendTournamentToEndTime(pendingLocalValue);
              if (JSON.stringify(localValue) !== remoteSerialized) {
                const remoteGame = { ...game, state: remoteValue };
                tournamentRef.current = localValue;
                queuedStateRef.current = localValue;
                dirtyRef.current = true;
                conflictRemoteRef.current = remoteGame;
                setTournament(localValue);
                setConflictRemote(remoteGame);
                setSyncStatus('conflict');
                setNotice('มีข้อมูลในเครื่องที่ยังไม่ได้ซิงก์ กรุณาเลือกข้อมูลที่จะใช้');
              } else {
                queuedStateRef.current = null;
                dirtyRef.current = false;
                tournamentRef.current = remoteValue;
                setTournament(remoteValue);
                setSyncStatus('saved');
                writeLocalBackup(remoteValue, pathGameId, false);
              }
            } else {
              queuedStateRef.current = null;
              dirtyRef.current = false;
              tournamentRef.current = remoteValue;
              setTournament(remoteValue);
              setSyncStatus('saved');
              writeLocalBackup(remoteValue, pathGameId, false);
            }
          } else {
            if (backupForGame) setSyncStatus('error');
            setNotice('ไม่พบเกมจากลิงก์นี้');
          }
        } catch (error) {
          if (cancelled) return;
          const blockingNotice = blockingSyncNotice(error);
          if (backupForGame) {
            const value = extendTournamentToEndTime(
              tournamentRef.current ?? backupForGame,
            );
            tournamentRef.current = value;
            if (backup.pendingSync || dirtyRef.current) {
              queuedStateRef.current = value;
              dirtyRef.current = true;
              writeLocalBackup(value, pathGameId, true);
            } else {
              queuedStateRef.current = null;
              dirtyRef.current = false;
              writeLocalBackup(value, pathGameId, false);
            }
            setTournament(value);
            setSyncStatus('error');
            setNotice(blockingNotice || 'เชื่อมต่อเกมไม่ได้ กำลังใช้ข้อมูลสำรองของเกมนี้');
          } else {
            setNotice(blockingNotice || 'เชื่อมต่อเกมจากลิงก์นี้ไม่ได้ กรุณาลองใหม่');
          }
        } finally {
          remoteHydrationInFlightRef.current = false;
          if (!cancelled) setHydrated(true);
        }
        return;
      }

      setTournament(null);
      tournamentRef.current = null;
      gameIdRef.current = '';
      setGameId('');
      setRecoverableDraft(
        backup.tournament && !backup.gameId ? backup.tournament : null,
      );
      setSyncStatus('local');
      setView(pathShowsAllGames ? 'games' : 'home');
      if (!cancelled) setHydrated(true);
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);
  /* oxlint-enable react/react-compiler */
  useEffect(() => {
    if (!hydrated || gameId) return;
    void prefetchSharedGames().catch(() => undefined);
  }, [hydrated, gameId]);
  useEffect(() => {
    tournamentRef.current = tournament;
    if (!hydrated) return;
    if (tournament) {
      writeLocalBackup(tournament, gameId, dirtyRef.current);
      if (!gameId) return;
      const serialized = JSON.stringify(tournament);
      if (serialized === lastRemoteStateRef.current) return;
      queuedStateRef.current = tournament;
      dirtyRef.current = true;
      setSyncStatus(
        remoteRevisionRef.current > 0
          ? 'saving'
          : remoteHydrationInFlightRef.current
            ? 'loading'
            : 'error',
      );
      const timer = window.setTimeout(() => {
        void flushSharedState(gameId);
      }, 450);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [tournament, hydrated, gameId]);
  /* oxlint-disable react-hooks/exhaustive-deps, react/react-compiler -- use the latest queued state through refs. */
  useEffect(() => {
    if (!hydrated || !gameId) return;
    const flushLatestState = () => {
      if (dirtyRef.current) void flushSharedState(gameId, { keepalive: true });
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') flushLatestState();
      else if (dirtyRef.current) void flushSharedState(gameId);
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
      if (
        document.visibilityState !== 'visible' ||
        saveInFlightRef.current ||
        conflictRemoteRef.current ||
        (dirtyRef.current && remoteRevisionRef.current > 0)
      )
        return;
      void loadSharedGame(gameId)
        .then((game) => {
          const recovered = pollFailedRef.current;
          pollFailureCountRef.current = 0;
          pollFailedRef.current = false;
          if (recovered && !dirtyRef.current && !conflictRemoteRef.current)
            setSyncStatus('saved');
          if (!game) return;
          const value = extendTournamentToEndTime(game.state);
          const serialized = JSON.stringify(value);
          if (dirtyRef.current && remoteRevisionRef.current === 0) {
            const pendingValue =
              queuedStateRef.current ?? tournamentRef.current;
            if (pendingValue && JSON.stringify(pendingValue) !== serialized) {
              remoteRevisionRef.current = game.revision;
              const conflict = { ...game, state: value };
              conflictRemoteRef.current = conflict;
              setConflictRemote(conflict);
              setSyncStatus('conflict');
              return;
            }
            queuedStateRef.current = null;
            dirtyRef.current = false;
          }
          if (game.revision > remoteRevisionRef.current) {
            remoteRevisionRef.current = game.revision;
            lastRemoteStateRef.current = serialized;
            tournamentRef.current = value;
            setTournament(value);
            setSyncStatus('saved');
          }
        })
        .catch((error: unknown) => {
          // Silently swallowing these let the poll fail forever while the
          // header still claimed the game was in sync.
          const blockingNotice = blockingSyncNotice(error);
          pollFailureCountRef.current += 1;
          if (!blockingNotice && pollFailureCountRef.current < 3) return;
          if (pollFailedRef.current) return;
          pollFailedRef.current = true;
          setSyncStatus('error');
          setNotice(blockingNotice || 'ยังดึงข้อมูลล่าสุดไม่ได้ กำลังลองใหม่');
        });
    }, 15000);
    return () => window.clearInterval(poll);
  }, [hydrated, gameId, conflictRemote]);
  useEffect(
    () => () => {
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    },
    [],
  );
  /* oxlint-enable react-hooks/exhaustive-deps, react/react-compiler */
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
            syncSessionRef.current += 1;
            cancelScheduledRetry();
            tournamentRef.current = demo;
            lastRemoteStateRef.current = '';
            remoteRevisionRef.current = 0;
            queuedStateRef.current = null;
            dirtyRef.current = false;
            gameIdRef.current = '';
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
    const targetGameId = gameIdRef.current;
    const hasUnsavedRemoteState = Boolean(
      targetGameId && JSON.stringify(value) !== lastRemoteStateRef.current,
    );
    tournamentRef.current = value;
    if (hasUnsavedRemoteState) {
      queuedStateRef.current = value;
      dirtyRef.current = true;
    }
    writeLocalBackup(value, targetGameId, hasUnsavedRemoteState);
    setSyncStatus(
      conflictRemoteRef.current
        ? 'conflict'
        : hasUnsavedRemoteState
          ? 'saving'
          : targetGameId
            ? 'saved'
            : 'local',
    );
    setTournament(value);
  }
  async function publishTournament(value: Tournament, message: string) {
    syncSessionRef.current += 1;
    const publishSession = syncSessionRef.current;
    cancelScheduledRetry();
    tournamentRef.current = value;
    lastRemoteStateRef.current = '';
    remoteRevisionRef.current = 0;
    queuedStateRef.current = null;
    dirtyRef.current = false;
    conflictRemoteRef.current = null;
    setConflictRemote(null);
    gameIdRef.current = '';
    setGameId('');
    setSyncStatus('saving');
    setTournament(value);
    setSelectedTeamId(value.teams[0]?.id ?? '');
    setView('home');
    window.history.replaceState({}, '', gamePath());
    try {
      const game = await createSharedGame(value, bangkokDateCode());
      if (publishSession !== syncSessionRef.current) return;
      const storedValue = extendTournamentToEndTime(game.state);
      lastRemoteStateRef.current = JSON.stringify(storedValue);
      remoteRevisionRef.current = game.revision;
      gameIdRef.current = game.id;
      setGameId(game.id);
      setTournament(storedValue);
      tournamentRef.current = storedValue;
      writeLocalBackup(storedValue, game.id, false);
      setSyncStatus('saved');
      window.history.pushState({}, '', gamePath(game.id));
      setNotice(`${message} · แชร์ลิงก์นี้ให้เพื่อนได้เลย`);
    } catch {
      if (publishSession !== syncSessionRef.current) return;
      setSyncStatus('local');
      setNotice(`${message}ในเครื่อง แต่ยังสร้างลิงก์ไม่ได้`);
    }
  }
  function loadDemo() {
    const demo = createDemoTournament();
    syncSessionRef.current += 1;
    cancelScheduledRetry();
    tournamentRef.current = demo;
    gameIdRef.current = '';
    remoteRevisionRef.current = 0;
    lastRemoteStateRef.current = '';
    queuedStateRef.current = null;
    dirtyRef.current = false;
    setGameId('');
    setTournament(demo);
    setRecoverableDraft(null);
    setSyncStatus('local');
    window.history.pushState({}, '', gamePath());
    setView('home');
    setNotice('โหลดข้อมูลตัวอย่างแล้ว · ยังไม่ได้บันทึกขึ้นฐานข้อมูล');
  }
  async function copyGameLink() {
    if (!gameId) {
      setNotice('เกมนี้ยังไม่มีลิงก์ เพราะยังไม่ได้บันทึกขึ้นฐานข้อมูล');
      return;
    }
    const url = `${window.location.origin}${gamePath(gameId)}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice('คัดลอกลิงก์เกมแล้ว ส่งให้เพื่อนได้เลย');
    } catch {
      setNotice(`ลิงก์เกม: ${url}`);
    }
  }
  function openNewSetup() {
    setSetupSource(null);
    setSetupCopyMode(false);
    setView('setup');
  }
  function openAllGames() {
    openRequestRef.current += 1;
    window.history.pushState({}, '', allGamesPath());
    setView('games');
  }
  function closeAllGames() {
    openRequestRef.current += 1;
    const targetPath = gameIdRef.current
      ? gamePath(gameIdRef.current)
      : gamePath();
    window.history.pushState({}, '', targetPath);
    setView('home');
  }
  function openCopySetup() {
    if (!tournament) return;
    setSetupSource(tournament);
    setSetupCopyMode(true);
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
  async function openSharedGame(gameIdToOpen: string, updateHistory = true) {
    const openRequest = ++openRequestRef.current;
    const startingSession = syncSessionRef.current;
    const requestStillRelevant = () =>
      openRequest === openRequestRef.current &&
      startingSession === syncSessionRef.current;
    try {
      const game = await loadSharedGame(gameIdToOpen);
      if (!requestStillRelevant()) return;
      if (!game) {
        setNotice('ไม่พบเกมนี้ในฐานข้อมูล');
        return;
      }
      const value = extendTournamentToEndTime(game.state);
      syncSessionRef.current += 1;
      cancelScheduledRetry();
      lastRemoteStateRef.current = JSON.stringify(value);
      remoteRevisionRef.current = game.revision;
      gameIdRef.current = game.id;
      queuedStateRef.current = null;
      dirtyRef.current = false;
      conflictRemoteRef.current = null;
      setConflictRemote(null);
      setGameId(game.id);
      setTournament(value);
      tournamentRef.current = value;
      writeLocalBackup(value, game.id, false);
      setSyncStatus('saved');
      setSelectedTeamId(value.teams[0]?.id ?? '');
      setSelectedMatchId('');
      if (updateHistory) window.history.pushState({}, '', gamePath(game.id));
      setView('home');
    } catch (error) {
      if (!requestStillRelevant()) return;
      setNotice(blockingSyncNotice(error) || 'เปิดเกมไม่สำเร็จ กรุณาลองใหม่');
    }
  }
  function handleDeletedGame(deletedGameId: string) {
    if (deletedGameId !== gameId) return;
    const stayOnGameList = allGamesFromPath();
    syncSessionRef.current += 1;
    cancelScheduledRetry();
    clearLocalBackup(deletedGameId);
    setTournament(null);
    tournamentRef.current = null;
    gameIdRef.current = '';
    setGameId('');
    setSyncStatus('local');
    lastRemoteStateRef.current = '';
    remoteRevisionRef.current = 0;
    queuedStateRef.current = null;
    dirtyRef.current = false;
    openRequestRef.current += 1;
    window.history.replaceState(
      {},
      '',
      stayOnGameList ? allGamesPath() : gamePath(),
    );
    setView(stayOnGameList ? 'games' : 'home');
  }
  async function deleteCurrentGame() {
    const targetGameId = gameIdRef.current;
    cancelScheduledRetry();
    if (targetGameId) {
      for (
        let attempt = 0;
        saveInFlightRef.current && attempt < 100;
        attempt += 1
      ) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
      }
      if (saveInFlightRef.current) {
        if (dirtyRef.current) scheduleSyncRetry(targetGameId);
        setNotice('ระบบกำลังบันทึกอยู่ กรุณาลองลบอีกครั้ง');
        return false;
      }
      try {
        await deleteSharedGame(targetGameId);
      } catch {
        if (dirtyRef.current) scheduleSyncRetry(targetGameId);
        setNotice('ลบเกมไม่สำเร็จ กรุณาลองใหม่');
        return false;
      }
    }

    clearLocalBackup(targetGameId);
    syncSessionRef.current += 1;
    setTournament(null);
    tournamentRef.current = null;
    gameIdRef.current = '';
    setGameId('');
    setSyncStatus('local');
    lastRemoteStateRef.current = '';
    remoteRevisionRef.current = 0;
    queuedStateRef.current = null;
    dirtyRef.current = false;
    conflictRemoteRef.current = null;
    setConflictRemote(null);
    window.history.pushState({}, '', gamePath());
    setView('home');
    setNotice(
      targetGameId ? 'ลบเกมออกจากฐานข้อมูลแล้ว' : 'ลบการแข่งขันออกจากอุปกรณ์แล้ว',
    );
    return true;
  }
  function recoverDraft() {
    if (!recoverableDraft) return;
    tournamentRef.current = recoverableDraft;
    setTournament(recoverableDraft);
    setRecoverableDraft(null);
    setSyncStatus('local');
    setView('home');
  }
  function discardDraft() {
    clearLocalBackup();
    setRecoverableDraft(null);
    setNotice('ลบข้อมูลร่างในเครื่องแล้ว');
  }
  function useLatestConflictData() {
    if (!conflictRemote) return;
    cancelScheduledRetry();
    const value = extendTournamentToEndTime(conflictRemote.state);
    remoteRevisionRef.current = conflictRemote.revision;
    lastRemoteStateRef.current = JSON.stringify(value);
    queuedStateRef.current = null;
    dirtyRef.current = false;
    tournamentRef.current = value;
    setTournament(value);
    writeLocalBackup(value, gameIdRef.current, false);
    conflictRemoteRef.current = null;
    setConflictRemote(null);
    setSyncStatus('saved');
    setNotice('ใช้ข้อมูลล่าสุดจากฐานข้อมูลแล้ว');
  }
  function overwriteConflictWithLocal() {
    if (!conflictRemote || !tournamentRef.current) return;
    cancelScheduledRetry();
    remoteRevisionRef.current = conflictRemote.revision;
    queuedStateRef.current = tournamentRef.current;
    dirtyRef.current = true;
    conflictRemoteRef.current = null;
    setConflictRemote(null);
    setSyncStatus('saving');
    writeLocalBackup(tournamentRef.current, gameIdRef.current, true);
    window.setTimeout(() => void flushSharedState(), 0);
  }
  /* oxlint-disable react-hooks/exhaustive-deps, react/react-compiler -- browser history selects the game encoded in the URL. */
  useEffect(() => {
    const handlePopState = () => {
      const pathGameId = gameIdFromPath();
      if (pathGameId) {
        void openSharedGame(pathGameId, false);
        return;
      }
      if (allGamesFromPath()) {
        openRequestRef.current += 1;
        setView('games');
        return;
      }
      openRequestRef.current += 1;
      cancelScheduledRetry();
      syncSessionRef.current += 1;
      tournamentRef.current = null;
      gameIdRef.current = '';
      remoteRevisionRef.current = 0;
      queuedStateRef.current = null;
      dirtyRef.current = false;
      conflictRemoteRef.current = null;
      setConflictRemote(null);
      setTournament(null);
      setGameId('');
      setSyncStatus('local');
      setView('home');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  /* oxlint-enable react-hooks/exhaustive-deps, react/react-compiler */
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
                onGames={openAllGames}
                recoverableDraft={recoverableDraft}
                onRecover={recoverDraft}
                onDiscardDraft={discardDraft}
              />
            </>
          )}
          {view === 'games' && (
            <GamesScreen
              onBack={closeAllGames}
              onOpen={(id) => openSharedGame(id)}
              onDeleted={handleDeletedGame}
              onNotice={setNotice}
            />
          )}
          {view === 'setup' && (
            <SetupScreen
              tournament={setupSource}
              copyMode={setupCopyMode}
              onCancel={() => setView('home')}
              onCreate={(value) => {
                setSetupSource(null);
                setSetupCopyMode(false);
                void publishTournament(value, 'สร้างตารางใหม่แล้ว');
              }}
            />
          )}
          {tournament && view === 'home' && (
            <HomeScreen
              tournament={tournament}
              gameId={gameId}
              syncStatus={syncStatus}
              onNavigate={setView}
              onOpenMatch={openMatch}
              onUpdate={applyTournament}
              onPublish={() => void publishTournament(tournament, 'บันทึกเกมแล้ว')}
              onCopyLink={() => void copyGameLink()}
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
            <Suspense
              fallback={
                <div className="grid min-h-[520px] place-items-center font-black text-[#11823b]">
                  <LoaderCircle className="h-6 w-6 animate-spin" />
                  <span className="sr-only">กำลังเปิดกระดานแท็กติก</span>
                </div>
              }
            >
              <TacticsScreen
                tournament={tournament}
                onUpdate={applyTournament}
                onCopyLink={() => void copyGameLink()}
              />
            </Suspense>
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
              onCopySettings={openCopySetup}
              onSave={(value) => {
                applyTournament(value);
                setNotice('บันทึกการตั้งค่าแล้ว');
              }}
              onGames={openAllGames}
              onTeams={() => setView('teams')}
              onDelete={deleteCurrentGame}
            />
          )}
        </div>
        {tournament &&
          !['setup', 'match-detail', 'share', 'games'].includes(view) && (
            <BottomNavigation active={mainView} onChange={setView} />
          )}
        {notice && (
          <output className="fixed bottom-24 left-1/2 z-50 flex w-max max-w-[calc(100vw-32px)] -translate-x-1/2 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-center text-sm leading-5 font-black break-words whitespace-normal text-white shadow-xl">
            <CircleCheck className="h-4 w-4 shrink-0 text-emerald-400" />
            {notice}
          </output>
        )}
        <AlertDialog open={Boolean(conflictRemote)}>
          <AlertDialogContent className="rounded-[24px] p-5">
            <AlertDialogHeader className="place-items-start text-left">
              <AlertDialogTitle className="text-lg font-black">
                มีการแก้ไขจากอีกเครื่อง
              </AlertDialogTitle>
              <AlertDialogDescription className="text-left font-semibold leading-6">
                ระบบหยุดการบันทึกไว้ก่อนเพื่อไม่ให้ข้อมูลของใครถูกทับ เลือกว่าจะโหลดข้อมูลล่าสุด
                หรือใช้ข้อมูลที่อยู่บนเครื่องนี้แทน
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-2 grid gap-2 bg-white">
              <AlertDialogAction
                variant="outline"
                onClick={useLatestConflictData}
                className="h-12 rounded-xl font-black"
              >
                ใช้ข้อมูลล่าสุด
              </AlertDialogAction>
              <AlertDialogAction
                onClick={overwriteConflictWithLocal}
                className="h-12 rounded-xl bg-[#11823b] font-black"
              >
                เก็บข้อมูลเครื่องนี้
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </main>
  );
}
