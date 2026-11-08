import type { ReactNode } from 'react'
import { DAILY_GOAL, levelInfo, liveStreak, todayXp, useProfile } from '../lib/game'
import { DailyQuests, HeaderStats } from './GameUI'
import { LeagueLine } from './MetaUI'
import { SyncStatus } from './SyncPanel'

export type NavId = 'openings' | 'review' | 'games' | 'builder' | 'arena' | 'training' | 'endgames' | 'analysis' | 'profile' | 'about'

const NAV: { id: NavId; label: string; icon: string }[] = [
  { id: 'openings', label: 'Openings', icon: '♞' },
  { id: 'review', label: 'Daily review', icon: '↻' },
  { id: 'games', label: 'My Games', icon: '◧' },
  { id: 'builder', label: 'My Repertoire', icon: '✎' },
  { id: 'arena', label: 'Arena', icon: '⚔' },
  { id: 'training', label: 'Training', icon: '◎' },
  { id: 'endgames', label: 'Endgames', icon: '♔' },
  { id: 'analysis', label: 'Analysis', icon: '⌕' },
  { id: 'profile', label: 'Profile', icon: '★' },
]

/** App frame: a fixed sidebar on large screens, a compact top bar on small ones. */
export function Shell({ active, onNav, onSettings, badges = {}, children }: { active: NavId; onNav: (id: NavId) => void; onSettings: () => void; badges?: Partial<Record<NavId, number>>; children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <Sidebar active={active} onNav={onNav} onSettings={onSettings} badges={badges} />

      {/* small screens */}
      <header className="lg:hidden sticky top-0 z-20 border-b border-white/5 bg-zinc-950/90 backdrop-blur">
        <div className="flex h-14 items-center gap-1 px-3">
          <button onClick={() => onNav('openings')} className="mr-2 text-xl leading-none text-brand-400" aria-label="Home">
            ♞
          </button>
          <nav className="flex gap-0.5 overflow-x-auto">
            {NAV.filter((n) => n.id !== 'profile').map((n) => (
              <button key={n.id} onClick={() => onNav(n.id)} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-sm ${active === n.id ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-400'}`}>
                {n.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center">
            <HeaderStats onOpen={() => onNav('profile')} />
            <button className="px-1 text-zinc-400 hover:text-zinc-100" onClick={() => onNav('about')} title="About & credits">
              ⓘ
            </button>
            <button className="px-1 text-zinc-400 hover:text-zinc-100" onClick={onSettings} title="Settings">
              ⚙
            </button>
          </div>
        </div>
      </header>

      <main className="lg:pl-60">
        <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-10">{children}</div>
      </main>
    </div>
  )
}

function Sidebar({ active, onNav, onSettings, badges }: { active: NavId; onNav: (id: NavId) => void; onSettings: () => void; badges: Partial<Record<NavId, number>> }) {
  const p = useProfile()
  const lv = levelInfo(p.xp)
  const streak = liveStreak(p)
  const today = todayXp(p)
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-white/5 bg-zinc-950/70 px-4 py-6 backdrop-blur lg:flex">
      <button onClick={() => onNav('openings')} className="px-2 text-left">
        <span className="font-display block text-2xl leading-none text-zinc-50">Outpost</span>
        <span className="mt-1 block text-[11px] uppercase tracking-[0.3em] text-brand-400">Chess training</span>
      </button>

      <nav className="mt-10 space-y-0.5">
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => onNav(n.id)}
            className={`group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm transition ${active === n.id ? 'bg-zinc-800/80 text-zinc-50' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'}`}
          >
            <span className={`w-5 text-center text-base ${active === n.id ? 'text-brand-400' : 'text-zinc-500 group-hover:text-zinc-300'}`}>{n.icon}</span>
            {n.label}
            {badges[n.id] ? <span className="ml-auto rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-white">{badges[n.id]}</span> : active === n.id && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-400" />}
          </button>
        ))}
      </nav>

      <div className="mt-auto space-y-4">
        <button onClick={() => onNav('profile')} className="block w-full rounded-lg px-2 py-3 text-left ring-1 ring-white/5 hover:ring-white/10">
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-widest text-zinc-500">Level {lv.level}</span>
            <span className={`text-xs ${streak ? 'text-orange-400' : 'text-zinc-600'}`}>🔥 {streak}</span>
          </div>
          <p className="font-display mt-0.5 text-lg text-zinc-100">{lv.title}</p>
          <div className="mt-2 h-0.5 overflow-hidden rounded bg-zinc-800">
            <div className="h-full bg-brand-400" style={{ width: `${(lv.into / lv.need) * 100}%` }} />
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">
            Today {Math.min(today, DAILY_GOAL)}/{DAILY_GOAL} XP{today >= DAILY_GOAL ? ' ✓' : ''}
          </p>
          <LeagueLine />
          <SyncStatus />
        </button>
        <button onClick={() => onNav('profile')} className="block w-full rounded-lg px-2 py-3 text-left ring-1 ring-white/5 hover:ring-white/10">
          <DailyQuests compact />
        </button>
        <div>
          <button onClick={onSettings} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100">
            <span className="w-5 text-center">⚙</span>
            Settings
          </button>
          <button
            onClick={() => onNav('about')}
            className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-zinc-900 hover:text-zinc-100 ${active === 'about' ? 'text-zinc-50' : 'text-zinc-400'}`}
          >
            <span className="w-5 text-center">ⓘ</span>
            About & credits
          </button>
        </div>
      </div>
    </aside>
  )
}
