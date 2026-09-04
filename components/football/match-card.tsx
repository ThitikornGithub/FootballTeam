'use client';

import { Check, ChevronRight } from 'lucide-react';

import { TeamShirtIcon } from './shared';
import type { Match, Team } from '@/lib/football-types';

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
        ? 'border-slate-200 bg-slate-50'
        : 'border-slate-200 bg-white';
  const hasScore =
    match.teamAScore !== undefined && match.teamBScore !== undefined;
  return (
    <article
      className={`overflow-hidden rounded-[20px] border transition ${stateClass}`}
    >
      <button
        aria-label={`เปิด Match ${match.matchNumber}: ${teamA.name} พบ ${teamB.name}`}
        onClick={onClick}
        className="grid w-full grid-cols-[58px_1fr_auto] items-center gap-3 p-3 text-left active:scale-[.99]"
      >
        <div>
          <p className="text-base font-black tabular-nums">{match.startTime}</p>
          <p className="mt-0.5 text-xs font-bold text-slate-400">
            เกม {match.matchNumber}
          </p>
        </div>
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <TeamShirtIcon color={teamA.color} size="sm" />
            <span className="truncate font-black">{teamA.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <TeamShirtIcon color={teamB.color} size="sm" />
            <span className="truncate font-black">{teamB.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {hasScore ? (
            <div className="grid gap-1 text-right text-lg font-black tabular-nums text-[#087632]">
              <span>{match.teamAScore}</span>
              <span>{match.teamBScore}</span>
            </div>
          ) : (
            <span
              className={`rounded-full px-2 py-1 text-xs font-black ${match.status === 'current' ? 'bg-[#11823b] text-white' : 'bg-slate-100 text-slate-500'}`}
            >
              {match.status === 'current' ? 'LIVE' : 'รอ'}
            </span>
          )}
          <ChevronRight className="h-5 w-5 text-slate-300" />
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
            ใส่สกอร์ · แข่งไปแล้ว
          </button>
        </div>
      )}
    </article>
  );
}
