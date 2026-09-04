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
  Copy,
  Goal,
  GripVertical,
  Pencil,
  Plus,
  RotateCcw,
  Share2,
  Shield,
  Shuffle,
  Trash2,
  Trophy,
  UserMinus,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { MatchCard } from './match-card';
import {
  BottomNavigation,
  COLOR_HEX,
  COLOR_LABEL,
  type MainView,
  NumberStepper,
  PageHeader,
  StatusDot,
  TeamBadge,
  TeamShirtIcon,
} from './shared';
import { Button } from '@/components/ui/button';
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
  playerFor,
  reopenFinishedMatch,
  reorder,
  scheduleMetrics,
  scheduleWindowMetrics,
  setMatchScore,
  setMatchStatus,
  shuffle,
  skipGoalkeeper,
} from '@/lib/football-engine';
import {
  TEAM_COLORS,
  type Match,
  type Team,
  type TeamColor,
  type Tournament,
} from '@/lib/football-types';

const STORAGE_KEY = 'football-match-maker-v1';
type AppView =
  | MainView
  | 'setup'
  | 'team-detail'
  | 'match-detail'
  | 'standings'
  | 'share';

function formatShareText(tournament: Tournament) {
  const lines = [`⚽ FOOTBALL TODAY — ${tournament.name}`, ''];
  for (const match of tournament.matches) {
    const teamA = tournament.teams.find((team) => team.id === match.teamAId);
    const teamB = tournament.teams.find((team) => team.id === match.teamBId);
    if (!teamA || !teamB) continue;
    const gkA = playerFor(teamA, match.teamAGkPlayerId)?.name ?? '-';
    const gkB = playerFor(teamB, match.teamBGkPlayerId)?.name ?? '-';
    const score =
      match.teamAScore !== undefined && match.teamBScore !== undefined
        ? `  [${match.teamAScore}-${match.teamBScore}]`
        : '';
    lines.push(
      `${match.startTime}  ${teamA.name} vs ${teamB.name}${score}`,
      `GK: ${gkA} / ${gkB}`,
      '',
    );
  }
  return lines.join('\n').trim();
}

function nextMatchAfter(tournament: Tournament, match?: Match) {
  if (!match) return undefined;
  const index = tournament.matches.findIndex((item) => item.id === match.id);
  return tournament.matches
    .slice(index + 1)
    .find((item) => item.status !== 'finished');
}

function GkNameCard({
  label,
  name,
  color,
}: {
  label: string;
  name?: string;
  color: TeamColor;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <p className="truncate text-[10px] font-black uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <Goal className="h-4 w-4" style={{ color: COLOR_HEX[color] }} />
        <p className="truncate text-lg font-black">{name ?? 'ยังไม่มี'}</p>
      </div>
    </div>
  );
}

function CurrentMatchHero({
  tournament,
  match,
  onOpen,
}: {
  tournament: Tournament;
  match: Match;
  onOpen: () => void;
}) {
  const teamA = tournament.teams.find((team) => team.id === match.teamAId)!;
  const teamB = tournament.teams.find((team) => team.id === match.teamBId)!;
  return (
    <button
      onClick={onOpen}
      className="w-full rounded-[26px] border border-[#acd8b8] bg-white p-5 text-left shadow-[0_12px_32px_rgba(17,130,59,.11)] active:scale-[.99]"
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[.12em] text-[#11823b]">
            {match.status === 'current' ? 'กำลังแข่งขัน' : 'แมตช์ถัดไป'}
          </p>
          <p className="text-2xl font-black tabular-nums">{match.startTime}</p>
        </div>
        <span className="rounded-full bg-[#e5f5e9] px-3 py-1.5 text-xs font-black text-[#087632]">
          สนาม 1 · #{match.matchNumber}
        </span>
      </div>
      <div className="grid grid-cols-[1fr_42px_1fr] items-center">
        <div className="flex flex-col items-center gap-1">
          <TeamShirtIcon color={teamA.color} size="lg" />
          <p className="max-w-full truncate text-lg font-black">{teamA.name}</p>
        </div>
        <span className="text-center text-sm font-black text-slate-400">
          VS
        </span>
        <div className="flex flex-col items-center gap-1">
          <TeamShirtIcon color={teamB.color} size="lg" />
          <p className="max-w-full truncate text-lg font-black">{teamB.name}</p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
        <GkNameCard
          label={`GK ${teamA.name}`}
          name={playerFor(teamA, match.teamAGkPlayerId)?.name}
          color={teamA.color}
        />
        <GkNameCard
          label={`GK ${teamB.name}`}
          name={playerFor(teamB, match.teamBGkPlayerId)?.name}
          color={teamB.color}
        />
      </div>
    </button>
  );
}

function EmptyHome({
  onSetup,
  onDemo,
}: {
  onSetup: () => void;
  onDemo: () => void;
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
        สร้างการแข่งขันใหม่
      </Button>
      <Button
        onClick={onDemo}
        variant="outline"
        className="mt-3 h-12 w-full max-w-xs rounded-2xl font-bold"
      >
        ลองด้วยข้อมูลตัวอย่าง
      </Button>
    </div>
  );
}

function HomeScreen({
  tournament,
  onNavigate,
  onOpenMatch,
}: {
  tournament: Tournament;
  onNavigate: (view: AppView) => void;
  onOpenMatch: (id: string) => void;
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
      label: 'สร้างตารางแข่ง',
      note: 'เริ่มรายการใหม่',
      icon: CalendarDays,
      view: 'setup' as AppView,
      tone: 'green',
    },
    {
      label: 'สุ่ม GK',
      note: 'แยกตามแต่ละทีม',
      icon: Shuffle,
      view: 'gk' as AppView,
      tone: 'violet',
    },
    {
      label: 'ดูตารางวันนี้',
      note: `${finished}/${tournament.matches.length} แมตช์`,
      icon: CalendarRange,
      view: 'schedule' as AppView,
      tone: 'blue',
    },
    {
      label: 'แชร์เข้ากลุ่ม',
      note: 'LINE หรือคัดลอก',
      icon: Share2,
      view: 'share' as AppView,
      tone: 'line',
    },
  ];
  return (
    <>
      <PageHeader
        title="Football Match Maker"
        eyebrow={tournament.name}
        action={
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#e1f4e6] text-[#11823b]">
            <Trophy className="h-5 w-5" />
          </div>
        }
      />
      <div className="space-y-5 px-4 py-4">
        <section className="grid grid-cols-2 gap-3">
          {actions.map(({ label, note, icon: Icon, view, tone }) => (
            <button
              key={label}
              onClick={() => onNavigate(view)}
              className="action-card"
              data-accent={tone}
            >
              <span className="action-icon">
                <Icon className="h-7 w-7" />
              </span>
              <span>
                <span className="block text-[15px] font-black">{label}</span>
                <span className="mt-0.5 block text-[11px] font-semibold text-slate-400">
                  {note}
                </span>
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
                แตะการ์ดเพื่อจัดการแมตช์
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
            <CurrentMatchHero
              tournament={tournament}
              match={current}
              onOpen={() => onOpenMatch(current.id)}
            />
          ) : (
            <div className="rounded-3xl bg-[#e5f5e9] p-8 text-center">
              <CircleCheck className="mx-auto mb-2 h-10 w-10 text-[#11823b]" />
              <p className="text-lg font-black">แข่งครบทุกแมตช์แล้ว!</p>
            </div>
          )}
        </section>
        {next && (
          <section className="rounded-[22px] border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-black">แมตช์ถัดไป · {next.startTime}</p>
              <span className="text-xs font-bold text-slate-400">
                #{next.matchNumber}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <TeamBadge
                team={tournament.teams.find(
                  (team) => team.id === next.teamAId,
                )!}
                compact
              />
              <span className="text-xs font-black text-slate-400">VS</span>
              <TeamBadge
                team={tournament.teams.find(
                  (team) => team.id === next.teamBId,
                )!}
                compact
              />
            </div>
          </section>
        )}
        <section className="grid grid-cols-4 divide-x divide-slate-100 rounded-2xl border border-slate-200 bg-white py-3 text-center shadow-sm">
          {[
            [String(tournament.teams.length), 'ทีม'],
            ['1', 'สนาม'],
            [String(tournament.matches.length), 'แมตช์'],
            [endTime, 'จบ'],
          ].map(([value, label]) => (
            <div key={label}>
              <p className="font-black">{value}</p>
              <p className="text-[11px] font-semibold text-slate-500">
                {label}
              </p>
            </div>
          ))}
        </section>
        <Button
          onClick={() => onNavigate('standings')}
          variant="outline"
          className="h-13 w-full rounded-2xl border-[#9dd2ab] font-black text-[#087632]"
        >
          <Trophy />
          ดูตารางคะแนนและผลการแข่งขัน
        </Button>
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
  const [teamCount, setTeamCount] = useState(tournament?.teams.length ?? 4);
  const [drafts, setDrafts] = useState(() =>
    Array.from({ length: 8 }, (_, i) => ({
      name: tournament?.teams[i]?.name ?? defaultNames[i] ?? `Team ${i + 1}`,
      color: tournament?.teams[i]?.color ?? TEAM_COLORS[i],
    })),
  );
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
        name: tournament?.name ?? 'Friendly Match',
        teams,
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
        title="ตั้งค่าการแข่งขัน"
        eyebrow="Round Robin · 1 สนาม"
        onBack={onCancel}
      />
      <div className="space-y-4 px-4 py-4 pb-8">
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
          disabled={!enough}
          className="h-14 w-full rounded-2xl bg-[#11823b] text-base font-black"
        >
          <CalendarDays />
          สร้างตารางแข่งขัน
        </Button>
      </div>
    </>
  );
}

function TeamsScreen({
  tournament,
  onOpenTeam,
  onAddTeam,
}: {
  tournament: Tournament;
  onOpenTeam: (id: string) => void;
  onAddTeam: () => void;
}) {
  return (
    <>
      <PageHeader
        title="ทีมทั้งหมด"
        eyebrow={`${tournament.teams.length} ทีม`}
        action={
          <Button
            onClick={onAddTeam}
            variant="ghost"
            className="h-10 rounded-xl font-black text-[#11823b]"
          >
            <Plus />
            เพิ่มทีม
          </Button>
        }
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
  onRandomize,
}: {
  team: Team;
  onBack: () => void;
  onUpdate: (team: Team) => void;
  onRandomize: () => void;
}) {
  const [newName, setNewName] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
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
              <h2 className="section-title">รายชื่อผู้เล่น</h2>
              <p className="section-note">ลากหรือใช้ลูกศรเพื่อเรียงลำดับ</p>
            </div>
            <Button
              onClick={onRandomize}
              variant="outline"
              className="h-10 rounded-xl border-[#9dd2ab] font-black text-[#087632]"
            >
              <Shuffle />
              สุ่ม GK
            </Button>
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
  const endTime = addMinutes(
    tournament.startTime,
    tournament.availableTimeMinutes,
  );
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [showAllFinished, setShowAllFinished] = useState(false);
  const current = tournament.matches.find(
    (match) => match.status === 'current',
  );
  const upcoming = tournament.matches.filter(
    (match) => match.status === 'upcoming',
  );
  const finished = tournament.matches
    .filter((match) => match.status === 'finished')
    .reverse();
  const visibleUpcoming = showAllUpcoming ? upcoming : upcoming.slice(0, 5);
  const visibleFinished = showAllFinished ? finished : finished.slice(0, 5);
  return (
    <>
      <PageHeader
        title="ตารางการแข่งขัน"
        eyebrow={`${tournament.matches.length} แมตช์ · ถึง ${endTime}`}
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
      <div className="space-y-6 px-4 py-4 pb-6">
        {current && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-black text-[#087632]">กำลังแข่ง</h2>
              <span className="rounded-full bg-[#11823b] px-2.5 py-1 text-xs font-black text-white">
                LIVE
              </span>
            </div>
            <MatchCard
              match={current}
              teams={tournament.teams}
              onClick={() => onOpenMatch(current.id)}
              onFinish={() => onOpenMatch(current.id)}
            />
          </section>
        )}
        {upcoming.length > 0 && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-black">คิวถัดไป</h2>
              <span className="text-sm font-bold text-slate-400">
                {upcoming.length} เกม
              </span>
            </div>
            <div className="space-y-2">
              {visibleUpcoming.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  teams={tournament.teams}
                  onClick={() => onOpenMatch(match.id)}
                  onFinish={() => onOpenMatch(match.id)}
                />
              ))}
            </div>
            {upcoming.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllUpcoming((value) => !value)}
                className="mt-2 h-11 w-full rounded-xl font-black text-[#087632]"
              >
                {showAllUpcoming
                  ? 'ย่อรายการ'
                  : `ดูคิวทั้งหมดอีก ${upcoming.length - 5} เกม`}
              </button>
            )}
          </section>
        )}
        {finished.length > 0 && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-black">แข่งแล้ว</h2>
              <span className="text-sm font-bold text-slate-400">
                {finished.length} เกม
              </span>
            </div>
            <div className="space-y-2">
              {visibleFinished.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  teams={tournament.teams}
                  onClick={() => onOpenMatch(match.id)}
                  onFinish={() => onOpenMatch(match.id)}
                />
              ))}
            </div>
            {finished.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllFinished((value) => !value)}
                className="mt-2 h-11 w-full rounded-xl font-black text-[#087632]"
              >
                {showAllFinished
                  ? 'ย่อรายการ'
                  : `ดูผลย้อนหลังอีก ${finished.length - 5} เกม`}
              </button>
            )}
          </section>
        )}
        <section className="rounded-[22px] border border-dashed border-[#72bf88] bg-[#eef9f1] p-4 text-center">
          <p className="font-black text-[#087632]">ยังเล่นต่อกันอยู่?</p>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            เพิ่มแมตช์ถัดไปและขยายเวลาจบอีก {slotMinutes} นาที
          </p>
          <Button
            onClick={() => onUpdate(extendTournamentByMatches(tournament, 1))}
            className="mt-3 h-12 w-full rounded-xl bg-[#11823b] font-black"
          >
            <Plus />
            เล่นต่ออีก 1 เกม
          </Button>
        </section>
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
  const standings = calculateStandings(tournament);
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
                  <tr
                    key={standing.teamId}
                    className="border-t border-slate-100"
                  >
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

function TeamSelector({
  teams,
  selectedId,
  onSelect,
}: {
  teams: Team[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="scrollbar-none flex gap-2 overflow-x-auto px-4 py-3">
      {teams.map((team) => (
        <button
          key={team.id}
          onClick={() => onSelect(team.id)}
          className={`flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 font-black ${selectedId === team.id ? 'border-[#59b776] bg-[#e9f7ed] text-[#087632]' : 'border-slate-200 bg-white'}`}
        >
          <TeamShirtIcon color={team.color} size="sm" />
          <span>{team.name}</span>
        </button>
      ))}
    </div>
  );
}

function GkScreen({
  tournament,
  selectedId,
  onSelect,
  onUpdate,
  onOpenMatch,
}: {
  tournament: Tournament;
  selectedId: string;
  onSelect: (id: string) => void;
  onUpdate: (value: Tournament) => void;
  onOpenMatch: (id: string) => void;
}) {
  const [mode, setMode] = useState<'queue' | 'shuffle' | 'history'>('queue');
  const team =
    tournament.teams.find((item) => item.id === selectedId) ??
    tournament.teams[0];
  const eligiblePlayers = team.players.filter((player) => !player.absentToday);
  const [draftOrder, setDraftOrder] = useState<string[]>(
    team.gkRotation.filter((id) =>
      eligiblePlayers.some((player) => player.id === id),
    ),
  );
  const [isShuffling, setIsShuffling] = useState(false);
  const [dragOrderIndex, setDragOrderIndex] = useState<number | null>(null);
  const teamMatches = tournament.matches.filter(
    (match) => match.teamAId === team.id || match.teamBId === team.id,
  );
  const currentIndex = teamMatches.findIndex(
    (match) => match.status === 'current',
  );
  const activeIndex =
    currentIndex >= 0
      ? currentIndex
      : teamMatches.findIndex((match) => match.status === 'upcoming');
  const current = teamMatches[activeIndex];
  const next = teamMatches
    .slice(activeIndex + 1)
    .find((match) => match.status !== 'finished');
  const gkFor = (match?: Match) =>
    match
      ? playerFor(
          team,
          match.teamAId === team.id
            ? match.teamAGkPlayerId
            : match.teamBGkPlayerId,
        )
      : undefined;
  function doShuffle() {
    setIsShuffling(true);
    window.setTimeout(() => {
      setDraftOrder(shuffle(eligiblePlayers.map((player) => player.id)));
      setIsShuffling(false);
    }, 900);
  }
  function confirmOrder() {
    const teams = tournament.teams.map((item) =>
      item.id === team.id
        ? { ...item, gkRotation: draftOrder, gkCycleOrders: [draftOrder] }
        : item,
    );
    onUpdate(assignGoalkeepers({ ...tournament, teams }));
    setMode('queue');
  }
  const completed = teamMatches.filter(
    (match) => match.status === 'finished',
  ).length;
  const cycle = eligiblePlayers.length
    ? Math.floor(completed / eligiblePlayers.length) + 1
    : 1;
  return (
    <>
      <PageHeader
        title={`GK ทีม ${team.name}`}
        eyebrow="หมุนเวียนแยกแต่ละทีม"
        action={<TeamShirtIcon color={team.color} size="sm" />}
      />
      <TeamSelector
        teams={tournament.teams}
        selectedId={team.id}
        onSelect={onSelect}
      />
      <div className="mx-4 grid grid-cols-3 rounded-xl bg-slate-100 p-1">
        {(
          [
            ['queue', 'คิว GK'],
            ['shuffle', 'สุ่มลำดับ'],
            ['history', 'ประวัติ'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setMode(value)}
            className={`h-10 rounded-lg text-xs font-black ${mode === value ? 'bg-white text-[#087632] shadow-sm' : 'text-slate-500'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="px-4 py-4 pb-8">
        {mode === 'queue' && (
          <div className="space-y-4">
            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-[22px] border-2 border-[#35a95f] bg-[#f1faf4] p-4">
                <p className="text-[10px] font-black uppercase tracking-[.16em] text-[#11823b]">
                  ตอนนี้
                </p>
                <p className="mt-2 truncate text-2xl font-black">
                  {gkFor(current)?.name ?? '—'}
                </p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {current ? `Match ${current.matchNumber}` : 'ไม่มีแมตช์'}
                </p>
              </div>
              <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-[.16em] text-amber-700">
                  คนถัดไป
                </p>
                <p className="mt-2 truncate text-2xl font-black">
                  {gkFor(next)?.name ?? '—'}
                </p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {next ? `Match ${next.matchNumber}` : 'จบคิวแล้ว'}
                </p>
              </div>
            </section>
            {current && (
              <Button
                variant="outline"
                onClick={() =>
                  onUpdate(skipGoalkeeper(tournament, current.id, team.id))
                }
                className="h-12 w-full rounded-2xl border-amber-300 font-black text-amber-700"
              >
                <UserMinus />
                ข้ามคิว GK คนนี้
              </Button>
            )}
            <section className="settings-card">
              <div className="mb-3">
                <h2 className="section-title">GK Rotation</h2>
                <p className="section-note">ทุกคนจะได้เป็น GK ก่อนเริ่มรอบใหม่</p>
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                {teamMatches.map((match, index) => {
                  const status =
                    match.status === 'finished'
                      ? 'played'
                      : match.status === 'current'
                        ? 'current'
                        : index === activeIndex + 1
                          ? 'next'
                          : 'waiting';
                  return (
                    <button
                      key={match.id}
                      onClick={() => onOpenMatch(match.id)}
                      className="flex w-full items-center gap-3 border-b border-slate-100 bg-white p-3 text-left last:border-0"
                    >
                      <StatusDot status={status} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-black">
                          {gkFor(match)?.name ?? 'ยังไม่มี GK'}
                        </p>
                        <p className="text-xs font-bold text-slate-400">
                          Match {match.matchNumber} · {match.startTime}
                        </p>
                      </div>
                      <span className="text-[10px] font-black text-slate-400">
                        {status === 'played'
                          ? 'PLAYED'
                          : status === 'current'
                            ? 'CURRENT'
                            : status === 'next'
                              ? 'NEXT'
                              : 'WAITING'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        )}
        {mode === 'shuffle' && (
          <div className="space-y-4">
            <section className="rounded-[26px] border border-slate-200 bg-white p-5 text-center">
              <div
                className={`mx-auto grid h-24 w-24 place-items-center rounded-[30px] bg-[#e5f5e9] text-[#11823b] ${isShuffling ? 'animate-shuffle' : ''}`}
              >
                <Goal className="h-12 w-12" />
              </div>
              <h2 className="mt-4 text-xl font-black">
                {isShuffling
                  ? 'กำลังสลับลำดับ…'
                  : draftOrder.length
                    ? 'ลำดับ GK พร้อมแล้ว'
                    : 'ยังไม่มีผู้เล่นที่พร้อม'}
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                ทีม {team.name} · {eligiblePlayers.length} คน
              </p>
            </section>
            <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white">
              {draftOrder.map((id, index) => (
                <div
                  key={id}
                  draggable
                  onDragStart={() => setDragOrderIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragOrderIndex !== null)
                      setDraftOrder(reorder(draftOrder, dragOrderIndex, index));
                    setDragOrderIndex(null);
                  }}
                  className="flex items-center gap-3 border-b border-slate-100 p-3 last:border-0"
                >
                  <GripVertical className="h-5 w-5 text-slate-300" />
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-[#11823b] text-sm font-black text-white">
                    {index + 1}
                  </span>
                  <p className="min-w-0 flex-1 truncate font-black">
                    {team.players.find((player) => player.id === id)?.name}
                  </p>
                  <button
                    disabled={index === 0}
                    onClick={() =>
                      setDraftOrder(reorder(draftOrder, index, index - 1))
                    }
                    className="p-2 disabled:opacity-20"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    disabled={index === draftOrder.length - 1}
                    onClick={() =>
                      setDraftOrder(reorder(draftOrder, index, index + 1))
                    }
                    className="p-2 disabled:opacity-20"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </section>
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={doShuffle}
                disabled={isShuffling || eligiblePlayers.length === 0}
                variant="outline"
                className="h-13 rounded-2xl font-black"
              >
                <Shuffle />
                สุ่มใหม่
              </Button>
              <Button
                onClick={confirmOrder}
                disabled={isShuffling || draftOrder.length === 0}
                className="h-13 rounded-2xl bg-[#11823b] font-black"
              >
                <Check />
                ยืนยันลำดับนี้
              </Button>
            </div>
          </div>
        )}
        {mode === 'history' && (
          <div className="space-y-4">
            <section className="grid grid-cols-3 divide-x divide-slate-100 rounded-[22px] border border-slate-200 bg-white py-4 text-center">
              <div>
                <p className="text-xl font-black text-[#11823b]">{completed}</p>
                <p className="text-[10px] font-bold text-slate-500">
                  COMPLETED
                </p>
              </div>
              <div>
                <p className="text-xl font-black">
                  {Math.max(0, teamMatches.length - completed)}
                </p>
                <p className="text-[10px] font-bold text-slate-500">
                  REMAINING
                </p>
              </div>
              <div>
                <p className="text-xl font-black">{cycle}</p>
                <p className="text-[10px] font-bold text-slate-500">ROUND</p>
              </div>
            </section>
            <section className="settings-card">
              <h2 className="section-title mb-3">Round {cycle}</h2>
              {teamMatches.map((match) => (
                <div
                  key={match.id}
                  className="flex items-center gap-3 border-b border-slate-100 py-3 last:border-0"
                >
                  <span
                    className={`grid h-8 w-8 place-items-center rounded-full ${match.status === 'finished' ? 'bg-[#11823b] text-white' : 'bg-slate-100 text-slate-400'}`}
                  >
                    {match.status === 'finished' ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      match.matchNumber
                    )}
                  </span>
                  <div className="flex-1">
                    <p className="font-black">
                      {gkFor(match)?.name ?? 'ยังไม่มี'}
                    </p>
                    <p className="text-xs font-bold text-slate-400">
                      Match {match.matchNumber} · {match.startTime}
                    </p>
                  </div>
                </div>
              ))}
            </section>
          </div>
        )}
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
  const [scoreA, setScoreA] = useState(match.teamAScore ?? 0);
  const [scoreB, setScoreB] = useState(match.teamBScore ?? 0);
  return (
    <>
      <PageHeader
        title={`Match ${match.matchNumber}`}
        eyebrow={`สนาม 1 · ${match.startTime}`}
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
            <p className="section-note">ใส่ประตูของแต่ละทีมก่อนกดแข่งไปแล้ว</p>
          </div>
          <div className="grid grid-cols-[1fr_32px_1fr] items-end gap-3">
            <label className="text-center">
              <span className="mb-2 block truncate text-sm font-black">
                {teamA.name}
              </span>
              <input
                aria-label={`สกอร์ทีม ${teamA.name}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={99}
                value={scoreA}
                onChange={(event) =>
                  setScoreA(
                    Math.min(99, Math.max(0, Number(event.target.value))),
                  )
                }
                className="h-16 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 text-center text-3xl font-black outline-none focus:border-[#35a95f]"
              />
            </label>
            <span className="pb-5 text-center text-xl font-black text-slate-400">
              -
            </span>
            <label className="text-center">
              <span className="mb-2 block truncate text-sm font-black">
                {teamB.name}
              </span>
              <input
                aria-label={`สกอร์ทีม ${teamB.name}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={99}
                value={scoreB}
                onChange={(event) =>
                  setScoreB(
                    Math.min(99, Math.max(0, Number(event.target.value))),
                  )
                }
                className="h-16 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 text-center text-3xl font-black outline-none focus:border-[#35a95f]"
              />
            </label>
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
                finishMatchWithScore(tournament, match.id, scoreA, scoreB),
              )
            }
            className="h-14 w-full rounded-2xl bg-[#11823b] text-base font-black"
          >
            <Check />
            บันทึกผล · แข่งไปแล้ว
          </Button>
        )}
        {match.status === 'finished' && (
          <div className="space-y-3">
            <Button
              onClick={() =>
                onUpdate(setMatchScore(tournament, match.id, scoreA, scoreB))
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
  onBack,
  onNotice,
}: {
  tournament: Tournament;
  onBack: () => void;
  onNotice: (message: string) => void;
}) {
  const text = formatShareText(tournament);
  async function copy() {
    await navigator.clipboard.writeText(text);
    onNotice('คัดลอกตารางแล้ว');
  }
  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Football Today', text });
        return;
      } catch {
        return;
      }
    }
    await copy();
  }
  return (
    <>
      <PageHeader title="แชร์เข้ากลุ่ม" eyebrow="Football Today" onBack={onBack} />
      <div className="space-y-4 px-4 py-4 pb-8">
        <section className="rounded-[26px] border border-slate-200 bg-white p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e5f5e9] text-[#11823b]">
              <Trophy />
            </div>
            <div>
              <h2 className="text-lg font-black">⚽ FOOTBALL TODAY</h2>
              <p className="text-sm font-bold text-slate-500">
                {tournament.name}
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {tournament.matches.map((match) => {
              const teamA = tournament.teams.find(
                (team) => team.id === match.teamAId,
              )!;
              const teamB = tournament.teams.find(
                (team) => team.id === match.teamBId,
              )!;
              return (
                <div key={match.id} className="rounded-2xl bg-slate-50 p-3">
                  <div className="grid grid-cols-[48px_1fr_24px_1fr] items-center gap-2">
                    <span className="text-sm font-black tabular-nums">
                      {match.startTime}
                    </span>
                    <span className="truncate font-black">{teamA.name}</span>
                    <span className="text-center text-[10px] font-bold text-slate-400">
                      VS
                    </span>
                    <span className="truncate font-black">{teamB.name}</span>
                  </div>
                  <p className="mt-1 pl-14 text-[11px] font-bold text-slate-500">
                    GK: {playerFor(teamA, match.teamAGkPlayerId)?.name ?? '-'} /{' '}
                    {playerFor(teamB, match.teamBGkPlayerId)?.name ?? '-'}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
        <Button
          onClick={share}
          className="h-14 w-full rounded-2xl bg-[#06c755] text-base font-black hover:bg-[#05ad49]"
        >
          <Share2 />
          แชร์ไป LINE / แอปอื่น
        </Button>
        <Button
          onClick={copy}
          variant="outline"
          className="h-13 w-full rounded-2xl font-black"
        >
          <Copy />
          Copy Text
        </Button>
      </div>
    </>
  );
}

function SettingsScreen({
  tournament,
  onEdit,
  onDemo,
  onReset,
}: {
  tournament: Tournament;
  onEdit: () => void;
  onDemo: () => void;
  onReset: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <PageHeader title="ตั้งค่า" eyebrow="Tournament" />
      <div className="space-y-4 px-4 py-4">
        <section className="settings-card">
          <h2 className="section-title">{tournament.name}</h2>
          <p className="section-note mt-1">
            {tournament.teams.length} ทีม · {tournament.matches.length} แมตช์ ·
            เริ่ม {tournament.startTime}
          </p>
          <Button
            onClick={onEdit}
            variant="outline"
            className="mt-4 h-12 w-full rounded-xl font-black"
          >
            <Pencil />
            แก้ไขและสร้างตารางใหม่
          </Button>
        </section>
        <section className="settings-card">
          <h2 className="section-title">ข้อมูลบนอุปกรณ์นี้</h2>
          <p className="section-note mt-1">
            ข้อมูลการแข่งขันบันทึกใน LocalStorage และยังอยู่หลังรีเฟรชหน้า
          </p>
          <Button
            onClick={onDemo}
            variant="outline"
            className="mt-4 h-12 w-full rounded-xl font-black"
          >
            <RotateCcw />
            โหลดข้อมูลตัวอย่างใหม่
          </Button>
        </section>
        <Button
          variant="destructive"
          onClick={() => setConfirming(true)}
          className="h-12 w-full rounded-xl font-black"
        >
          <Trash2 />
          Reset Tournament
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
              ทีม รายชื่อผู้เล่น ตารางแข่งขัน และประวัติ GK จะถูกลบจากอุปกรณ์นี้
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
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<AppView>('home');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [notice, setNotice] = useState('');
  const tournamentRef = useRef<Tournament | null>(null);
  /* oxlint-disable react/react-compiler -- hydration intentionally reads the browser-only store once. */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const savedTournament = JSON.parse(stored) as Tournament;
        setTournament(extendTournamentToEndTime(savedTournament));
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);
  /* oxlint-enable react/react-compiler */
  useEffect(() => {
    tournamentRef.current = tournament;
    if (!hydrated) return;
    if (tournament)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tournament));
    else localStorage.removeItem(STORAGE_KEY);
  }, [tournament, hydrated]);
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
            setTournament(demo);
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
  function loadDemo() {
    const demo = createDemoTournament();
    setTournament(demo);
    setSelectedTeamId(demo.teams[0].id);
    setView('home');
    setNotice('โหลดข้อมูลตัวอย่างแล้ว');
  }
  function openTeam(id: string) {
    setSelectedTeamId(id);
    setView('team-detail');
  }
  function openMatch(id: string) {
    setSelectedMatchId(id);
    setView('match-detail');
  }
  const mainView: MainView = [
    'home',
    'teams',
    'schedule',
    'gk',
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
          {!tournament && view !== 'setup' && (
            <>
              <PageHeader
                title="Football Match Maker"
                eyebrow="Ready when you are"
              />
              <EmptyHome onSetup={() => setView('setup')} onDemo={loadDemo} />
            </>
          )}
          {view === 'setup' && (
            <SetupScreen
              tournament={tournament}
              onCancel={() => setView('home')}
              onCreate={(value) => {
                setTournament(value);
                setSelectedTeamId(value.teams[0]?.id ?? '');
                setView('home');
                setNotice('สร้างตารางแข่งขันแล้ว');
              }}
            />
          )}
          {tournament && view === 'home' && (
            <HomeScreen
              tournament={tournament}
              onNavigate={setView}
              onOpenMatch={openMatch}
            />
          )}
          {tournament && view === 'teams' && (
            <TeamsScreen
              tournament={tournament}
              onOpenTeam={openTeam}
              onAddTeam={() => setView('setup')}
            />
          )}
          {tournament && view === 'team-detail' && selectedTeam && (
            <TeamDetailScreen
              team={selectedTeam}
              onBack={() => setView('teams')}
              onUpdate={(team) =>
                setTournament(
                  assignGoalkeepers({
                    ...tournament,
                    teams: tournament.teams.map((item) =>
                      item.id === team.id ? team : item,
                    ),
                  }),
                )
              }
              onRandomize={() => {
                setSelectedTeamId(selectedTeam.id);
                setView('gk');
              }}
            />
          )}
          {tournament && view === 'schedule' && (
            <ScheduleScreen
              tournament={tournament}
              onOpenMatch={openMatch}
              onUpdate={setTournament}
              onStandings={() => setView('standings')}
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
              onUpdate={setTournament}
            />
          )}
          {tournament && view === 'gk' && selectedTeam && (
            <GkScreen
              key={selectedTeam.id}
              tournament={tournament}
              selectedId={selectedTeam.id}
              onSelect={setSelectedTeamId}
              onUpdate={setTournament}
              onOpenMatch={openMatch}
            />
          )}
          {tournament && view === 'share' && (
            <ShareScreen
              tournament={tournament}
              onBack={() => setView('home')}
              onNotice={setNotice}
            />
          )}
          {tournament && view === 'settings' && (
            <SettingsScreen
              tournament={tournament}
              onEdit={() => setView('setup')}
              onDemo={loadDemo}
              onReset={() => {
                setTournament(null);
                setView('home');
                setNotice('ลบการแข่งขันแล้ว');
              }}
            />
          )}
        </div>
        {tournament &&
          !['setup', 'match-detail', 'team-detail', 'share'].includes(view) && (
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
