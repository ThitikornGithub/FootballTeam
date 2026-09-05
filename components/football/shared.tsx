'use client';

import { ArrowLeft, CalendarRange, Home, Map, Minus, Plus, Settings, Users } from 'lucide-react';
import type { ComponentType } from 'react';

import { Button } from '@/components/ui/button';
import type { Team, TeamColor } from '@/lib/football-types';

export const COLOR_HEX: Record<TeamColor, string> = {
  green: '#159447', red: '#e63d43', blue: '#2962c9', yellow: '#f5b71b',
  white: '#f8fafc', black: '#202422', orange: '#ef7d24', purple: '#7a4dcc',
};

export const COLOR_LABEL: Record<TeamColor, string> = {
  green: 'เขียว', red: 'แดง', blue: 'น้ำเงิน', yellow: 'เหลือง',
  white: 'ขาว', black: 'ดำ', orange: 'ส้ม', purple: 'ม่วง',
};

export function TeamShirtIcon({ color, size = 'md', className = '' }: { color: TeamColor; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const classes = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-20 w-20' : 'h-12 w-12';
  const isWhite = color === 'white';
  return (
    <svg viewBox="0 0 64 64" className={`${classes} shrink-0 drop-shadow-sm ${className}`} aria-hidden="true">
      <path d="M22 7 10 12 3 26l10 5 5-8v34h28V23l5 8 10-5-7-14-12-5c-2 5-18 5-20 0Z" fill={COLOR_HEX[color]} stroke={isWhite ? '#94a3b8' : '#fff'} strokeWidth={isWhite ? 2.5 : 1.5} strokeLinejoin="round" />
    </svg>
  );
}

export function TeamBadge({ team, compact = false }: { team: Team; compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <TeamShirtIcon color={team.color} size={compact ? 'sm' : 'md'} />
      <div className="min-w-0"><p className="truncate font-black">{team.name}</p>{!compact && <p className="text-xs font-semibold text-slate-500">{team.players.length} คน</p>}</div>
    </div>
  );
}

export function PageHeader({ title, eyebrow, onBack, action }: { title: string; eyebrow?: string; onBack?: () => void; action?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex min-h-[70px] items-center gap-3 border-b border-slate-200/80 bg-white/95 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
      {onBack && <button onClick={onBack} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100" aria-label="ย้อนกลับ"><ArrowLeft className="h-5 w-5" /></button>}
      <div className="min-w-0 flex-1">{eyebrow && <p className="text-[10px] font-black uppercase tracking-[.14em] text-[#11823b]">{eyebrow}</p>}<h1 className="truncate text-xl font-black tracking-tight">{title}</h1></div>
      {action}
    </header>
  );
}

export type MainView = 'home' | 'teams' | 'schedule' | 'tactics' | 'settings';

const navItems: Array<{ view: MainView; label: string; icon: ComponentType<{ className?: string }> }> = [
  { view: 'home', label: 'หน้าหลัก', icon: Home },
  { view: 'teams', label: 'ทีม', icon: Users },
  { view: 'schedule', label: 'ตาราง', icon: CalendarRange },
  { view: 'tactics', label: 'แท็กติก', icon: Map },
  { view: 'settings', label: 'ตั้งค่า', icon: Settings },
];

export function BottomNavigation({ active, onChange }: { active: MainView; onChange: (view: MainView) => void }) {
  return (
    <nav aria-label="เมนูหลัก" className="sticky bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 px-1 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
      {navItems.map(({ view, label, icon: Icon }) => (
        <button key={view} onClick={() => onChange(view)} className={`nav-item ${active === view ? 'is-active' : ''}`} aria-current={active === view ? 'page' : undefined}>
          <Icon className="h-5 w-5" /><span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

export function NumberStepper({ value, min, max, onChange, suffix }: { value: number; min: number; max: number; onChange: (value: number) => void; suffix?: string }) {
  return (
    <div className="flex items-center gap-3">
      <Button type="button" variant="outline" size="icon-lg" className="h-11 w-11 rounded-xl" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="ลด"><Minus /></Button>
      <div className="min-w-20 text-center"><span className="text-2xl font-black tabular-nums">{value}</span>{suffix && <span className="ml-1 text-sm font-bold text-slate-500">{suffix}</span>}</div>
      <Button type="button" variant="outline" size="icon-lg" className="h-11 w-11 rounded-xl" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="เพิ่ม"><Plus /></Button>
    </div>
  );
}
