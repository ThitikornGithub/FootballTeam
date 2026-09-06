'use client';

import {
  ArrowLeft,
  ArrowRight,
  Footprints,
  Move,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Share2,
  Trash2,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import { Button } from '@/components/ui/button';
import {
  type TacticMarker,
  type TacticsBoard,
  type Team,
  type Tournament,
} from '@/lib/football-types';
import { COLOR_HEX, COLOR_LABEL, PageHeader } from './shared';

const TEAM_A_POSITIONS = [
  [50, 91],
  [24, 77],
  [50, 73],
  [76, 77],
  [32, 60],
  [68, 60],
  [50, 48],
] as const;

const PLAYBACK_MOVE_MS = 1800;
const PLAYBACK_STEP_MS = 2500;
const PLAYBACK_START_DELAY_MS = 350;

function formationPosition(index: number, isTeamA: boolean) {
  const [x, y] = TEAM_A_POSITIONS[index] ?? [50, 48];
  return {
    x: index === 6 ? (isTeamA ? 32 : 68) : x,
    y: isTeamA ? y : 100 - y,
  };
}

function reconcileBoard(
  tournament: Tournament,
  storedBoard: TacticsBoard,
): TacticsBoard {
  const fresh = makeBoard(tournament, storedBoard.teamAId, storedBoard.teamBId);
  const storedByIdentity = new Map(
    storedBoard.markers.map((marker) => [
      marker.kind === 'ball'
        ? 'ball'
        : `${marker.teamId ?? ''}:${marker.playerId ?? marker.id}`,
      marker,
    ]),
  );
  return {
    ...fresh,
    notes: storedBoard.notes,
    markers: fresh.markers.map((marker) => {
      const key =
        marker.kind === 'ball'
          ? 'ball'
          : `${marker.teamId ?? ''}:${marker.playerId ?? marker.id}`;
      const stored = storedByIdentity.get(key);
      return stored ? { ...marker, x: stored.x, y: stored.y } : marker;
    }),
  };
}

function teamMarkers(team: Team, isTeamA: boolean): TacticMarker[] {
  return Array.from({ length: 7 }, (_, index) => {
    const player = team.players[index];
    const position = formationPosition(index, isTeamA);
    return {
      id: `tactic-${isTeamA ? 'a' : 'b'}-${player?.id ?? index + 1}`,
      kind: 'player' as const,
      teamId: team.id,
      playerId: player?.id,
      label: player?.name || `P${index + 1}`,
      ...position,
    };
  });
}

function makeBoard(
  tournament: Tournament,
  teamAId = tournament.teams[0]?.id ?? '',
  teamBId = tournament.teams.find((team) => team.id !== teamAId)?.id ?? '',
): TacticsBoard {
  const teamA = tournament.teams.find((team) => team.id === teamAId);
  const teamB = tournament.teams.find((team) => team.id === teamBId);
  return {
    teamAId,
    teamBId,
    markers: [
      ...(teamA ? teamMarkers(teamA, true) : []),
      ...(teamB ? teamMarkers(teamB, false) : []),
      {
        id: 'tactic-ball',
        kind: 'ball',
        label: 'บอล',
        x: 50,
        y: 50,
      },
    ],
    notes: '',
  };
}

function markerLabel(marker: TacticMarker, tournament: Tournament) {
  if (marker.kind === 'ball') return '⚽';
  const team = tournament.teams.find((item) => item.id === marker.teamId);
  return (
    team?.players.find((player) => player.id === marker.playerId)?.name ||
    marker.label
  );
}

type TacticPath = {
  id: string;
  kind: 'run' | 'pass';
  from: { x: number; y: number };
  to: { x: number; y: number };
};

type TacticStep = {
  id: string;
  title: string;
  markers: TacticMarker[];
  paths: TacticPath[];
};

type TacticTool = 'move' | 'run' | 'pass';

function prototypeId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function copyMarkers(markers: TacticMarker[]) {
  return markers.map((marker) => ({ ...marker }));
}

function markersAtPathDestinations(step: TacticStep) {
  const nextMarkers = copyMarkers(step.markers);
  for (const path of step.paths) {
    const targetMarker =
      path.kind === 'pass'
        ? step.markers.find((marker) => marker.kind === 'ball')
        : step.markers
            .filter((marker) => marker.kind === 'player')
            .map((marker) => ({
              marker,
              distance: Math.hypot(
                marker.x - path.from.x,
                marker.y - path.from.y,
              ),
            }))
            .sort((first, second) => first.distance - second.distance)
            .find(({ distance }) => distance <= 10)?.marker;
    if (!targetMarker) continue;
    const index = nextMarkers.findIndex(
      (marker) => marker.id === targetMarker.id,
    );
    if (index >= 0)
      nextMarkers[index] = {
        ...nextMarkers[index],
        x: path.to.x,
        y: path.to.y,
      };
  }
  return nextMarkers;
}

export function TacticsScreen({ tournament }: { tournament: Tournament }) {
  const pitchRef = useRef<HTMLDivElement>(null);
  const [dragPreview, setDragPreview] = useState<{
    markerId: string;
    x: number;
    y: number;
  } | null>(null);
  const storedBoard = tournament.tactics;
  const hasValidTeams =
    storedBoard &&
    tournament.teams.some((team) => team.id === storedBoard.teamAId) &&
    tournament.teams.some((team) => team.id === storedBoard.teamBId) &&
    storedBoard.teamAId !== storedBoard.teamBId;
  const candidateBoard = hasValidTeams ? storedBoard : makeBoard(tournament);
  const initialBoard = reconcileBoard(tournament, candidateBoard);
  const [board, setBoard] = useState(initialBoard);
  const [steps, setSteps] = useState<TacticStep[]>([
    {
      id: prototypeId('step'),
      title: 'ตำแหน่งเริ่มต้น',
      markers: copyMarkers(initialBoard.markers),
      paths: [],
    },
  ]);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [tool, setTool] = useState<TacticTool>('move');
  const [pathPreview, setPathPreview] = useState<{
    kind: 'run' | 'pass';
    from: { x: number; y: number };
    to: { x: number; y: number };
  } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPathsDuringPlayback, setShowPathsDuringPlayback] = useState(false);
  const [notice, setNotice] = useState('');
  const currentStep = steps[activeStepIndex] ?? steps[0];
  const visibleMarkers = currentStep?.markers ?? board.markers;
  const visiblePaths = isPlaying
    ? showPathsDuringPlayback
      ? activeStepIndex > 0
        ? (steps[activeStepIndex - 1]?.paths ?? [])
        : (currentStep?.paths ?? [])
      : []
    : (currentStep?.paths ?? []);
  const tournamentTeamIds = tournament.teams.map((team) => team.id).join('|');
  const teamA = tournament.teams.find((team) => team.id === board.teamAId);
  const teamB = tournament.teams.find((team) => team.id === board.teamBId);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(
          `football-tactics-staging:${tournament.id}`,
        );
        if (!raw) return;
        const saved = JSON.parse(raw) as {
          board?: TacticsBoard;
          steps?: TacticStep[];
        };
        const savedTeamsAreValid =
          saved.board &&
          tournamentTeamIds.split('|').includes(saved.board.teamAId) &&
          tournamentTeamIds.split('|').includes(saved.board.teamBId);
        if (!savedTeamsAreValid || !saved.steps?.length) return;
        setBoard(saved.board!);
        setSteps(
          saved.steps.slice(0, 8).map((step) => ({
            ...step,
            paths: Array.isArray(step.paths)
              ? step.paths.filter(
                  (path) =>
                    path?.from &&
                    path?.to &&
                    Number.isFinite(path.from.x) &&
                    Number.isFinite(path.from.y) &&
                    Number.isFinite(path.to.x) &&
                    Number.isFinite(path.to.y),
                )
              : [],
          })),
        );
        setActiveStepIndex(0);
        setNotice('โหลดร่าง Local Staging ที่บันทึกไว้แล้ว');
      } catch {
        window.localStorage.removeItem(
          `football-tactics-staging:${tournament.id}`,
        );
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [tournament.id, tournamentTeamIds]);

  useEffect(() => {
    if (!isPlaying) return;
    const reachedLastStep = activeStepIndex >= steps.length - 1;
    const timer = window.setTimeout(
      () => {
        if (reachedLastStep) setIsPlaying(false);
        else setActiveStepIndex((index) => index + 1);
      },
      reachedLastStep
        ? PLAYBACK_STEP_MS
        : activeStepIndex === 0
          ? PLAYBACK_START_DELAY_MS
          : PLAYBACK_STEP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [activeStepIndex, isPlaying, steps.length]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function resetBoard(teamAId = board.teamAId, teamBId = board.teamBId) {
    const nextBoard = {
      ...makeBoard(tournament, teamAId, teamBId),
      notes: board.notes,
    };
    setBoard(nextBoard);
    setSteps([
      {
        id: prototypeId('step'),
        title: 'ตำแหน่งเริ่มต้น',
        markers: copyMarkers(nextBoard.markers),
        paths: [],
      },
    ]);
    setActiveStepIndex(0);
    setTool('move');
    setPathPreview(null);
    setIsPlaying(false);
  }

  function moveMarker(markerId: string, x: number, y: number) {
    setSteps((current) =>
      current.map((step, index) =>
        index === activeStepIndex
          ? {
              ...step,
              markers: step.markers.map((marker) =>
                marker.id === markerId
                  ? {
                      ...marker,
                      x: Math.min(95, Math.max(5, x)),
                      y: Math.min(97, Math.max(3, y)),
                    }
                  : marker,
              ),
            }
          : step,
      ),
    );
  }

  function positionFromPointer(clientX: number, clientY: number) {
    const pitch = pitchRef.current;
    if (!pitch) return null;
    const bounds = pitch.getBoundingClientRect();
    return {
      x: Math.min(
        95,
        Math.max(5, ((clientX - bounds.left) / bounds.width) * 100),
      ),
      y: Math.min(
        97,
        Math.max(3, ((clientY - bounds.top) / bounds.height) * 100),
      ),
    };
  }

  function moveFromKeyboard(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    marker: TacticMarker,
  ) {
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [-2, 0],
      ArrowRight: [2, 0],
      ArrowUp: [0, -2],
      ArrowDown: [0, 2],
    };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    moveMarker(marker.id, marker.x + step[0], marker.y + step[1]);
  }

  function changeTeamA(teamAId: string) {
    const teamBId =
      board.teamBId === teamAId
        ? (tournament.teams.find((team) => team.id !== teamAId)?.id ?? '')
        : board.teamBId;
    resetBoard(teamAId, teamBId);
  }

  function changeTeamB(teamBId: string) {
    resetBoard(board.teamAId, teamBId);
  }

  function addStep() {
    if (!currentStep || steps.length >= 8) return;
    const nextStep: TacticStep = {
      id: prototypeId('step'),
      title: `จังหวะ ${steps.length + 1}`,
      markers: markersAtPathDestinations(currentStep),
      paths: [],
    };
    setSteps((current) => [
      ...current.slice(0, activeStepIndex + 1),
      nextStep,
      ...current.slice(activeStepIndex + 1),
    ]);
    setActiveStepIndex(activeStepIndex + 1);
    setTool('move');
    setPathPreview(null);
    setNotice(
      currentStep.paths.length
        ? 'สร้างจังหวะใหม่และขยับตัวตามลูกศรแล้ว'
        : 'สร้างจังหวะใหม่แล้ว ลากตัวไปตำแหน่งถัดไปได้เลย',
    );
  }

  function removeStep() {
    if (steps.length <= 1) return;
    setSteps((current) =>
      current.filter((_, index) => index !== activeStepIndex),
    );
    setActiveStepIndex(Math.max(0, activeStepIndex - 1));
    setPathPreview(null);
    setIsPlaying(false);
  }

  function updateStepTitle(value: string) {
    setSteps((current) =>
      current.map((step, index) =>
        index === activeStepIndex
          ? { ...step, title: value.slice(0, 40) }
          : step,
      ),
    );
  }

  function chooseTool(nextTool: TacticTool) {
    setTool(nextTool);
    setPathPreview(null);
    setIsPlaying(false);
  }

  function clearPaths() {
    setSteps((current) =>
      current.map((step, index) =>
        index === activeStepIndex ? { ...step, paths: [] } : step,
      ),
    );
    setPathPreview(null);
  }

  function undoLastPath() {
    setSteps((current) =>
      current.map((step, index) =>
        index === activeStepIndex
          ? { ...step, paths: step.paths.slice(0, -1) }
          : step,
      ),
    );
    setPathPreview(null);
  }

  function togglePlayback() {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    if (steps.length < 2) {
      setNotice('เพิ่มอย่างน้อย 2 จังหวะก่อนเล่นแผน');
      return;
    }
    if (activeStepIndex >= steps.length - 1) setActiveStepIndex(0);
    setIsPlaying(true);
    setTool('move');
    setPathPreview(null);
  }

  function savePrototype() {
    window.localStorage.setItem(
      `football-tactics-staging:${tournament.id}`,
      JSON.stringify({ board, steps }),
    );
    setNotice('บันทึกร่างไว้ใน Local Staging แล้ว');
  }

  async function copyPrototypeLink() {
    const link = `${window.location.origin}${window.location.pathname}#tactics-staging`;
    try {
      await navigator.clipboard.writeText(link);
      setNotice('คัดลอกลิงก์ Local Staging แล้ว');
    } catch {
      setNotice('เบราว์เซอร์นี้ยังคัดลอกลิงก์ไม่ได้');
    }
  }

  const toolOptions: Array<{
    id: TacticTool;
    label: string;
    icon: typeof Move;
  }> = [
    { id: 'move', label: 'ย้าย', icon: Move },
    { id: 'run', label: 'เส้นวิ่ง', icon: Footprints },
    { id: 'pass', label: 'ส่งบอล', icon: ArrowRight },
  ];

  return (
    <>
      <PageHeader title="กระดานแท็กติก" eyebrow={tournament.name} />
      <div className="space-y-4 px-4 py-4 pb-8">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs font-black text-amber-800">
          LOCAL STAGING · แบบร่างนี้ยังไม่บันทึกเข้าเกมจริง
        </div>
        <section className="settings-card">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <select
              aria-label="ทีมฝั่งล่าง"
              value={board.teamAId}
              onChange={(event) => changeTeamA(event.target.value)}
              className="h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-2 text-sm font-black outline-none focus:border-[#35a95f]"
            >
              {tournament.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {COLOR_LABEL[team.color]} · {team.name}
                </option>
              ))}
            </select>
            <span className="text-xs font-black text-slate-400">VS</span>
            <select
              aria-label="ทีมฝั่งบน"
              value={board.teamBId}
              onChange={(event) => changeTeamB(event.target.value)}
              className="h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-2 text-sm font-black outline-none focus:border-[#35a95f]"
            >
              {tournament.teams.map((team) => (
                <option
                  key={team.id}
                  value={team.id}
                  disabled={team.id === board.teamAId}
                >
                  {COLOR_LABEL[team.color]} · {team.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs font-bold text-slate-500">
              ลากเพื่อจัดแผน หรือเลือกเส้นแล้วแตะต้นทางและปลายทาง
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => resetBoard()}
              className="h-9 shrink-0 rounded-xl px-3 text-xs font-black"
            >
              <RotateCcw />
              รีเซ็ต
            </Button>
          </div>
        </section>

        <section className="settings-card space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="section-title">จังหวะการเล่น</h2>
              <p className="section-note">สร้างได้สูงสุด 8 จังหวะ</p>
            </div>
            <Button
              type="button"
              onClick={addStep}
              disabled={steps.length >= 8}
              className="h-10 rounded-xl bg-[#11823b] px-3 text-xs font-black"
            >
              <Plus />
              เพิ่มจังหวะ
            </Button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {steps.map((step, index) => (
              <button
                key={step.id}
                type="button"
                onClick={() => {
                  setActiveStepIndex(index);
                  setIsPlaying(false);
                  setPathPreview(null);
                }}
                className={`h-10 shrink-0 rounded-xl px-3 text-sm font-black ${index === activeStepIndex ? 'bg-[#11823b] text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
              >
                {index + 1}. {step.title || `จังหวะ ${index + 1}`}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              aria-label="ชื่อจังหวะ"
              value={currentStep?.title ?? ''}
              onChange={(event) => updateStepTitle(event.target.value)}
              className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-[#35a95f]"
              placeholder="ตั้งชื่อจังหวะ"
            />
            <Button
              type="button"
              variant="outline"
              onClick={removeStep}
              disabled={steps.length <= 1}
              aria-label="ลบจังหวะนี้"
              className="h-11 w-11 shrink-0 rounded-xl p-0 text-red-600"
            >
              <Trash2 />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {toolOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={tool === option.id}
                  onClick={() => chooseTool(option.id)}
                  className={`flex h-11 items-center justify-center gap-1.5 rounded-xl text-xs font-black ${tool === option.id ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
                >
                  <Icon className="h-4 w-4" />
                  {option.label}
                </button>
              );
            })}
          </div>
          {tool !== 'move' && (
            <div className="space-y-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
              <div className="flex items-center justify-between">
                <span>กดลากจากจุดใดก็ได้ไปยังพื้นที่หรือประตู</span>
                <div className="flex shrink-0 gap-3">
                  <button
                    type="button"
                    onClick={undoLastPath}
                    disabled={!currentStep?.paths.length}
                    className="font-black text-slate-700 disabled:opacity-35"
                  >
                    ย้อนเส้น
                  </button>
                  <button
                    type="button"
                    onClick={clearPaths}
                    disabled={!currentStep?.paths.length}
                    className="font-black text-red-600 disabled:opacity-35"
                  >
                    ล้าง
                  </button>
                </div>
              </div>
              <p className="text-xs text-[#087632]">
                เพิ่มจังหวะแล้ว ผู้เล่นตามเส้นวิ่งและลูกบอลตามเส้นส่งจะขยับให้ทันที
              </p>
            </div>
          )}
        </section>

        <section
          ref={pitchRef}
          aria-label={`กระดานแท็กติก ${teamA?.name ?? ''} พบ ${teamB?.name ?? ''}`}
          onPointerDown={(event) => {
            if (tool === 'move' || isPlaying) return;
            event.preventDefault();
            const position = positionFromPointer(event.clientX, event.clientY);
            if (!position) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            setPathPreview({ kind: tool, from: position, to: position });
          }}
          onPointerMove={(event) => {
            if (
              !pathPreview ||
              !event.currentTarget.hasPointerCapture(event.pointerId)
            )
              return;
            event.preventDefault();
            const position = positionFromPointer(event.clientX, event.clientY);
            if (position)
              setPathPreview((current) =>
                current ? { ...current, to: position } : current,
              );
          }}
          onPointerUp={(event) => {
            if (
              !pathPreview ||
              !event.currentTarget.hasPointerCapture(event.pointerId)
            )
              return;
            event.preventDefault();
            const position =
              positionFromPointer(event.clientX, event.clientY) ??
              pathPreview.to;
            const distance = Math.hypot(
              position.x - pathPreview.from.x,
              position.y - pathPreview.from.y,
            );
            if (distance >= 3) {
              const nextPath: TacticPath = {
                id: prototypeId('path'),
                kind: pathPreview.kind,
                from: pathPreview.from,
                to: position,
              };
              setSteps((current) =>
                current.map((step, index) =>
                  index === activeStepIndex
                    ? { ...step, paths: [...step.paths, nextPath] }
                    : step,
                ),
              );
            }
            setPathPreview(null);
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={(event) => {
            setPathPreview(null);
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          className={`relative h-[540px] overscroll-contain overflow-hidden rounded-[26px] border-4 border-white bg-[linear-gradient(180deg,#198b48_0%,#147b3f_50%,#198b48_100%)] shadow-[0_12px_30px_rgba(15,80,40,.22)] select-none ${tool === 'move' ? 'touch-pan-y' : 'touch-none cursor-crosshair'}`}
        >
          <div className="pointer-events-none absolute inset-3 border-2 border-white/80" />
          <div className="pointer-events-none absolute inset-x-3 top-1/2 border-t-2 border-white/80" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/85" />
          <div className="pointer-events-none absolute left-1/2 top-3 h-20 w-3/5 -translate-x-1/2 border-2 border-t-0 border-white/80" />
          <div className="pointer-events-none absolute bottom-3 left-1/2 h-20 w-3/5 -translate-x-1/2 border-2 border-b-0 border-white/80" />
          <div className="pointer-events-none absolute left-1/2 top-3 h-8 w-1/3 -translate-x-1/2 border-2 border-t-0 border-white/80" />
          <div className="pointer-events-none absolute bottom-3 left-1/2 h-8 w-1/3 -translate-x-1/2 border-2 border-b-0 border-white/80" />

          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[5] h-full w-full"
          >
            <defs>
              <marker
                id="tactic-run-arrow"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 Z" fill="#ff9f1c" />
              </marker>
              <marker
                id="tactic-pass-arrow"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 Z" fill="#ffffff" />
              </marker>
            </defs>
            {[
              ...visiblePaths,
              ...(pathPreview ? [{ id: 'path-preview', ...pathPreview }] : []),
            ].map((path) => {
              const isRun = path.kind === 'run';
              return (
                <line
                  key={path.id}
                  x1={`${path.from.x}%`}
                  y1={`${path.from.y}%`}
                  x2={`${path.to.x}%`}
                  y2={`${path.to.y}%`}
                  stroke={isRun ? '#ff9f1c' : '#ffffff'}
                  strokeWidth="4"
                  strokeDasharray={isRun ? '10 8' : undefined}
                  strokeLinecap="round"
                  opacity={path.id === 'path-preview' ? 0.72 : 1}
                  markerEnd={`url(#${isRun ? 'tactic-run-arrow' : 'tactic-pass-arrow'})`}
                  className="drop-shadow-md"
                />
              );
            })}
          </svg>

          {visibleMarkers.map((marker) => {
            const team = tournament.teams.find(
              (item) => item.id === marker.teamId,
            );
            const label = markerLabel(marker, tournament);
            const isBall = marker.kind === 'ball';
            const preview =
              dragPreview?.markerId === marker.id ? dragPreview : marker;
            return (
              <button
                key={marker.id}
                type="button"
                aria-label={`ย้าย ${label}`}
                draggable={false}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (isPlaying || tool !== 'move') return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDragPreview({
                    markerId: marker.id,
                    x: marker.x,
                    y: marker.y,
                  });
                }}
                onPointerMove={(event) => {
                  if (!event.currentTarget.hasPointerCapture(event.pointerId))
                    return;
                  event.preventDefault();
                  const position = positionFromPointer(
                    event.clientX,
                    event.clientY,
                  );
                  if (position)
                    setDragPreview({ markerId: marker.id, ...position });
                }}
                onPointerUp={(event) => {
                  if (!event.currentTarget.hasPointerCapture(event.pointerId))
                    return;
                  event.preventDefault();
                  const position = positionFromPointer(
                    event.clientX,
                    event.clientY,
                  );
                  const finalPosition =
                    position ??
                    (dragPreview?.markerId === marker.id
                      ? dragPreview
                      : marker);
                  moveMarker(marker.id, finalPosition.x, finalPosition.y);
                  setDragPreview(null);
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={(event) => {
                  if (dragPreview?.markerId === marker.id)
                    moveMarker(marker.id, dragPreview.x, dragPreview.y);
                  setDragPreview(null);
                  if (event.currentTarget.hasPointerCapture(event.pointerId))
                    event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onLostPointerCapture={() => setDragPreview(null)}
                onDragStart={(event) => event.preventDefault()}
                onKeyDown={(event) => moveFromKeyboard(event, marker)}
                className={`absolute z-10 flex touch-none -translate-x-1/2 -translate-y-1/2 flex-col items-center outline-none will-change-transform focus-visible:ring-4 focus-visible:ring-white/80 ${isPlaying ? 'transition-[left,top] ease-in-out' : ''} ${tool === 'move' && !isPlaying ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'}`}
                style={{
                  left: `${preview.x}%`,
                  top: `${preview.y}%`,
                  transitionDuration: isPlaying
                    ? `${PLAYBACK_MOVE_MS}ms`
                    : undefined,
                  transitionTimingFunction: isPlaying
                    ? 'cubic-bezier(0.4, 0, 0.2, 1)'
                    : undefined,
                }}
              >
                <span
                  className={`grid place-items-center rounded-full border-white font-black shadow-lg ${isBall ? 'h-6 w-6 border-2 bg-white text-xs' : 'h-10 w-10 border-[3px] text-sm'}`}
                  style={
                    isBall
                      ? undefined
                      : {
                          background: team ? COLOR_HEX[team.color] : '#334155',
                          color: team?.color === 'white' ? '#172019' : '#fff',
                        }
                  }
                >
                  {isBall ? '⚽' : label.slice(0, 2)}
                </span>
                {!isBall && (
                  <span className="mt-0.5 max-w-16 truncate rounded-md bg-slate-950/70 px-1.5 py-0.5 text-[10px] font-black text-white">
                    {label}
                  </span>
                )}
              </button>
            );
          })}
        </section>

        <section className="settings-card space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black text-[#11823b]">PLAYBACK</p>
              <h2 className="section-title">
                จังหวะ {activeStepIndex + 1} จาก {steps.length}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={activeStepIndex === 0 || isPlaying}
                onClick={() => setActiveStepIndex((index) => index - 1)}
                aria-label="จังหวะก่อนหน้า"
                className="h-10 w-10 rounded-full p-0"
              >
                <ArrowLeft />
              </Button>
              <Button
                type="button"
                onClick={togglePlayback}
                aria-label={isPlaying ? 'หยุดเล่นแผน' : 'เล่นแผน'}
                className="h-12 w-12 rounded-full bg-[#11823b] p-0"
              >
                {isPlaying ? <Pause /> : <Play />}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={activeStepIndex >= steps.length - 1 || isPlaying}
                onClick={() => setActiveStepIndex((index) => index + 1)}
                aria-label="จังหวะถัดไป"
                className="h-10 w-10 rounded-full p-0"
              >
                <ArrowRight />
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {steps.map((step, index) => (
              <button
                key={step.id}
                type="button"
                aria-label={`ไปจังหวะ ${index + 1}`}
                onClick={() => {
                  setActiveStepIndex(index);
                  setIsPlaying(false);
                }}
                className={`h-2.5 flex-1 rounded-full transition-colors ${index <= activeStepIndex ? 'bg-[#11823b]' : 'bg-slate-200'}`}
              />
            ))}
          </div>
          <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 text-sm font-black text-slate-700">
            <span>
              แสดงลูกศรตอนเล่น
              <span className="ml-1 text-xs font-bold text-slate-400">
                (ปิดไว้จะดูไหลลื่นกว่า)
              </span>
            </span>
            <input
              type="checkbox"
              checked={showPathsDuringPlayback}
              onChange={(event) =>
                setShowPathsDuringPlayback(event.target.checked)
              }
              className="h-5 w-5 shrink-0 accent-[#11823b]"
            />
          </label>
          <p className="text-center text-xs font-bold text-slate-500">
            {isPlaying ? 'กำลังเล่นแผน…' : currentStep?.title}
          </p>
        </section>

        <section className="settings-card">
          <label htmlFor="tactics-notes" className="section-title">
            โน้ตแผนการเล่น
          </label>
          <textarea
            id="tactics-notes"
            value={board.notes}
            onChange={(event) =>
              setBoard({ ...board, notes: event.target.value.slice(0, 500) })
            }
            rows={4}
            placeholder="เช่น เพรสแดนบน, เปลี่ยนตัวทุก 5 นาที, ลูกเตะมุมให้ใครเปิด…"
            className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white p-3 text-base font-semibold leading-6 outline-none focus:border-[#35a95f]"
          />
          <p className="mt-1 text-right text-xs font-bold text-slate-400">
            {board.notes.length}/500
          </p>
        </section>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            onClick={savePrototype}
            className="h-12 rounded-xl bg-[#11823b] font-black"
          >
            <Save />
            บันทึกร่าง
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void copyPrototypeLink()}
            className="h-12 rounded-xl font-black"
          >
            <Share2 />
            คัดลอกลิงก์
          </Button>
        </div>
        {notice && (
          <div className="sticky bottom-20 z-30 rounded-2xl bg-slate-950 px-4 py-3 text-center text-sm font-black text-white shadow-xl">
            {notice}
          </div>
        )}
      </div>
    </>
  );
}
