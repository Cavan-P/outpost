import { Chess, type Square } from 'chess.js'
import { useEffect, useMemo, useState } from 'react'
import { Board } from '../components/Board'
import type { EndgameDef } from '../data/endgames'
import { perfectLine, type PerfectLine } from '../lib/tablebase'

/** Squares the given side's king could step to (its "box"), whoever is to move. */
function kingSquares(fen: string, color: 'w' | 'b'): Square[] {
  const parts = fen.split(' ')
  parts[1] = color
  parts[3] = '-'
  try {
    const c = new Chess(parts.join(' '), { skipValidation: true })
    const king = c.board().flat().find((p) => p?.type === 'k' && p.color === color)
    if (!king) return []
    return [...new Set(c.moves({ square: king.square, verbose: true }).map((m) => m.to))]
  } catch {
    return []
  }
}

const kingAt = (fen: string, color: 'w' | 'b') => new Chess(fen).board().flat().find((p) => p?.type === 'k' && p.color === color)?.square
const distance = (a?: string, b?: string) => (a && b ? Math.max(Math.abs(a.charCodeAt(0) - b.charCodeAt(0)), Math.abs(Number(a[1]) - Number(b[1]))) : 0)

/** A short comment for each move of the perfect line, from what changed on the board. */
function comment(line: PerfectLine, i: number, attacker: 'w' | 'b'): string {
  const before = line.fens[i]
  const after = line.fens[i + 1]
  const m = line.moves[i]
  const mover = new Chess(before).turn()
  const defender = attacker === 'w' ? 'b' : 'w'
  const c = new Chess(after)
  if (c.isCheckmate()) return 'Checkmate — the king has no squares left and is in check.'
  if (c.isStalemate()) return 'Stalemate!'
  const boxBefore = kingSquares(before, defender).length
  const boxAfter = kingSquares(after, defender).length
  if (mover === attacker) {
    const bits: string[] = []
    if (c.inCheck()) bits.push('Check')
    if (boxAfter < boxBefore) bits.push(`the box shrinks: the king has ${boxAfter} square${boxAfter === 1 ? '' : 's'} (was ${boxBefore})`)
    if (m.san.startsWith('K')) {
      const d0 = distance(kingAt(before, attacker), kingAt(before, defender))
      const d1 = distance(kingAt(after, attacker), kingAt(after, defender))
      if (d1 < d0) bits.push('your king walks up to help — the lone piece can\'t mate alone')
      else bits.push('a quiet king move to take away squares')
    }
    if (!bits.length) bits.push(`keeps the king boxed in (${boxAfter} square${boxAfter === 1 ? '' : 's'})`)
    const s = bits.join('; ')
    return s[0].toUpperCase() + s.slice(1) + '.'
  }
  return `The king runs to ${m.san.replace(/^K/, '').replace(/[+#]/, '')} — always toward the center or away from the mating corner.`
}

/**
 * "Learn it": the endgame played out perfectly by both sides (from the tablebase), one move at a
 * time, with the defending king's escape squares shaded so you can see the box shrink.
 */
export function EndgameLearn({ def }: { def: EndgameDef }) {
  const [line, setLine] = useState<PerfectLine | null | undefined>(undefined)
  const [loaded, setLoaded] = useState(0)
  const [ply, setPly] = useState(0)
  const [playing, setPlaying] = useState(false)
  // the side that's trying to win (for draw studies, the opponent)
  const attacker = def.goal === 'draw' ? (def.side === 'w' ? 'b' : 'w') : def.side
  const defender = attacker === 'w' ? 'b' : 'w'

  useEffect(() => {
    let live = true
    setLine(undefined)
    setPly(0)
    setLoaded(0)
    void perfectLine(def.fen, 100, (n) => live && setLoaded(n)).then((l) => live && setLine(l))
    return () => void (live = false)
  }, [def])

  useEffect(() => {
    if (!playing || !line) return
    if (ply >= line.moves.length) return setPlaying(false)
    const t = setTimeout(() => setPly((p) => p + 1), 1100)
    return () => clearTimeout(t)
  }, [playing, ply, line])

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!line) return
      if (e.key === 'ArrowRight') setPly((p) => Math.min(line.moves.length, p + 1))
      if (e.key === 'ArrowLeft') setPly((p) => Math.max(0, p - 1))
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [line])

  const fen = line ? line.fens[ply] : def.fen
  const box = useMemo(() => kingSquares(fen, defender), [fen, defender])
  const highlights = useMemo(() => Object.fromEntries(box.map((sq) => [sq, { background: 'rgba(239, 68, 68, 0.28)' }])), [box])

  if (line === null) return <p className="text-sm text-zinc-400">This position is too big for the endgame tablebase, so there's no perfect line to show.</p>

  const last = ply > 0 && line ? line.moves[ply - 1].uci : null
  const dtm = line?.dtm[ply]
  const total = line?.moves.length ?? 0
  const attackerMovesLeft = dtm != null && dtm !== 0 ? Math.ceil(Math.abs(dtm) / 2) : null
  const sideName = (c: 'w' | 'b') => (c === 'w' ? 'White' : 'Black')

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px] xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-3">
        <Board size="large" fen={fen} orientation={def.side === 'w' ? 'white' : 'black'} interactive={false} lastMove={last ? { from: last.slice(0, 2), to: last.slice(2, 4) } : null} highlights={highlights} />
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-secondary" onClick={() => setPly(0)} disabled={!line || ply === 0}>
            ⏮
          </button>
          <button className="btn-secondary" onClick={() => setPly((p) => Math.max(0, p - 1))} disabled={!line || ply === 0}>
            ←
          </button>
          <button className="btn-primary" onClick={() => (ply >= total ? (setPly(0), setPlaying(true)) : setPlaying((x) => !x))} disabled={!line}>
            {playing ? '❚❚ Pause' : ply >= total && total ? '↻ Replay' : '▶ Play'}
          </button>
          <button className="btn-secondary" onClick={() => setPly((p) => Math.min(total, p + 1))} disabled={!line || ply >= total}>
            →
          </button>
          <button className="btn-secondary" onClick={() => setPly(total)} disabled={!line || ply >= total}>
            ⏭
          </button>
          <span className="ml-auto text-sm text-zinc-500">{line ? `move ${Math.ceil(ply / 2)} of ${Math.ceil(total / 2)}` : `working out perfect play… ${loaded}`}</span>
        </div>
        <p className="text-xs text-zinc-500">
          Red squares are where {sideName(defender)}'s king can go — its box. Watch it shrink. ← / → step through.
        </p>
      </div>

      <div className="min-w-0 space-y-4">
        <section className="space-y-3 rounded-xl bg-zinc-900/80 p-4 text-sm ring-1 ring-white/5">
          <h2 className="text-lg font-semibold text-zinc-100">{def.name}: perfect play</h2>
          {line && (
            <p className="text-amber-300/90">
              {ply >= total ? (new Chess(fen).isCheckmate() ? 'Checkmate.' : 'Line complete.') : attackerMovesLeft !== null && def.goal !== 'draw' ? `${sideName(attacker)} mates in ${attackerMovesLeft} more move${attackerMovesLeft === 1 ? '' : 's'} with perfect play.` : 'Both sides play perfectly.'}
              {' '}
              The king has {box.length} square{box.length === 1 ? '' : 's'}.
            </p>
          )}
          {line && ply > 0 && (
            <div className="rounded-lg bg-zinc-800/70 p-3 text-zinc-200">
              <span className="mr-2 font-mono font-semibold text-emerald-400">
                {Math.ceil(ply / 2)}
                {new Chess(line.fens[ply - 1]).turn() === 'w' ? '.' : '…'}
                {line.moves[ply - 1].san}
              </span>
              {comment(line, ply - 1, attacker)}
            </div>
          )}
          <h3 className="pt-1 text-sm font-semibold uppercase tracking-wide text-zinc-300">Technique</h3>
          <ol className="list-decimal space-y-1 pl-5 text-zinc-300">
            {def.technique.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </section>
        {line && (
          <section className="rounded-xl bg-zinc-900/80 p-4 ring-1 ring-white/5">
            <div className="flex flex-wrap gap-x-1 gap-y-1 font-mono text-sm">
              {line.moves.map((m, i) => (
                <button key={i} onClick={() => setPly(i + 1)} className={`rounded px-1 ${ply === i + 1 ? 'bg-brand-600 text-white' : 'text-zinc-300 hover:bg-zinc-800'}`}>
                  {i % 2 === 0 || i === 0 ? <span className="text-zinc-500">{Math.floor(i / 2) + 1}{i % 2 === 0 ? '.' : '…'}</span> : null}
                  {m.san}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
