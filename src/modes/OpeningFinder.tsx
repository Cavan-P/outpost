import { Chess } from 'chess.js'
import { useMemo, useState } from 'react'
import { Board, type BoardMove } from '../components/Board'
import { MedalBadge } from '../components/GameUI'
import { PopularMoves } from '../components/PopularMoves'
import { medalFor, openingsAt, practiced, type PosHit } from '../lib/openingIndex'
import { getTree, isMistake, leavesUnder, type TreeNode } from '../lib/tree'

type Open = (id: string, mode: 'learn' | 'practice', flip: boolean) => void

/** Parse "1.e4 c5 2.Nf3" (numbers, dots and annotations optional) into SAN moves. */
function parseMoves(text: string): { sans: string[]; error?: string } {
  const tokens = text
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\d+\.(\.\.)?/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/[!?]+$/, ''))
    .filter((t) => t && !['1-0', '0-1', '1/2-1/2', '*'].includes(t))
  const c = new Chess()
  const sans: string[] = []
  for (const t of tokens) {
    try {
      sans.push(c.move(t).san)
    } catch {
      return { sans, error: `"${t}" isn't a legal move there.` }
    }
  }
  return { sans }
}

const fenAfter = (sans: string[]) => {
  const c = new Chess()
  for (const s of sans) c.move(s)
  return c.fen()
}

const label = (sans: string[]) => sans.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}.${s}` : s)).join(' ')

/**
 * Opening finder: play (or paste) some moves and see every Outpost opening that reaches the
 * position — by any move order — with what the book says next.
 */
export function OpeningFinder({ initial = [], onOpen }: { initial?: string[]; onOpen: Open }) {
  const [sans, setSans] = useState<string[]>(initial)
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [flipped, setFlipped] = useState(false)
  const fen = useMemo(() => fenAfter(sans), [sans])
  const hits = useMemo(() => openingsAt(fen), [fen])

  // nothing reaches this exact position: back up to the last move order that something covers
  const closest = useMemo(() => {
    if (hits.length) return null
    for (let n = sans.length - 1; n >= 1; n--) {
      const h = openingsAt(fenAfter(sans.slice(0, n)))
      if (h.length) return { n, hits: h }
    }
    return null
  }, [hits, sans])

  // next moves the books know from here (for the board arrows and the clickable chips)
  const next = useMemo(() => {
    const m = new Map<string, { san: string; uci: string; openings: string[]; trap: boolean }>()
    for (const h of hits)
      for (const c of h.node.children) {
        const e = m.get(c.san) ?? { san: c.san, uci: c.uci, openings: [], trap: false }
        e.openings.push(h.def.name)
        e.trap ||= isMistake(c)
        m.set(c.san, e)
      }
    return [...m.values()].sort((a, b) => b.openings.length - a.openings.length)
  }, [hits])

  function onMove(m: BoardMove) {
    const c = new Chess(fen)
    try {
      const mv = c.move({ from: m.from, to: m.to, promotion: m.promotion })
      setSans((s) => [...s, mv.san])
      return true
    } catch {
      return false
    }
  }

  const pseudoNode = { fen, children: next.map((n) => ({ uci: n.uci })) } as unknown as TreeNode
  const last = (() => {
    if (!sans.length) return null
    const c = new Chess()
    let mv = null
    for (const s of sans) mv = c.move(s)
    return mv ? { from: mv.from, to: mv.to } : null
  })()

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,520px)_1fr]">
      <div className="min-w-0 space-y-3">
        <Board fen={fen} orientation={flipped ? 'black' : 'white'} onMove={onMove} lastMove={last} arrows={next.slice(0, 5).map((n) => ({ startSquare: n.uci.slice(0, 2), endSquare: n.uci.slice(2, 4), color: n.trap ? 'rgba(239,68,68,0.7)' : 'rgba(16,185,129,0.75)' }))} />
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => setSans([])} disabled={!sans.length}>
            ⟲ Start
          </button>
          <button className="btn-secondary" onClick={() => setSans((s) => s.slice(0, -1))} disabled={!sans.length}>
            ← Back
          </button>
          <button className="btn-secondary ml-auto" onClick={() => setFlipped((f) => !f)} title="Flip board">
            ⇅ Flip
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            className="input min-w-0 flex-1 font-mono text-xs"
            placeholder="Or paste moves: 1.e4 c5 2.Nf3 d6"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              const r = parseMoves(text)
              setErr(r.error ?? '')
              if (!r.error) setSans(r.sans)
            }}
          />
          <button
            className="btn-primary"
            onClick={() => {
              const r = parseMoves(text)
              setErr(r.error ?? '')
              if (!r.error) setSans(r.sans)
            }}
          >
            Go
          </button>
        </div>
        {err && <p className="text-xs text-red-400">{err}</p>}
      </div>

      <div className="min-w-0 space-y-4">
        <section className="space-y-3 rounded-xl bg-zinc-900/80 p-4 ring-1 ring-white/5">
          <p className="font-mono text-sm text-zinc-300">{sans.length ? label(sans) : 'Starting position — play a move or paste a line.'}</p>
          {next.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-zinc-500">Book moves from here</p>
              <div className="flex flex-wrap gap-1.5">
                {next.map((n) => (
                  <button key={n.san} onClick={() => setSans((s) => [...s, n.san])} className={`chip !px-2 !py-0.5 font-mono text-xs ${n.trap ? 'chip-bad' : ''}`} title={n.openings.join(', ')}>
                    {n.san}
                    <span className="ml-1 text-[10px] text-zinc-500">{n.openings.length}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            {hits.length ? `${hits.length} opening${hits.length === 1 ? '' : 's'} reach this position` : 'No opening in Outpost reaches this exact position'}
          </h3>
          {!hits.length && closest && (
            <p className="text-sm text-zinc-400">
              The closest ones stop after <span className="font-mono text-zinc-200">{label(sans.slice(0, closest.n))}</span>.{' '}
              <button className="text-brand-400 hover:underline" onClick={() => setSans(sans.slice(0, closest.n))}>
                Go back there
              </button>{' '}
              — or build this line yourself in My Repertoire.
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {(hits.length ? hits : (closest?.hits ?? [])).slice(0, 24).map((h) => (
              <HitCard key={h.def.id} h={h} onOpen={onOpen} />
            ))}
          </div>
        </section>

        <PopularMoves node={pseudoNode} />
      </div>
    </div>
  )
}

function HitCard({ h, onOpen }: { h: PosHit; onOpen: Open }) {
  const tree = getTree(h.def)
  const studied = practiced(tree)
  const lines = leavesUnder(h.node).length
  const side = h.def.side === 'w' ? 'White' : 'Black'
  const other = h.def.side === 'w' ? 'Black' : 'White'
  return (
    <div className="rounded-lg p-3 ring-1 ring-white/10">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-zinc-100">{h.def.name}</p>
        {studied && <MedalBadge tier={medalFor(tree)} />}
      </div>
      <p className="text-[11px] text-zinc-500">
        as {side} · {h.def.eco} · {lines} line{lines === 1 ? '' : 's'} from here{studied ? ' · studied' : ''}
      </p>
      <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{h.def.summary}</p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <button className="text-brand-400 hover:underline" onClick={() => onOpen(h.def.id, studied ? 'practice' : 'learn', false)}>
          {studied ? 'Practice' : 'Learn'} as {side}
        </button>
        <button className="text-zinc-400 hover:text-zinc-100 hover:underline" onClick={() => onOpen(h.def.id, 'learn', true)}>
          Face it as {other}
        </button>
      </div>
    </div>
  )
}

