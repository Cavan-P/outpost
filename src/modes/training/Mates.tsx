import { Chess } from 'chess.js'
import { useEffect, useMemo, useState } from 'react'
import { Board, type BoardMove } from '../../components/Board'
import { ResultCard } from '../../components/ResultCard'
import { MATES, type MatePattern } from '../../data/mates'
import { getPlayEngine } from '../../lib/engine'
import { addToSet, award, useProfile } from '../../lib/game'

/** Learn the classic mating patterns: deliver mate in N against Stockfish's best defence. */
export function MatingPatterns() {
  const profile = useProfile()
  const solved = new Set(profile.sets.mates ?? [])
  const [pat, setPat] = useState<MatePattern>(() => MATES.find((m) => !solved.has(m.id)) ?? MATES[0])
  const [moves, setMoves] = useState<string[]>([])
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const { chess, fen } = useMemo(() => {
    const c = new Chess(pat.fen)
    for (const u of moves) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
    return { chess: c, fen: c.fen() }
  }, [pat, moves])
  const me = new Chess(pat.fen).turn()
  const myMoves = Math.ceil(moves.length / 2)

  function load(p: MatePattern) {
    setPat(p)
    setMoves([])
    setResult(null)
  }

  // judge after each move; defender replies with Stockfish
  useEffect(() => {
    if (result) return
    if (chess.isCheckmate()) {
      const first = addToSet('mates', pat.id)
      award(first ? 30 : 8, first ? `${pat.name} learned!` : 'Mate delivered')
      setResult({ ok: true, text: pat.idea })
      return
    }
    if (chess.turn() === me && myMoves >= pat.moves) {
      setResult({ ok: false, text: `That wasn't mate in ${pat.moves}. ${pat.idea}` })
      return
    }
    if (chess.turn() !== me) {
      let live = true
      void getPlayEngine()
        .analyze(fen, { movetime: 300 })
        .then((a) => live && a.bestmove && a.bestmove !== '(none)' && setMoves((m) => [...m, a.bestmove]))
      return () => {
        live = false
      }
    }
  }, [fen, chess, me, myMoves, pat, result])

  function onMove(m: BoardMove) {
    if (result || chess.turn() !== me) return false
    setMoves((ms) => [...ms, m.from + m.to + (m.promotion ?? '')])
    return true
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,520px)_1fr]">
      <aside className="flex flex-wrap gap-1 xl:block xl:space-y-1">
        <p className="mb-2 w-full text-xs text-zinc-500">
          {solved.size}/{MATES.length} patterns learned
        </p>
        {MATES.map((m) => (
          <button key={m.id} onClick={() => load(m)} className={`rounded-lg px-3 py-1.5 text-left text-sm ring-1 xl:w-full ${m === pat ? 'bg-zinc-800 ring-brand-500/50 text-zinc-50' : 'ring-transparent text-zinc-300 hover:bg-zinc-900'}`}>
            {solved.has(m.id) ? '✓ ' : ''}
            {m.name}
          </button>
        ))}
      </aside>
      <div className="space-y-3">
        <Board
          fen={fen}
          orientation={me === 'w' ? 'white' : 'black'}
          onMove={onMove}
          player={me}
          interactive={!result}
          result={
            result ? (
              <ResultCard tone={result.ok ? 'success' : 'fail'} title={result.ok ? 'Checkmate!' : 'Not mate'} subtitle={result.text} onPrimary={result.ok ? () => load(MATES[(MATES.indexOf(pat) + 1) % MATES.length]) : () => load(pat)} primaryLabel={result.ok ? 'Next pattern' : 'Try again'}>
              </ResultCard>
            ) : undefined
          }
        />
        <button className="btn-secondary" onClick={() => load(pat)}>
          ⟲ Reset
        </button>
      </div>
      <section className="h-fit space-y-2 rounded-xl bg-zinc-900/80 p-4 ring-1 ring-white/5">
        <h2 className="text-lg font-semibold text-zinc-50">{pat.name}</h2>
        <p className="text-sm text-zinc-300">
          {me === 'w' ? 'White' : 'Black'} to move — mate in {pat.moves}.
        </p>
        {result && <p className="text-sm text-zinc-400">{pat.idea}</p>}
      </section>
    </div>
  )
}
