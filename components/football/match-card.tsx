'use client';

import { Check, ChevronRight, Goal } from 'lucide-react';

import { TeamShirtIcon } from './shared';
import type { Match, Team } from '@/lib/football-types';
import { playerFor } from '@/lib/football-engine';

export function MatchCard({
  match,
  teams,
  onClick,
  onFinish,
}: {
  match: Match;
  teams: Team[];
  onClick: () => void;
  onFinish: () => void;
}) {
  const teamA = teams.find((team) => team.id === match.teamAId);
  const teamB = teams.find((team) => team.id === match.teamBId);
  if (!teamA || !teamB) return null;
  const stateClass =
    match.status === 'current'
      ? 'border-[#38a65c] bg-[#f4fbf6] shadow-[0_8px_22px_rgba(17,130,59,.10)]'
      : match.status === 'finished'
        ? 'border-slate-200 bg-slate-50 opacity-65'
        : 'border-slate-200 bg-white';
  const label =
    match.status === 'current'
      ? 'กำลังแข่ง'
      : match.status === 'finished'
        ? 'จบแล้ว'
        : 'รอแข่ง';
  return (
    <article
      className={`overflow-hidden rounded-[20px] border transition ${stateClass}`}
    >
      <button
        aria-label={`เปิด Match ${match.matchNumber}: ${teamA.name} พบ ${teamB.name}`}
        onClick={onClick}
        className="w-full p-4 text-left active:scale-[.99]"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-black tabular-nums">
              {match.startTime}
            </span>
            <span
              className={`rounded-full px-2 py-1 text-[10px] font-black ${match.status === 'current' ? 'bg-[#11823b] text-white' : 'bg-slate-100 text-slate-500'}`}
            >
              {label}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs font-bold text-slate-400">
            #{match.matchNumber}
            <ChevronRight className="h-4 w-4" />
          </div>
        </div>
        <div className="grid grid-cols-[1fr_36px_1fr] items-center">
          <div className="flex items-center gap-2">
            <TeamShirtIcon color={teamA.color} size="sm" />
            <span className="truncate font-black">{teamA.name}</span>
          </div>
          <span className="text-center text-xs font-black text-slate-400">
            VS
          </span>
          <div className="flex items-center justify-end gap-2">
            <span className="truncate font-black">{teamB.name}</span>
            <TeamShirtIcon color={teamB.color} size="sm" />
          </div>
        </div>
        {match.teamAScore !== undefined && match.teamBScore !== undefined && (
          <div className="mt-3 rounded-xl bg-white/80 py-2 text-center text-2xl font-black tabular-nums text-[#087632]">
            {match.teamAScore} - {match.teamBScore}
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200/70 pt-3 text-xs font-bold text-slate-600">
          <span className="flex items-center gap-1.5">
            <Goal className="h-4 w-4 text-[#11823b]" />
            GK: {playerFor(teamA, match.teamAGkPlayerId)?.name ?? 'ยังไม่มี'}
          </span>
          <span className="flex items-center justify-end gap-1.5">
            GK: {playerFor(teamB, match.teamBGkPlayerId)?.name ?? 'ยังไม่มี'}
            <Goal className="h-4 w-4 text-[#11823b]" />
          </span>
        </div>
      </button>
      {match.status === 'current' && (
        <div className="border-t border-[#b9dec4] bg-white p-3">
          <button
            type="button"
            onClick={onFinish}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#11823b] font-black text-white active:scale-[.99]"
          >
            <Check className="h-5 w-5" />
            แข่งไปแล้ว
          </button>
        </div>
      )}
    </article>
  );
}
