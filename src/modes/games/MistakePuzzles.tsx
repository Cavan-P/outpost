import { Chess } from 'chess.js'
import { useState } from 'react'
import type { Arrow } from 'react-chessboard'
import { Board, type BoardMove } from '../../components/Board'
import { WhyList } from '../../components/EnginePanel'
import { ResultCard } from '../../components/ResultCard'
import { uciToSan } from '../../lib/engine'
import { explainMove } from '../../lib/explain'
import { TAG_LABEL, type MistakePuzzle } from '../../lib/gameAnalysis'
import { addToSet, award, useProfile } from '../../lib/game'
import { reviewMove } from '../../lib/review'

/** Positions where you went wrong in your own games: find the move you missed. */
export function MistakePuzzles({ puzzles, title, onBack, onOpenGame }: { puzzles: MistakePuzzle[]; title: string; onBack: () => void; onOpenGame: (gameId: string, ply: number) => void }) {
  const profile = useProfile()
  const solvedSet = new Set(profile.sets.ownPuzzles ?? [])
  const order = [...puzzles].sort((a, b) => Number(solvedSet.has(a.id)) - Number(solvedSet.has(b.id)))
  const [i, setI] = useState(0)
  const [state, setState] = useState<'solving' | 'checking' | 'solved' | 'failed'>('solving')
  const [note, setNote] = useState('')
  const [score, setScore] = useState({ ok: 0, bad: 0 })

  if (!order.length)
    return (
      <div className="space-y-3">
        <button className="text-xs uppercase tracking-widest text-zinc-500 hover:text-zinc-300" onClick={onBack}>
          ← Report
        </button>
        <p className="text-zinc-400">No puzzles here yet.</p>
      </div>
    )

  const p = order[i % order.length]
  const solver = new Chess(p.fen).turn()

  function next() {
    setI((x) => x + 1)
    setState('solving')
    setNote('')
  }

  function onMove(m: BoardMove) {
    if (state !== 'solving') return false
    const uci = m.from + m.to + (m.promotion ?? '')
    if (uci === p.best || uci === p.best.slice(0, 4)) {
      win(`${uciToSan(p.fen, [p.best])[0]} — exactly what the engine wanted.`)
      return true
    }
    setState('checking')
    void reviewMove(p.fen, uci, p.best, 14).then((r) => {
      if (r.verdict.loss < 0.3) win(`${r.playedSan} works too (engine's choice: ${r.bestSan}).`)
      else {
        setState('failed')
        addToSet('ownPuzzlesSeen', p.id)
        setScore((s) => ({ ...s, bad: s.bad + 1 }))
        setNote(`${r.playedSan} isn't it. In the game you played ${p.played}; the move was ${uciToSan(p.fen, [p.best])[0]}.`)
      }
    })
    return false
  }

  function win(text: string) {
    addToSet('ownPuzzlesSeen', p.id)
    setState('solved')
    setNote(text)
    setScore((s) => ({ ...s, ok: s.ok + 1 }))
    award(addToSet('ownPuzzles', p.id) ? 25 : 8, 'Fixed one of your mistakes')
  }

  const arrows: Arrow[] = state === 'failed' || state === 'solved' ? [{ startSquare: p.best.slice(0, 2), endSquare: p.best.slice(2, 4), color: 'rgba(16,185,129,0.85)' }] : []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <button className="text-xs uppercase tracking-widest text-zinc-500 hover:text-zinc-300" onClick={onBack}>
            ← Report
          </button>
          <h1 className="mt-1 text-2xl font-bold text-zinc-50">{title}</h1>
          <p className="text-sm text-zinc-500">
            Positions from your own games where you went wrong. Find the move you missed. {solvedSet.size}/{puzzles.length} fixed · this session ✓{score.ok} ✗{score.bad}
          </p>
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,560px)_1fr]">
        <div className="space-y-3">
          <Board
            fen={p.fen}
            orientation={solver === 'w' ? 'white' : 'black'}
            onMove={onMove}
            player={solver}
            interactive={state === 'solving'}
            arrows={arrows}
            lastMove={p.lastUci ? { from: p.lastUci.slice(0, 2), to: p.lastUci.slice(2, 4) } : null}
            result={
              (state === 'solved' || state === 'failed') ? (
                <ResultCard tone={state === 'solved' ? 'success' : 'fail'} title={state === 'solved' ? 'Fixed!' : 'Not quite'} subtitle={note} onPrimary={next} primaryLabel="Next" />
              ) : undefined
            }
          />
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={next}>
              Skip
            </button>
            <button className="btn-secondary ml-auto" onClick={() => onOpenGame(p.gameId, p.ply - 1)}>
              Open the game
            </button>
          </div>
        </div>
        <section className="h-fit space-y-3 rounded-xl bg-zinc-900/80 p-4 text-sm ring-1 ring-white/5">
          <p className="text-zinc-300">
            {solver === 'w' ? 'White' : 'Black'} to move (move {Math.ceil(p.ply / 2)}). In the game you played <b className="font-mono text-red-300">{p.played}</b>.
          </p>
          <div className="flex flex-wrap gap-1">
            {p.tags.map((t) => (
              <span key={t} className="rounded px-1.5 py-0.5 text-xs text-zinc-400 ring-1 ring-white/10">
                {state === 'solving' && t.startsWith('missed') ? 'hint hidden' : (TAG_LABEL[t] ?? t)}
              </span>
            ))}
          </div>
          {state === 'checking' && <p className="text-zinc-400">Checking with Stockfish…</p>}
          {(state === 'solved' || state === 'failed') && <WhyList explanation={explainMove(p.fen, p.best, p.pv)} />}
        </section>
      </div>
    </div>
  )
}
