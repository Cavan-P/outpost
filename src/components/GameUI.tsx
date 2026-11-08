import { useEffect, useState } from 'react'
import { getSettings } from '../lib/settings'
import { Collection, LeagueCard, SeasonPass, YearReview } from './MetaUI'
import { ACHIEVEMENTS, DAILY_GOAL, MEDALS, MAX_LEVEL, lastDays, levelInfo, liveStreak, onGameEvent, questProgress, resetProfile, titleFor, todaysQuests, todayXp, useProfile, type GameEvent } from '../lib/game'

/** Compact level / XP / streak / daily-goal widget for the header. */
export function HeaderStats({ onOpen }: { onOpen: () => void }) {
  const p = useProfile()
  const lv = levelInfo(p.xp)
  const streak = liveStreak(p)
  const today = todayXp(p)
  return (
    <button onClick={onOpen} className="flex items-center gap-3 rounded-lg px-2 py-1 hover:bg-zinc-800/70" title="Your profile & achievements">
      <span className={`text-sm font-semibold tabular-nums ${streak ? 'text-orange-400' : 'text-zinc-600'}`} title="Day streak">
        🔥{streak}
      </span>
      <span className="hidden md:flex items-center gap-1.5 text-xs text-zinc-400" title={`Daily goal: ${today}/${DAILY_GOAL} XP`}>
        <span className="relative h-5 w-5">
          <svg viewBox="0 0 36 36" className="h-5 w-5 -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-zinc-800)" strokeWidth="5" />
            <circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-brand-500)" strokeWidth="5" strokeDasharray={`${Math.min(1, today / DAILY_GOAL) * 94.2} 94.2`} strokeLinecap="round" />
          </svg>
        </span>
      </span>
      <span className="flex flex-col items-end leading-tight">
        <span className="text-xs font-semibold text-zinc-100">
          Lv {lv.level} <span className="hidden sm:inline text-zinc-400 font-normal">· {lv.title}</span>
        </span>
        <span className="mt-0.5 h-1 w-20 rounded bg-zinc-800 overflow-hidden">
          <span className="block h-full bg-amber-400" style={{ width: `${(lv.into / lv.need) * 100}%` }} />
        </span>
      </span>
    </button>
  )
}

export const MEDAL_ICON: Record<string, string> = { Bronze: '🥉', Silver: '🥈', Gold: '🥇', Diamond: '💠' }

/** A small medal pip for an opening (nothing for tier 0). */
export function MedalBadge({ tier, title }: { tier: number; title?: string }) {
  const m = MEDALS.find((x) => x.tier === tier)
  if (!m) return null
  return (
    <span title={title ?? `${m.name} medal`} className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1" style={{ color: m.color, boxShadow: `inset 0 0 0 1px ${m.color}55` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />
      {m.name}
    </span>
  )
}

/** Today's three quests with progress. `compact` for the sidebar. */
export function DailyQuests({ compact = false }: { compact?: boolean }) {
  const p = useProfile()
  const quests = todaysQuests()
  const done = quests.filter((q) => questProgress(p, q).done).length
  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-widest text-zinc-500">Daily quests</span>
        <span className="text-[11px] text-zinc-500" title="Finish all three for +50 XP and a streak freeze (max 2)">
          {done}/3 · ❄️ {p.freezes ?? 0}
        </span>
      </div>
      {quests.map((q) => {
        const { value, done } = questProgress(p, q)
        return (
          <div key={q.id} className={compact ? '' : 'rounded-lg bg-zinc-900/60 p-3 ring-1 ring-white/5'}>
            <div className="flex items-start gap-2">
              <span className={`mt-px text-xs ${done ? 'text-emerald-400' : 'text-zinc-600'}`}>{done ? '✓' : '○'}</span>
              <span className={`flex-1 ${compact ? 'text-[11px] leading-snug' : 'text-sm'} ${done ? 'text-zinc-500 line-through' : 'text-zinc-300'}`}>{q.text}</span>
              {!compact && <span className="text-xs text-amber-300">+{q.xp} XP</span>}
            </div>
            {!done && q.target > 1 && (
              <div className="ml-5 mt-1 flex items-center gap-2">
                <div className="h-0.5 flex-1 overflow-hidden rounded bg-zinc-800">
                  <div className="h-full bg-brand-400" style={{ width: `${(value / q.target) * 100}%` }} />
                </div>
                <span className="text-[10px] tabular-nums text-zinc-500">
                  {value}/{q.target}
                </span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

interface Toast {
  id: number
  text: string
  tone: 'xp' | 'gold' | 'level'
}

/** Floating notifications for XP gains, achievements and level-ups. */
export function Toasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  useEffect(() => {
    let n = 0
    return onGameEvent((e: GameEvent) => {
      if (e.kind === 'xp' && !getSettings().xpPopups) return
      const id = ++n + Date.now()
      const t: Toast =
        e.kind === 'xp'
          ? { id, text: `+${e.amount} XP${e.label ? ` · ${e.label}` : ''}`, tone: 'xp' }
          : e.kind === 'level'
            ? { id, text: `⬆ Level ${e.level}! ${titleFor(e.level)}`, tone: 'level' }
            : e.kind === 'quest'
              ? { id, text: `📜 Quest done: ${e.text} (+${e.xp} XP)`, tone: 'gold' }
              : e.kind === 'freeze'
                ? { id, text: `❄️ ${e.text}`, tone: 'level' }
                : e.kind === 'info'
                  ? { id, text: e.text, tone: 'level' }
                  : e.kind === 'medal'
                  ? { id, text: `${MEDAL_ICON[e.name] ?? '🏅'} ${e.name} medal · ${e.opening} (+${e.xp} XP)`, tone: 'gold' }
                  : { id, text: `${ACHIEVEMENTS.find((a) => a.id === e.id)?.icon} Achievement: ${ACHIEVEMENTS.find((a) => a.id === e.id)?.name} (+50 XP)`, tone: 'gold' }
      setToasts((ts) => [...ts.slice(-3), t])
      setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), e.kind === 'xp' ? 1800 : 4500)
    })
  }, [])
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-30 flex flex-col items-end gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast-in rounded-lg px-3 py-2 text-sm font-semibold shadow-lg ring-1 ${
            t.tone === 'xp' ? 'bg-zinc-900/95 text-amber-300 ring-amber-400/30' : t.tone === 'level' ? 'bg-brand-600 text-white ring-brand-300/50 text-base' : 'bg-amber-500 text-zinc-950 ring-amber-200/60'
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  )
}

export function ProfilePage() {
  const p = useProfile()
  const lv = levelInfo(p.xp)
  const days = lastDays(p, 21)
  const max = Math.max(DAILY_GOAL, ...days.map((d) => d.xp))
  const unlocked = ACHIEVEMENTS.filter((a) => p.achievements[a.id]).length
  const stat = (label: string, value: number | string) => (
    <div className="rounded-xl bg-zinc-900/80 ring-1 ring-white/5 p-4">
      <p className="text-2xl font-bold text-zinc-50 tabular-nums">{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  )
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold text-zinc-50">
            Level {lv.level} <span className="text-amber-300">{lv.title}</span>
          </h1>
          <p className="text-zinc-400 mt-1">
            {p.xp.toLocaleString()} XP total · {lv.level >= MAX_LEVEL ? 'max level' : `${(lv.need - lv.into).toLocaleString()} XP to level ${lv.level + 1}`}
          </p>
        </div>
      </div>
      <div className="h-3 rounded-full bg-zinc-800 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-amber-500 to-amber-300" style={{ width: `${(lv.into / lv.need) * 100}%` }} />
      </div>

      <section className="rounded-xl bg-zinc-900/80 ring-1 ring-white/5 p-4">
        <DailyQuests />
        <p className="mt-3 text-xs text-zinc-500">
          Finish all three for +50 XP and a streak freeze ❄️ (you can bank 2). A freeze covers a missed day so your streak survives. XP is
          for learning: new positions and reviews that come due pay well; repeating what you just answered pays 1 XP, and grinding the same
          opening or drill all day pays less and less.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <LeagueCard />
        <div className="space-y-4">
          <SeasonPass />
          <YearReview />
        </div>
      </div>
      <Collection />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stat('day streak 🔥', liveStreak(p))}
        {stat('streak freezes ❄️', p.freezes ?? 0)}
        {stat('opening medals', Object.values(p.medals ?? {}).filter((t) => t > 0).length)}
        {stat('lines completed', p.counters.lines ?? 0)}
        {stat('best combo', p.counters.bestCombo ?? 0)}
        {stat('openings mastered', (p.sets.openingsMastered ?? []).length)}
        {stat('endgames solved', (p.sets.endgames ?? []).length)}
        {stat('trap puzzles solved', (p.sets.puzzles ?? []).length)}
        {stat('flawless lines', p.counters.flawless ?? 0)}
        {stat('achievements', `${unlocked}/${ACHIEVEMENTS.length}`)}
      </div>

      <section className="rounded-xl bg-zinc-900/80 ring-1 ring-white/5 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300 mb-3">Last 3 weeks · daily goal {DAILY_GOAL} XP</h2>
        <div className="flex items-end gap-1 h-28">
          {days.map((d) => (
            <div key={d.day} className="flex-1 flex flex-col justify-end h-full" title={`${d.day}: ${d.xp} XP`}>
              <div className={`rounded-t ${d.xp >= DAILY_GOAL ? 'bg-brand-500' : d.xp ? 'bg-brand-800' : 'bg-zinc-800'}`} style={{ height: `${Math.max(4, (d.xp / max) * 100)}%` }} />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300 mb-3">Achievements</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ACHIEVEMENTS.map((a) => {
            const got = p.achievements[a.id]
            return (
              <div key={a.id} className={`flex items-center gap-3 rounded-xl p-3 ring-1 ${got ? 'bg-amber-500/10 ring-amber-400/30' : 'bg-zinc-900/60 ring-white/5 opacity-60'}`}>
                <span className={`emoji text-3xl ${got ? '' : 'grayscale'}`}>{a.icon}</span>
                <div>
                  <p className={`font-semibold ${got ? 'text-amber-200' : 'text-zinc-300'}`}>{a.name}</p>
                  <p className="text-xs text-zinc-400">{a.desc}</p>
                  {got && <p className="text-[11px] text-zinc-500">{new Date(got).toLocaleDateString()}</p>}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <button
        className="text-xs text-zinc-600 hover:text-red-400"
        onClick={() => {
          if (confirm('Reset your XP, streak and achievements? (Opening practice stats are kept.)')) resetProfile()
        }}
      >
        Reset profile
      </button>
    </div>
  )
}
