import { useState, type ReactNode } from 'react'
import { DAILY_GOAL, levelInfo, liveStreak, questProgress, todaysQuests, todayXp, useProfile } from '../lib/game'
import { DailyQuests, HeaderStats } from './GameUI'
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

/** Bottom tabs on phones: the four places you go most, plus "More" for everything else. */
const PRIMARY: NavId[] = ['openings', 'review', 'arena', 'training']

/** App frame: a fixed sidebar on large screens; a slim top bar and bottom tab bar on small ones. */
export function Shell({ active, onNav, onQuest, onSettings, badges = {}, children }: { active: NavId; onNav: (id: NavId) => void; onQuest?: (to: string) => void; onSettings: () => void; badges?: Partial<Record<NavId, number>>; children: ReactNode }) {
  const [more, setMore] = useState(false)
  const go = (id: NavId) => {
    setMore(false)
    onNav(id)
    window.scrollTo(0, 0)
  }
  const inMore = !PRIMARY.includes(active)
  return (
    <div className="min-h-screen">
      <Sidebar active={active} onNav={onNav} onQuest={onQuest} onSettings={onSettings} badges={badges} />

      {/* small screens: top bar */}
      <header className="sticky top-0 z-20 border-b border-white/5 bg-zinc-950/90 backdrop-blur lg:hidden">
        <div className="flex h-12 items-center gap-2 px-3">
          <button onClick={() => go('openings')} className="font-display text-lg leading-none text-zinc-50" aria-label="Home">
            Outpost
          </button>
          <div className="ml-auto flex items-center">
            <HeaderStats onOpen={() => go('profile')} />
            <button className="px-2 py-1 text-lg text-zinc-400 hover:text-zinc-100" onClick={onSettings} title="Settings" aria-label="Settings">
              ⚙
            </button>
          </div>
        </div>
      </header>

      <main className="pb-24 lg:pb-0 lg:pl-60">
        <div className="mx-auto max-w-[1400px] px-3 py-4 sm:px-4 sm:py-6 lg:px-8 lg:py-6 [@media(min-height:900px)]:lg:py-10">{children}</div>
      </main>

      {/* small screens: bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-zinc-950/95 backdrop-blur lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex max-w-lg">
          {PRIMARY.map((id) => {
            const n = NAV.find((x) => x.id === id)!
            return (
              <button key={id} onClick={() => go(id)} className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${active === id ? 'text-brand-400' : 'text-zinc-400'}`}>
                <span className="text-lg leading-none">{n.icon}</span>
                {n.label.replace('Daily review', 'Review')}
                {badges[id] ? <span className="absolute right-[22%] top-1 rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-white">{badges[id]}</span> : null}
              </button>
            )
          })}
          <button onClick={() => setMore((m) => !m)} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${more || inMore ? 'text-brand-400' : 'text-zinc-400'}`}>
            <span className="text-lg leading-none">☰</span>
            More
          </button>
        </div>
      </nav>

      {/* "More" sheet */}
      {more && (
        <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={() => setMore(false)}>
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-zinc-900 p-4 pb-24 ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
            <div className="grid grid-cols-3 gap-2">
              {[...NAV.filter((n) => !PRIMARY.includes(n.id)), { id: 'about' as NavId, label: 'About', icon: 'ⓘ' }].map((n) => (
                <button key={n.id} onClick={() => go(n.id)} className={`flex flex-col items-center gap-1 rounded-xl p-3 text-xs ring-1 ${active === n.id ? 'bg-zinc-800 text-zinc-50 ring-brand-500/40' : 'text-zinc-300 ring-white/10'}`}>
                  <span className="text-xl">{n.icon}</span>
                  {n.label}
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-xl p-3 ring-1 ring-white/10">
              <DailyQuests compact onGo={(to) => (setMore(false), onQuest?.(to))} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Sidebar({ active, onNav, onQuest, onSettings, badges }: { active: NavId; onNav: (id: NavId) => void; onQuest?: (to: string) => void; onSettings: () => void; badges: Partial<Record<NavId, number>> }) {
  const p = useProfile()
  const lv = levelInfo(p.xp)
  const streak = liveStreak(p)
  const today = todayXp(p)
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col overflow-y-auto border-r border-white/5 bg-zinc-950/70 px-4 py-4 backdrop-blur lg:flex [@media(min-height:900px)]:py-6">
      <button onClick={() => onNav('openings')} className="px-2 text-left">
        <span className="font-display block text-2xl leading-none text-zinc-50">Outpost</span>
        <span className="mt-1 block text-[11px] uppercase tracking-[0.3em] text-brand-400">Chess training</span>
      </button>

      <nav className="mt-5 space-y-0.5 [@media(min-height:900px)]:mt-10">
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => onNav(n.id)}
            className={`group flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition [@media(min-height:900px)]:py-2 ${active === n.id ? 'bg-zinc-800/80 text-zinc-50' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'}`}
          >
            <span className={`w-5 text-center text-base ${active === n.id ? 'text-brand-400' : 'text-zinc-500 group-hover:text-zinc-300'}`}>{n.icon}</span>
            {n.label}
            {badges[n.id] ? <span className="ml-auto rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-white">{badges[n.id]}</span> : active === n.id && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-400" />}
          </button>
        ))}
      </nav>

      <div className="mt-auto space-y-3 pt-4 [@media(min-height:900px)]:space-y-4">
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
          <SyncStatus />
        </button>
        <div className="hidden rounded-lg px-2 py-3 ring-1 ring-white/5 [@media(min-height:820px)]:block">
          <DailyQuests compact onGo={onQuest} />
        </div>
        {/* short screens (most laptops): a one-line summary instead of the full quest card */}
        <QuestSummary onOpen={() => onNav('profile')} />
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

function QuestSummary({ onOpen }: { onOpen: () => void }) {
  const p = useProfile()
  const qs = todaysQuests()
  const done = qs.filter((q) => questProgress(p, q).done).length
  return (
    <button onClick={onOpen} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs ring-1 ring-white/5 hover:ring-white/15 [@media(min-height:820px)]:hidden">
      <span className="uppercase tracking-widest text-zinc-500">Daily quests</span>
      <span className={done === 3 ? 'text-emerald-400' : 'text-zinc-300'}>
        {done}/3 {done === 3 ? '✓' : '→'}
      </span>
    </button>
  )
}
