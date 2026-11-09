import { useMemo, useState } from 'react'
import type { OpeningDef } from '../data/openings'
import { allOpenings, useCustomOpenings } from '../lib/custom'
import { getProgress, isDue, isMastered, medalOf, nextMedalHint, progressOf } from '../lib/progress'
import { MedalBadge } from '../components/GameUI'
import { openingOfWeek, weekBounds } from '../lib/weekly'
import { getTree, isMistake, userDecisionNodes, type OpeningTree, type TreeNode } from '../lib/tree'
import { MiniBoard } from '../components/MiniBoard'

type Style = 'all' | 'gambit' | 'solid' | 'aggressive' | 'trappy' | 'dubious'
type Status = 'all' | 'started' | 'due' | 'new' | 'medal'
type First = 'any' | 'e4' | 'd4' | 'other'
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

const STYLES: { id: Style; label: string }[] = [
  { id: 'all', label: 'Any style' },
  { id: 'gambit', label: 'Gambits' },
  { id: 'solid', label: 'Solid' },
  { id: 'aggressive', label: 'Aggressive' },
  { id: 'trappy', label: 'Trappy' },
  { id: 'dubious', label: 'Dubious & offbeat' },
]

const STATUSES: { id: Status; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'started', label: 'In my repertoire' },
  { id: 'due', label: 'Due for review' },
  { id: 'new', label: 'Not started' },
  { id: 'medal', label: 'Medal earned' },
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
  started: boolean
  /** the position after the main line's first ~10 moves, for the card thumbnail */
  fen: string
  lastUci?: string
  first: string // White's first move
}

/** Follow the first book reply at every step (the main line) for up to 10 plies. */
function mainLine(t: OpeningTree): TreeNode {
  let n = t.root
  while (n.ply < 10) {
    const next = n.children.find((c) => !isMistake(c))
    if (!next) break
    n = next
  }
  return n
}

function statsOf(def: OpeningDef): Stats {
  const t = getTree(def)
  const p = getProgress(def.id)
  const decisions = userDecisionNodes(t)
  const now = Date.now()
  let last = 0
  for (const s of Object.values(p.nodes)) last = Math.max(last, s.last)
  const seen = t.leaves.filter((l) => p.learned.includes(l.id)).length
  const main = mainLine(t)
  return {
    def,
    lines: t.leaves.length,
    seen,
    mastered: decisions.filter((n) => isMastered(p.nodes[n.id])).length,
    progress: decisions.reduce((sum, n) => sum + progressOf(p.nodes[n.id]), 0) / Math.max(1, decisions.length),
    medal: medalOf(decisions.map((n) => n.id), p, now),
    medalHint: nextMedalHint(decisions.map((n) => n.id), p, now),
    due: decisions.filter((n) => p.nodes[n.id] && isDue(p.nodes[n.id], now)).length,
    last,
    started: last > 0 || seen > 0,
    fen: main.fen,
    lastUci: main.uci || undefined,
    first: t.root.children[0]?.san ?? '',
  }
}

function loadPrefs(): { sort: Sort; view: 'grid' | 'list' } {
  try {
    return { sort: 'recommended', view: 'grid', ...JSON.parse(localStorage.getItem(PREFS) ?? '{}') }
  } catch {
    return { sort: 'recommended', view: 'grid' }
  }
}

type Open = (id: string, mode: 'learn' | 'practice', flip: boolean) => void

export function Library({ onOpen }: { onOpen: Open }) {
  const [style, setStyle] = useState<Style>('all')
  const [status, setStatus] = useState<Status>('all')
  const [first, setFirst] = useState<First>('any')
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
  const list = all.filter((s) => {
    const o = s.def
    if (side !== 'any' && o.side !== side) return false
    if (style === 'dubious' && !o.tags.some((t) => t === 'dubious' || t === 'meme' || t === 'offbeat')) return false
    if (style !== 'all' && style !== 'dubious' && !o.tags.includes(style)) return false
    if (status === 'started' && !s.started) return false
    if (status === 'new' && s.started) return false
    if (status === 'due' && !s.due) return false
    if (status === 'medal' && !s.medal) return false
    if (first === 'e4' && s.first !== 'e4') return false
    if (first === 'd4' && s.first !== 'd4') return false
    if (first === 'other' && ['e4', 'd4'].includes(s.first)) return false
    return !q || `${o.name} ${o.eco} ${o.tags.join(' ')} ${o.summary}`.toLowerCase().includes(q)
  })
  const cmp: Record<Sort, (a: Stats, b: Stats) => number> = {
    recommended: (a, b) => b.due - a.due || b.last - a.last || Number(b.def.tags.includes('gambit')) - Number(a.def.tags.includes('gambit')) || a.def.name.localeCompare(b.def.name),
    name: (a, b) => a.def.name.localeCompare(b.def.name),
    recent: (a, b) => b.last - a.last,
    due: (a, b) => b.due - a.due,
    least: (a, b) => a.progress - b.progress,
    most: (a, b) => b.progress - a.progress,
    lines: (a, b) => b.lines - a.lines,
    eco: (a, b) => a.def.eco.localeCompare(b.def.eco),
  }
  list.sort(cmp[prefs.sort])

  // With no status filter, split into "your repertoire" and "explore" so studied openings never get buried.
  const grouped = status === 'all'
  const mine = grouped ? list.filter((s) => s.started) : list
  const rest = grouped ? list.filter((s) => !s.started) : []
  const dueTotal = all.reduce((n, s) => n + s.due, 0)
  const startedCount = all.filter((s) => s.started).length

  const chip = (active: boolean) => `chip !px-2.5 !py-0.5 text-xs ${active ? 'chip-active' : ''}`
  const renderList = (items: Stats[]) =>
    prefs.view === 'grid' ? (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {items.map((s) => (
          <Card key={s.def.id} s={s} onOpen={onOpen} />
        ))}
      </div>
    ) : (
      <div className="divide-y divide-white/5 rounded-xl ring-1 ring-white/5">
        {items.map((s) => (
          <Row key={s.def.id} s={s} onOpen={onOpen} />
        ))}
      </div>
    )

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-brand-400">Repertoire</p>
          <h1 className="mt-1 text-3xl font-bold text-zinc-50">Openings</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {all.length} openings · {startedCount} in your repertoire{dueTotal ? ` · ${dueTotal} positions due` : ''}
          </p>
        </div>
      </header>

      <WeeklyBanner all={all} onOpen={onOpen} />

      <section className="sticky top-0 z-10 -mx-2 space-y-2 rounded-xl bg-zinc-950/85 px-2 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <input className="input w-full sm:w-64" placeholder="Search name, ECO, tag…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="flex rounded-lg p-0.5 ring-1 ring-white/10" role="group" aria-label="Side">
            {(['any', 'w', 'b'] as const).map((sd) => (
              <button key={sd} onClick={() => setSide(sd)} className={`rounded-md px-3 py-1 text-sm ${side === sd ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-400 hover:text-zinc-100'}`}>
                {sd === 'any' ? 'Both sides' : sd === 'w' ? '♔ As White' : '♚ As Black'}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <select className="input" value={prefs.sort} onChange={(e) => setPrefs({ sort: e.target.value as Sort })} aria-label="Sort">
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <div className="flex rounded-lg p-0.5 ring-1 ring-white/10" role="group" aria-label="Layout">
              {(['grid', 'list'] as const).map((v) => (
                <button key={v} onClick={() => setPrefs({ view: v })} className={`rounded-md px-2.5 py-1 text-sm ${prefs.view === v ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-400 hover:text-zinc-100'}`} title={v === 'grid' ? 'Cards' : 'List'}>
                  {v === 'grid' ? '▦' : '☰'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap gap-1">
            {STATUSES.map((f) => (
              <button key={f.id} onClick={() => setStatus(f.id)} className={chip(status === f.id)}>
                {f.label}
                {f.id === 'due' && dueTotal ? ` · ${dueTotal}` : ''}
              </button>
            ))}
          </div>
          <span className="hidden h-4 w-px bg-white/10 sm:block" />
          <div className="flex flex-wrap gap-1">
            {STYLES.map((f) => (
              <button key={f.id} onClick={() => setStyle(f.id)} className={chip(style === f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          <span className="hidden h-4 w-px bg-white/10 sm:block" />
          <div className="flex flex-wrap gap-1">
            {(['any', 'e4', 'd4', 'other'] as const).map((f) => (
              <button key={f} onClick={() => setFirst(f)} className={chip(first === f)} title="White's first move">
                {f === 'any' ? 'Any first move' : f === 'other' ? '1.c4 / 1.Nf3 / other' : `1.${f}`}
              </button>
            ))}
          </div>
        </div>
      </section>

      {!list.length && <p className="text-sm text-zinc-500">Nothing matches these filters.</p>}

      {mine.length > 0 && (
        <section className="space-y-3">
          {grouped && (
            <h2 className="flex items-baseline gap-3 text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Your repertoire <span className="font-normal normal-case tracking-normal text-zinc-600">{mine.length} opening{mine.length === 1 ? '' : 's'} you've studied — due ones first</span>
            </h2>
          )}
          {!grouped && <p className="text-xs text-zinc-500">{list.length} shown</p>}
          {renderList(mine)}
        </section>
      )}

      {rest.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-baseline gap-3 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Explore <span className="font-normal normal-case tracking-normal text-zinc-600">{rest.length} you haven't started</span>
          </h2>
          {renderList(rest)}
        </section>
      )}
    </div>
  )
}

function WeeklyBanner({ all, onOpen }: { all: Stats[]; onOpen: Open }) {
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

function Card({ s, onOpen }: { s: Stats; onOpen: Open }) {
  const o = s.def
  const pct = Math.round(s.progress * 100)
  const kind = o.tags.filter((t) => ['gambit', 'solid', 'aggressive', 'trappy', 'dubious', 'custom'].includes(t)).slice(0, 1)
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl ring-1 ring-white/5 transition hover:ring-white/20" title={o.summary}>
      <button className="relative block" onClick={() => onOpen(o.id, s.started ? 'practice' : 'learn', false)} aria-label={`${s.started ? 'Practice' : 'Learn'} ${o.name}`}>
        <MiniBoard fen={s.fen} orientation={o.side === 'w' ? 'white' : 'black'} lastMove={s.lastUci} />
        <span className="absolute left-1.5 top-1.5 flex gap-1">
          {s.due > 0 && <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">{s.due} due</span>}
        </span>
        <span className="absolute right-1.5 top-1.5">
          <MedalBadge tier={s.medal} title={s.medalHint} />
        </span>
      </button>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h2 className="line-clamp-2 text-sm font-medium leading-snug text-zinc-50">{o.name}</h2>
        <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
          {o.side === 'w' ? '♔' : '♚'} {o.eco || 'custom'} · {s.lines} lines{kind.length ? ` · ${kind[0]}` : ''}
        </p>
        <div className="mt-auto h-0.5 overflow-hidden rounded bg-zinc-800">
          <div className="h-full bg-brand-400" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center gap-3 text-xs">
          <button className="font-medium text-brand-400 hover:text-brand-300" onClick={() => onOpen(o.id, 'practice', false)}>
            Practice
          </button>
          <button className="text-zinc-300 hover:text-zinc-50" onClick={() => onOpen(o.id, 'learn', false)}>
            Learn
          </button>
          <button className="text-zinc-500 hover:text-zinc-200" onClick={() => onOpen(o.id, 'learn', true)} title={`Train the defense as ${sideName(o.side === 'w' ? 'b' : 'w')}`}>
            Face it
          </button>
          <span className="ml-auto tabular-nums text-zinc-500" title={s.medalHint}>
            {pct}%
          </span>
        </div>
      </div>
    </article>
  )
}

function Row({ s, onOpen }: { s: Stats; onOpen: Open }) {
  const o = s.def
  const pct = Math.round(s.progress * 100)
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-white/[0.02]">
      <div className="w-12 shrink-0">
        <MiniBoard fen={s.fen} orientation={o.side === 'w' ? 'white' : 'black'} />
      </div>
      <div className="min-w-0 flex-1 basis-48">
        <p className="flex items-center gap-2 truncate font-medium text-zinc-100">{o.name} <MedalBadge tier={s.medal} title={s.medalHint} /></p>
        <p className="text-xs text-zinc-500">
          {o.side === 'w' ? '♔ White' : '♚ Black'} · {o.eco} · {s.lines} lines{s.due ? <span className="text-amber-300"> · {s.due} due</span> : null}
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
