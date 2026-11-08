import { useMemo, useState } from 'react'
import type { OpeningDef } from '../data/openings'
import { allOpenings, useCustomOpenings } from '../lib/custom'
import { getProgress, isDue, isMastered, medalOf, nextMedalHint, progressOf } from '../lib/progress'
import { MedalBadge } from '../components/GameUI'
import { openingOfWeek, weekBounds } from '../lib/weekly'
import { getTree, userDecisionNodes } from '../lib/tree'

type Filter = 'all' | 'gambit' | 'solid' | 'aggressive' | 'trappy' | 'dubious' | 'due'
type Sort = 'recommended' | 'name' | 'recent' | 'due' | 'least' | 'most' | 'lines' | 'eco'
type SideFilter = 'any' | 'w' | 'b'

const SORTS: { id: Sort; label: string }[] = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'recent', label: 'Recently practiced' },
  { id: 'due', label: 'Most due for review' },
  { id: 'least', label: 'Least progress' },
  { id: 'most', label: 'Most progress' },
  { id: 'lines', label: 'Most lines' },
  { id: 'name', label: 'Name (A–Z)' },
  { id: 'eco', label: 'ECO code' },
]

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'gambit', label: 'Gambits' },
  { id: 'solid', label: 'Solid' },
  { id: 'aggressive', label: 'Aggressive' },
  { id: 'trappy', label: 'Trappy' },
  { id: 'dubious', label: 'Dubious & offbeat' },
  { id: 'due', label: 'Due for review' },
]

const sideName = (s: 'w' | 'b') => (s === 'w' ? 'White' : 'Black')
const PREFS = 'ctt.library.v1'

interface Stats {
  def: OpeningDef
  lines: number
  seen: number
  mastered: number
  progress: number
  medal: number
  medalHint: string
  due: number
  last: number
}

function statsOf(def: OpeningDef): Stats {
  const t = getTree(def)
  const p = getProgress(def.id)
  const decisions = userDecisionNodes(t)
  const now = Date.now()
  let last = 0
  for (const s of Object.values(p.nodes)) last = Math.max(last, s.last)
  return {
    def,
    lines: t.leaves.length,
    seen: t.leaves.filter((l) => p.learned.includes(l.id)).length,
    mastered: decisions.filter((n) => isMastered(p.nodes[n.id])).length,
    progress: decisions.reduce((sum, n) => sum + progressOf(p.nodes[n.id]), 0) / Math.max(1, decisions.length),
    medal: medalOf(decisions.map((n) => n.id), p, now),
    medalHint: nextMedalHint(decisions.map((n) => n.id), p, now),
    due: decisions.filter((n) => p.nodes[n.id] && isDue(p.nodes[n.id], now)).length,
    last,
  }
}

function loadPrefs(): { sort: Sort; view: 'grid' | 'list' } {
  try {
    return { sort: 'recommended', view: 'grid', ...JSON.parse(localStorage.getItem(PREFS) ?? '{}') }
  } catch {
    return { sort: 'recommended', view: 'grid' }
  }
}

export function Library({ onOpen }: { onOpen: (id: string, mode: 'learn' | 'practice', flip: boolean) => void }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [side, setSide] = useState<SideFilter>('any')
  const [query, setQuery] = useState('')
  const [prefs, setPrefsState] = useState(loadPrefs)
  const setPrefs = (p: Partial<typeof prefs>) => {
    const next = { ...prefs, ...p }
    setPrefsState(next)
    try {
      localStorage.setItem(PREFS, JSON.stringify(next))
    } catch {
      /* not persisted */
    }
  }

  const custom = useCustomOpenings()
  const all = useMemo(() => allOpenings().map(statsOf), [custom]) // eslint-disable-line react-hooks/exhaustive-deps
  const q = query.trim().toLowerCase()
  const list = all.filter(({ def: o, due }) => {
    if (side !== 'any' && o.side !== side) return false
    if (filter === 'due' && !due) return false
    if (filter === 'dubious' && !o.tags.some((t) => t === 'dubious' || t === 'meme' || t === 'offbeat')) return false
    if (!['all', 'due', 'dubious'].includes(filter) && !o.tags.includes(filter)) return false
    return !q || `${o.name} ${o.eco} ${o.tags.join(' ')} ${o.summary}`.toLowerCase().includes(q)
  })
  const cmp: Record<Sort, (a: Stats, b: Stats) => number> = {
    recommended: (a, b) => Number(b.def.tags.includes('gambit')) - Number(a.def.tags.includes('gambit')),
    name: (a, b) => a.def.name.localeCompare(b.def.name),
    recent: (a, b) => b.last - a.last,
    due: (a, b) => b.due - a.due,
    least: (a, b) => a.progress - b.progress,
    most: (a, b) => b.progress - a.progress,
    lines: (a, b) => b.lines - a.lines,
    eco: (a, b) => a.def.eco.localeCompare(b.def.eco),
  }
  list.sort(cmp[prefs.sort])

  const recent = [...all].filter((s) => s.last).sort((a, b) => b.last - a.last).slice(0, 3)

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-brand-400">Repertoire</p>
          <h1 className="mt-1 text-3xl font-bold text-zinc-50">Openings</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {all.length} openings · learn the theory, drill it, or train against it with "Face it"
          </p>
        </div>
      </header>

      <WeeklyBanner all={all} onOpen={onOpen} />

      {recent.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Continue</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {recent.map((s) => (
              <button key={s.def.id} onClick={() => onOpen(s.def.id, 'practice', false)} className="group rounded-xl p-4 text-left ring-1 ring-white/5 transition hover:ring-brand-500/40">
                <p className="truncate font-medium text-zinc-100">{s.def.name}</p>
                <p className="mt-1 text-xs text-zinc-500">{s.due ? <span className="text-amber-300">{s.due} due for review</span> : `${Math.round(s.progress * 100)}% progress`}</p>
                <p className="mt-3 text-xs text-brand-400 opacity-70 group-hover:opacity-100">Practice →</p>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input className="input w-full sm:w-64" placeholder="Search name, ECO, tag…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="flex rounded-lg p-0.5 ring-1 ring-white/10" role="group" aria-label="Side">
            {(['any', 'w', 'b'] as const).map((sd) => (
              <button key={sd} onClick={() => setSide(sd)} className={`rounded-md px-3 py-1 text-sm ${side === sd ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-400 hover:text-zinc-100'}`}>
                {sd === 'any' ? 'Both' : sd === 'w' ? '♔ White' : '♚ Black'}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            Sort
            <select className="input" value={prefs.sort} onChange={(e) => setPrefs({ sort: e.target.value as Sort })}>
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex rounded-lg p-0.5 ring-1 ring-white/10" role="group" aria-label="Layout">
            {(['grid', 'list'] as const).map((v) => (
              <button key={v} onClick={() => setPrefs({ view: v })} className={`rounded-md px-2.5 py-1 text-sm ${prefs.view === v ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-400 hover:text-zinc-100'}`} title={v === 'grid' ? 'Cards' : 'List'}>
                {v === 'grid' ? '▦' : '☰'}
              </button>
            ))}
          </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)} className={`chip ${filter === f.id ? 'chip-active' : ''}`}>
              {f.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500">
          {list.length} shown{filter === 'due' && !list.length ? ' — nothing is due right now' : ''}
        </p>

        {prefs.view === 'grid' ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((s) => (
              <Card key={s.def.id} s={s} onOpen={onOpen} />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-white/5 rounded-xl ring-1 ring-white/5">
            {list.map((s) => (
              <Row key={s.def.id} s={s} onOpen={onOpen} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function WeeklyBanner({ all, onOpen }: { all: Stats[]; onOpen: (id: string, mode: 'learn' | 'practice', flip: boolean) => void }) {
  const o = openingOfWeek()
  const s = all.find((x) => x.def.id === o.id)
  const { end } = weekBounds()
  const days = Math.ceil((end.getTime() - Date.now()) / 86_400_000)
  return (
    <section className="relative overflow-hidden rounded-xl p-5 ring-1 ring-brand-500/30">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-brand-500/10 to-transparent" />
      <div className="relative flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.25em] text-brand-400">Opening of the week · ×1.5 XP · {days} day{days === 1 ? '' : 's'} left</p>
          <h2 className="mt-1 text-2xl text-zinc-50">{o.name}</h2>
          <p className="mt-1 line-clamp-2 max-w-2xl text-sm text-zinc-400">{o.summary}</p>
        </div>
        <div className="flex items-center gap-3">
          {s && <MedalBadge tier={s.medal} title={s.medalHint} />}
          <button className="btn-secondary" onClick={() => onOpen(o.id, 'learn', false)}>Learn</button>
          <button className="btn-primary" onClick={() => onOpen(o.id, 'practice', false)}>Practice</button>
        </div>
      </div>
    </section>
  )
}

function Card({ s, onOpen }: { s: Stats; onOpen: (id: string, mode: 'learn' | 'practice', flip: boolean) => void }) {
  const o = s.def
  const pct = Math.round(s.progress * 100)
  const kind = o.tags.filter((t) => ['gambit', 'solid', 'aggressive', 'trappy', 'dubious', 'custom'].includes(t)).slice(0, 2)
  return (
    <article className="group flex flex-col gap-3 rounded-xl p-5 ring-1 ring-white/5 transition hover:ring-white/15">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl leading-tight text-zinc-50">{o.name}</h2>
        <span className="flex shrink-0 items-center gap-2">
          {s.due > 0 && <span className="text-xs text-brand-400">{s.due} due</span>}
          <MedalBadge tier={s.medal} title={s.medalHint} />
        </span>
      </div>
      <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
        {sideName(o.side)} · {o.eco || 'custom'} · {s.lines} lines{kind.length ? ` · ${kind.join(' · ')}` : ''}
      </p>
      <p className="line-clamp-2 flex-1 text-sm leading-relaxed text-zinc-400">{o.summary}</p>
      <div className="h-px bg-zinc-800">
        <div className="h-px bg-brand-400" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center gap-4 text-sm">
        <button className="font-medium text-brand-400 hover:text-brand-300" onClick={() => onOpen(o.id, 'practice', false)}>
          Practice
        </button>
        <button className="text-zinc-300 hover:text-zinc-50" onClick={() => onOpen(o.id, 'learn', false)}>
          Learn
        </button>
        <button className="text-zinc-500 hover:text-zinc-200" onClick={() => onOpen(o.id, 'learn', true)} title={`Train the defense as ${sideName(o.side === 'w' ? 'b' : 'w')}`}>
          Face it
        </button>
        <span className="ml-auto text-xs tabular-nums text-zinc-500" title={s.medalHint}>{pct}%</span>
      </div>
    </article>
  )
}

function Row({ s, onOpen }: { s: Stats; onOpen: (id: string, mode: 'learn' | 'practice', flip: boolean) => void }) {
  const o = s.def
  const pct = Math.round(s.progress * 100)
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-white/[0.02]">
      <span className={`w-5 text-lg ${o.side === 'w' ? 'text-zinc-200' : 'text-zinc-500'}`} title={`as ${sideName(o.side)}`}>
        {o.side === 'w' ? '♔' : '♚'}
      </span>
      <div className="min-w-0 flex-1 basis-48">
        <p className="flex items-center gap-2 truncate font-medium text-zinc-100">{o.name} <MedalBadge tier={s.medal} title={s.medalHint} /></p>
        <p className="text-xs text-zinc-500">
          {o.eco} · {s.lines} lines{s.due ? <span className="text-amber-300"> · {s.due} due</span> : null}
        </p>
      </div>
      <div className="w-28">
        <div className="h-0.5 overflow-hidden rounded bg-zinc-800">
          <div className="h-full bg-brand-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-[11px] text-zinc-500">{pct}%</p>
      </div>
      <div className="flex gap-1.5">
        <button className="btn-secondary !px-2.5 !py-1 text-xs" onClick={() => onOpen(o.id, 'learn', false)}>
          Learn
        </button>
        <button className="btn-primary !px-2.5 !py-1 text-xs" onClick={() => onOpen(o.id, 'practice', false)}>
          Practice
        </button>
        <button className="btn-secondary !px-2.5 !py-1 text-xs" onClick={() => onOpen(o.id, 'learn', true)} title="Train the defense against it">
          Face it
        </button>
      </div>
    </div>
  )
}
