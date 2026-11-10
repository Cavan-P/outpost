import { useState } from 'react'
import { useProfile } from '../lib/game'
import { COLLECTIBLES, isUnlocked, yearStats } from '../lib/meta'
import { BOARDS, saveSettings, useSettings } from '../lib/settings'

const card = 'rounded-xl bg-zinc-900/80 p-4 ring-1 ring-white/5'

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
