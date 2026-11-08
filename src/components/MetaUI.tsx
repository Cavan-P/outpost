import { useState } from 'react'
import { useProfile } from '../lib/game'
import { COLLECTIBLES, LEAGUE_COLORS, LEAGUES, SEASON_REWARDS, SEASON_TIERS, XP_PER_TIER, demoteZone, isUnlocked, promoteZone, seasonName, seasonTier, seasonXp, standings, yearStats } from '../lib/meta'
import { BOARDS, saveSettings, useSettings } from '../lib/settings'
import { weekBounds } from '../lib/weekly'

const card = 'rounded-xl bg-zinc-900/80 p-4 ring-1 ring-white/5'

/** Compact league line for the sidebar. */
export function LeagueLine() {
  const p = useProfile()
  const tier = p.league?.tier ?? 0
  const rank = standings(p, tier).findIndex((s) => s.you) + 1
  return (
    <span className="text-[11px] text-zinc-500">
      <span style={{ color: LEAGUE_COLORS[tier] }}>●</span> {LEAGUES[tier]} league · #{rank}
    </span>
  )
}

export function LeagueCard() {
  const p = useProfile()
  const tier = p.league?.tier ?? 0
  const table = standings(p, tier)
  const days = Math.ceil((weekBounds().end.getTime() - Date.now()) / 86_400_000)
  const last = p.league?.history.at(-1)
  return (
    <section className={card}>
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">
          <span style={{ color: LEAGUE_COLORS[tier] }}>●</span> {LEAGUES[tier]} league
        </h2>
        <span className="text-xs text-zinc-500">
          {days} day{days === 1 ? '' : 's'} left · top 3 promote, bottom 3 drop
        </span>
        {last && (
          <span className="ml-auto text-xs text-zinc-500">
            last week: #{last.rank} in {LEAGUES[last.tier]} {last.moved === 1 ? '📈' : last.moved === -1 ? '📉' : ''}
          </span>
        )}
      </div>
      <ol className="space-y-0.5 text-sm">
        {table.map((s, i) => {
          const r = i + 1
          const zone = promoteZone(r) && tier < LEAGUES.length - 1 ? 'text-emerald-400' : demoteZone(r) && tier > 0 ? 'text-red-400' : 'text-zinc-500'
          return (
            <li key={s.name} className={`flex items-center gap-3 rounded px-2 py-1 ${s.you ? 'bg-brand-500/15 ring-1 ring-brand-500/30' : ''}`}>
              <span className={`w-5 text-right tabular-nums ${zone}`}>{r}</span>
              <span className={`flex-1 truncate ${s.you ? 'font-semibold text-zinc-50' : 'text-zinc-300'}`}>{s.name}</span>
              <span className="tabular-nums text-zinc-400">{s.xp.toLocaleString()} XP</span>
            </li>
          )
        })}
      </ol>
      <p className="mt-2 text-[11px] text-zinc-600">Your rivals are simulated from your own recent weeks, so the race stays close however much you play.</p>
    </section>
  )
}

export function SeasonPass() {
  const p = useProfile()
  const xp = seasonXp(p)
  const tier = seasonTier(xp)
  const into = tier >= SEASON_TIERS ? XP_PER_TIER : xp - tier * XP_PER_TIER
  return (
    <section className={card}>
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">🎟️ {seasonName()}</h2>
        <span className="text-xs text-zinc-500">
          tier {tier}/{SEASON_TIERS} · {xp.toLocaleString()} XP this month
        </span>
        <span className="ml-auto text-xs text-zinc-500">{tier < SEASON_TIERS ? `${XP_PER_TIER - into} XP to tier ${tier + 1}` : 'complete!'}</span>
      </div>
      <div className="relative h-2 overflow-hidden rounded bg-zinc-800">
        <div className="h-full bg-gradient-to-r from-brand-600 to-amber-400" style={{ width: `${(Math.min(xp, SEASON_TIERS * XP_PER_TIER) / (SEASON_TIERS * XP_PER_TIER)) * 100}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-10">
        {SEASON_REWARDS.map((r) => {
          const got = tier >= r.tier
          return (
            <div key={r.tier} className={`rounded-lg p-2 text-center ring-1 ${got ? 'bg-amber-500/10 ring-amber-400/40' : 'ring-white/5 opacity-60'}`} title={r.label}>
              <div className="text-lg">{r.icon}</div>
              <div className="text-[10px] text-zinc-400">T{r.tier}</div>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-[11px] text-zinc-600">Resets on the 1st. Rewards are paid automatically when you reach them.</p>
    </section>
  )
}

export function Collection() {
  const p = useProfile()
  const s = useSettings()
  return (
    <section className={card}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-300">Board collection</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {COLLECTIBLES.map((c) => {
          const open = isUnlocked(p, c.id)
          const [light, dark] = BOARDS[c.id].colors
          return (
            <button
              key={c.id}
              disabled={!open}
              onClick={() => saveSettings({ ...s, board: c.id })}
              className={`rounded-lg p-2 text-left ring-1 ${s.board === c.id ? 'ring-brand-500' : 'ring-white/5'} ${open ? 'hover:ring-white/20' : 'opacity-50'}`}
              title={open ? 'Use this board' : c.how}
            >
              <div className={`grid h-12 grid-cols-4 overflow-hidden rounded ${open ? '' : 'grayscale'}`}>
                {Array.from({ length: 8 }, (_, i) => (
                  <span key={i} style={{ background: (i + Math.floor(i / 4)) % 2 ? dark : light }} />
                ))}
              </div>
              <p className="mt-1 text-xs text-zinc-200">
                {open ? '' : '🔒 '}
                {BOARDS[c.id].name}
              </p>
              <p className="text-[10px] text-zinc-500">{open ? (s.board === c.id ? 'in use' : 'tap to use') : c.how}</p>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/** Year in review: a shareable summary card, drawn to a canvas so it can be saved as a PNG. */
export function YearReview() {
  const p = useProfile()
  const [open, setOpen] = useState(false)
  const y = yearStats(p)
  const tiles: [string, string][] = [
    ['XP earned', y.xp.toLocaleString()],
    ['days trained', String(y.days)],
    ['longest streak', `${y.longest} days`],
    ['opening medals', `${y.medals} (${y.golds} gold+)`],
    ['bosses defeated', String(y.bosses)],
    ['puzzles solved', String(y.puzzles)],
    ['endgames solved', String(y.endgames)],
    ['best combo', String(y.bestCombo)],
    ['achievements', String(y.achievements)],
  ]

  function save() {
    const W = 1080
    const H = 1350
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const g = c.getContext('2d')!
    const css = getComputedStyle(document.documentElement)
    const accent = css.getPropertyValue('--color-brand-400').trim() || '#c5a059'
    g.fillStyle = '#050505'
    g.fillRect(0, 0, W, H)
    g.fillStyle = accent
    g.font = '600 34px ui-sans-serif, system-ui'
    g.fillText('OUTPOST · YEAR IN REVIEW', 80, 130)
    g.fillStyle = '#fafafa'
    g.font = '700 150px Georgia, serif'
    g.fillText(String(y.year), 80, 290)
    g.font = '400 44px Georgia, serif'
    g.fillStyle = '#d4d4d8'
    g.fillText(`Level ${y.level.level} · ${y.level.title}`, 80, 370)
    g.fillText(`${y.league} league`, 80, 430)
    tiles.forEach(([label, value], i) => {
      const col = i % 3
      const row = Math.floor(i / 3)
      const x = 80 + col * 320
      const yy = 560 + row * 230
      g.fillStyle = '#18181b'
      g.fillRect(x, yy, 290, 190)
      g.fillStyle = '#fafafa'
      g.font = '700 64px ui-sans-serif, system-ui'
      g.fillText(value, x + 24, yy + 100, 250)
      g.fillStyle = '#a1a1aa'
      g.font = '400 28px ui-sans-serif, system-ui'
      g.fillText(label, x + 24, yy + 150)
    })
    g.fillStyle = '#52525b'
    g.font = '400 26px ui-sans-serif, system-ui'
    g.fillText(location.host || 'outpost', 80, H - 70)
    const a = document.createElement('a')
    a.download = `outpost-${y.year}.png`
    a.href = c.toDataURL('image/png')
    a.click()
  }

  return (
    <section className={card}>
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">{y.year} in review</h2>
        <button className="ml-auto text-xs text-brand-400 hover:underline" onClick={() => setOpen((o) => !o)}>
          {open ? 'hide' : 'show'}
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {tiles.map(([label, value]) => (
              <div key={label} className="rounded-lg bg-zinc-950/60 p-3 ring-1 ring-white/5">
                <p className="text-xl font-bold tabular-nums text-zinc-50">{value}</p>
                <p className="text-xs text-zinc-500">{label}</p>
              </div>
            ))}
          </div>
          {y.bestDay && (
            <p className="text-xs text-zinc-500">
              Biggest day: {new Date(y.bestDay).toLocaleDateString()} with {y.bestDayXp} XP.
            </p>
          )}
          <button className="btn-secondary" onClick={save}>
            Save as image
          </button>
        </div>
      )}
    </section>
  )
}
