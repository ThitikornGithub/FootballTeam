'use client';

import { RotateCcw } from 'lucide-react';
import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
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

function formationPosition(index: number, isTeamA: boolean) {
  const [x, y] = TEAM_A_POSITIONS[index] ?? [50, 48];
  return { x, y: isTeamA ? y : 100 - y };
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

export function TacticsScreen({
  tournament,
  onUpdate,
}: {
  tournament: Tournament;
  onUpdate: (value: Tournament) => void;
}) {
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
  const board = hasValidTeams ? storedBoard : makeBoard(tournament);
  const teamA = tournament.teams.find((team) => team.id === board.teamAId);
  const teamB = tournament.teams.find((team) => team.id === board.teamBId);

  function updateBoard(nextBoard: TacticsBoard) {
    onUpdate({ ...tournament, tactics: nextBoard });
  }

  function resetBoard(teamAId = board.teamAId, teamBId = board.teamBId) {
    updateBoard({
      ...makeBoard(tournament, teamAId, teamBId),
      notes: board.notes,
    });
  }

  function moveMarker(markerId: string, x: number, y: number) {
    updateBoard({
      ...board,
      markers: board.markers.map((marker) =>
        marker.id === markerId
          ? {
              ...marker,
              x: Math.min(95, Math.max(5, x)),
              y: Math.min(97, Math.max(3, y)),
            }
          : marker,
      ),
    });
  }

  function positionFromPointer(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    const pitch = pitchRef.current;
    if (!pitch) return null;
    const bounds = pitch.getBoundingClientRect();
    return {
      x: Math.min(
        95,
        Math.max(5, ((event.clientX - bounds.left) / bounds.width) * 100),
      ),
      y: Math.min(
        97,
        Math.max(3, ((event.clientY - bounds.top) / bounds.height) * 100),
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

  return (
    <>
      <PageHeader title="กระดานแท็กติก" eyebrow={tournament.name} />
      <div className="space-y-4 px-4 py-4 pb-8">
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
              ลากผู้เล่นและลูกบอลเพื่อจัดแผน · บันทึกอัตโนมัติ
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

        <section
          ref={pitchRef}
          aria-label={`กระดานแท็กติก ${teamA?.name ?? ''} พบ ${teamB?.name ?? ''}`}
          className="relative h-[540px] touch-pan-y overflow-hidden rounded-[26px] border-4 border-white bg-[linear-gradient(180deg,#198b48_0%,#147b3f_50%,#198b48_100%)] shadow-[0_12px_30px_rgba(15,80,40,.22)] select-none"
        >
          <div className="pointer-events-none absolute inset-3 border-2 border-white/80" />
          <div className="pointer-events-none absolute inset-x-3 top-1/2 border-t-2 border-white/80" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/85" />
          <div className="pointer-events-none absolute left-1/2 top-3 h-20 w-3/5 -translate-x-1/2 border-2 border-t-0 border-white/80" />
          <div className="pointer-events-none absolute bottom-3 left-1/2 h-20 w-3/5 -translate-x-1/2 border-2 border-b-0 border-white/80" />
          <div className="pointer-events-none absolute left-1/2 top-3 h-8 w-1/3 -translate-x-1/2 border-2 border-t-0 border-white/80" />
          <div className="pointer-events-none absolute bottom-3 left-1/2 h-8 w-1/3 -translate-x-1/2 border-2 border-b-0 border-white/80" />

          {board.markers.map((marker) => {
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
                  const position = positionFromPointer(event);
                  if (position)
                    setDragPreview({ markerId: marker.id, ...position });
                }}
                onPointerUp={(event) => {
                  if (!event.currentTarget.hasPointerCapture(event.pointerId))
                    return;
                  event.preventDefault();
                  const position = positionFromPointer(event);
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
                className="absolute z-10 flex touch-none -translate-x-1/2 -translate-y-1/2 cursor-grab flex-col items-center outline-none will-change-transform active:cursor-grabbing focus-visible:ring-4 focus-visible:ring-white/80"
                style={{ left: `${preview.x}%`, top: `${preview.y}%` }}
              >
                <span
                  className={`grid place-items-center rounded-full border-white font-black shadow-lg ${isBall ? 'h-7 w-7 border-2 bg-white text-sm' : 'h-10 w-10 border-[3px] text-sm'}`}
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

        <section className="settings-card">
          <label htmlFor="tactics-notes" className="section-title">
            โน้ตแผนการเล่น
          </label>
          <textarea
            id="tactics-notes"
            value={board.notes}
            onChange={(event) =>
              updateBoard({ ...board, notes: event.target.value.slice(0, 500) })
            }
            rows={4}
            placeholder="เช่น เพรสแดนบน, เปลี่ยนตัวทุก 5 นาที, ลูกเตะมุมให้ใครเปิด…"
            className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white p-3 text-base font-semibold leading-6 outline-none focus:border-[#35a95f]"
          />
          <p className="mt-1 text-right text-xs font-bold text-slate-400">
            {board.notes.length}/500
          </p>
        </section>
      </div>
    </>
  );
}
