import { useEffect, useState } from 'react'
import type { Arrow } from 'react-chessboard'
import { Board, type BoardMove } from '../../components/Board'
import { addToSet, award, count, useProfile } from '../../lib/game'
import { PUZZLES, type Puzzle } from '../../lib/puzzles'
import { reviewMove } from '../../lib/review'
import { moveLabel } from '../../lib/tree'
import { ResultCard } from '../../components/ResultCard'

type State = 'solving' | 'checking' | 'solved' | 'failed'

export function TrapPuzzles() {
  const profile = useProfile()
  const solved = new Set(profile.sets.puzzles ?? [])
  const [puzzle, setPuzzle] = useState<Puzzle>(() => PUZZLES.find((p) => !solved.has(p.id)) ?? PUZZLES[0])
  const [step, setStep] = useState(0) // index into puzzle.line of the next move to play
  const [state, setState] = useState<State>('solving')
  const [note, setNote] = useState('')
  const [streak, setStreak] = useState(0)

  const fen = step === 0 ? puzzle.fen : puzzle.line[step - 1].fen
  const expected = puzzle.line[step]

  function load(p: Puzzle) {
    setPuzzle(p)
    setStep(0)
    setState('solving')
    setNote('')
  }

  function nextPuzzle() {
    const rest = PUZZLES.filter((p) => p.id !== puzzle.id)
    const unsolved = rest.filter((p) => !solved.has(p.id))
    const pool = unsolved.length ? unsolved : rest
    load(pool[Math.floor(Math.random() * pool.length)])
  }

  function win(text: string) {
    addToSet('puzzlesSeen', puzzle.id)
    setState('solved')
    setNote(text)
    const first = addToSet('puzzles', puzzle.id)
    setStreak((s) => s + 1)
    count('trapSolves')
    award(first ? 30 : 4, first ? 'Trap puzzle solved!' : 'Puzzle solved', 'puzzles')
  }

  // opponent replies along the book line
  useEffect(() => {
    if (state !== 'solving' || !expected || step % 2 === 0) return
    const t = setTimeout(() => setStep((s) => s + 1), 450)
    return () => clearTimeout(t)
  }, [state, step, expected])

  function onMove(m: BoardMove) {
    if (state !== 'solving' || step % 2 === 1 || !expected) return false
    const uci = m.from + m.to + (m.promotion ?? '')
    if (expected.uci === uci || expected.uci === m.from + m.to) {
      if (step + 1 >= puzzle.line.length) win(expected.note || 'That\'s the punishment!')
      setStep((s) => s + 1)
      return true
    }
    // a different move may be just as good — let Stockfish judge
    setState('checking')
    void reviewMove(fen, uci, expected.uci, 14).then((r) => {
      if (r.verdict.loss < 0.3) win(`${r.playedSan} works too — the book continues ${moveLabel(expected)}.`)
      else {
        setState('failed')
        addToSet('puzzlesSeen', puzzle.id)
        setStreak(0)
        setNote(`${r.playedSan} lets them off the hook. The punishment is ${moveLabel(expected)}${expected.note ? ` — ${expected.note}` : '.'}`)
      }
    })
    return false
  }

  const arrows: Arrow[] = state === 'failed' && expected ? [{ startSquare: expected.uci.slice(0, 2), endSquare: expected.uci.slice(2, 4), color: 'rgba(16,185,129,0.85)' }] : []
  const lastUci = step === 0 ? puzzle.lastUci : puzzle.line[step - 1].uci

  return (
    <div className="grid xl:grid-cols-[minmax(0,520px)_1fr] gap-6">
      <div className="space-y-3">
        <Board fen={fen} orientation={puzzle.solver === 'w' ? 'white' : 'black'} onMove={onMove} player={puzzle.solver} interactive={state === 'solving'}
          arrows={arrows}
          lastMove={lastUci ? { from: lastUci.slice(0, 2), to: lastUci.slice(2, 4) } : null}
          result={
            (state === 'solved' || state === 'failed') ? (
              <ResultCard
                tone={state === 'solved' ? 'success' : 'fail'}
                title={state === 'solved' ? (streak >= 2 ? `Solved! 🔥 ${streak} in a row` : 'Solved!') : 'Missed it'}
                subtitle={note}
                onPrimary={state === 'solved' ? nextPuzzle : () => load(puzzle)}
                primaryLabel={state === 'solved' ? 'Next puzzle' : 'Try again'}
              >
              </ResultCard>
            ) : undefined
          }
        />
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => load(puzzle)}>⟲ Retry</button>
          <button className="btn-primary" onClick={nextPuzzle}>Next puzzle →</button>
        </div>
      </div>
      <div className="space-y-4 min-w-0">
        <section className="rounded-xl bg-zinc-900/80 ring-1 ring-white/5 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-50">Punish the blunder</h2>
            <span className="text-sm text-zinc-400">
              {streak >= 2 && <span className="text-orange-400 mr-2">🔥 {streak}</span>}
              {solved.size}/{PUZZLES.length} solved
            </span>
          </div>
          <p className="text-sm text-zinc-300">
            {puzzle.opening}: your opponent just played <b className="font-mono text-rose-300">{puzzle.blunder}</b>. {puzzle.solver === 'w' ? 'White' : 'Black'} to move — find the refutation
            {puzzle.line.length > 2 ? ' and keep going until the line ends' : ''}.
          </p>
          {state === 'checking' && <p className="text-sm text-zinc-400">Checking your move with Stockfish…</p>}
          {note && <div className={`rounded-lg p-3 text-sm ${state === 'solved' ? 'bg-emerald-950/50 text-emerald-200' : 'bg-red-950/50 text-red-200'}`}>{note}</div>}
        </section>
        <section className="rounded-xl bg-zinc-900/80 ring-1 ring-white/5 p-4">
          <h3 className="text-sm font-semibold tracking-wide text-zinc-300 uppercase mb-2">All traps</h3>
          <ul className="space-y-1 text-sm max-h-72 overflow-auto pr-1">
            {PUZZLES.map((p) => (
              <li key={p.id}>
                <button onClick={() => load(p)} className={`w-full text-left rounded px-2 py-1 hover:bg-zinc-800 ${p === puzzle ? 'bg-zinc-800' : ''}`}>
                  <span className={solved.has(p.id) ? 'text-emerald-400' : 'text-zinc-600'}>{solved.has(p.id) ? '✓' : '○'}</span> <span className="text-zinc-300">{p.opening}</span>{' '}
                  <span className="font-mono text-xs text-zinc-500">after {p.blunder}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
