import { Chess } from 'chess.js'
import { useMemo, useState } from 'react'
import type { Arrow } from 'react-chessboard'
import { Board, type BoardMove } from '../components/Board'
import { ResultCard } from '../components/ResultCard'
import { award, addToSet, count, useProfile } from '../lib/game'
import { recordAnswer } from '../lib/progress'
import { buildSession } from '../lib/reviewSession'
import { reviewMove } from '../lib/review'
import { bookMoves, moveLabel } from '../lib/tree'

export function Review({ onDone }: { onDone: () => void }) {
  const profile = useProfile()
  const [items] = useState(() => buildSession(profile.sets))
  const [idx, setIdx] = useState(0)
  const [state, setState] = useState<'ask' | 'checking' | 'right' | 'wrong'>('ask')
  const [note, setNote] = useState('')
  const [played, setPlayed] = useState<string | null>(null) // your move, kept on the board after you answer
  const [tally, setTally] = useState({ right: 0, wrong: 0 })
  const item = items[idx]

  const q = useMemo(() => {
    if (!item) return null
    if (item.kind === 'book') return { fen: item.node.fen, lastUci: item.node.uci, answers: bookMoves(item.node).map((c) => c.uci), title: item.def.name + (item.def.flipped ? ' (facing it)' : ''), prompt: 'Play the book move.' }
    if (item.kind === 'trap') return { fen: item.puzzle.fen, lastUci: item.puzzle.lastUci, answers: [item.puzzle.line[0].uci], title: `Trap: ${item.puzzle.opening}`, prompt: `Your opponent just played ${item.puzzle.blunder}. Punish it.` }
    if (item.kind === 'own') return { fen: item.puzzle.fen, lastUci: item.puzzle.lastUci, answers: [item.puzzle.best], title: 'From your games', prompt: `You played ${item.puzzle.played} here. Find the better move.` }
    if (item.kind === 'endgame')
      return { fen: item.endgame.fen, lastUci: undefined, answers: [], title: `Endgame: ${item.endgame.name}`, prompt: `${item.endgame.goal === 'draw' ? 'Hold the draw' : 'Win'} — what's a good first move? (Technique: ${item.endgame.technique[0]})` }
    return { fen: item.pattern.fen, lastUci: undefined, answers: [], title: `Mating pattern: ${item.pattern.name}`, prompt: `Mate in ${item.pattern.moves} — find the first move.` }
  }, [item])

  if (!items.length)
    return (
      <div className="space-y-3">
        <h1 className="text-3xl font-bold text-zinc-50">Daily review</h1>
        <p className="max-w-xl text-zinc-400">
          Nothing to review yet. The review only brings back things you've already done: positions from openings you've practiced (once they're due), traps from openings you've studied, puzzles from your games you've tried, and endgames and mating patterns you've solved.
        </p>
        <button className="btn-primary" onClick={onDone}>
          Back
        </button>
      </div>
    )

  if (!item || !q) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-10 text-center">
        <div className="text-5xl">✓</div>
        <h1 className="text-3xl font-bold text-zinc-50">Review complete</h1>
        <p className="text-zinc-400">
          {tally.right} right · {tally.wrong} to work on
        </p>
        <button className="btn-primary" onClick={onDone}>
          Done
        </button>
      </div>
    )
  }

  const solver = new Chess(q.fen).turn()

  function finish(ok: boolean, text: string) {
    setState(ok ? 'right' : 'wrong')
    setNote(text)
    setTally((t) => (ok ? { ...t, right: t.right + 1 } : { ...t, wrong: t.wrong + 1 }))
    if (item.kind === 'trap' && ok) addToSet('puzzles', item.puzzle.id)
    if (item.kind === 'own' && ok) addToSet('ownPuzzles', item.puzzle.id)
    if (item.kind === 'trap') addToSet('puzzlesSeen', item.puzzle.id)
    if (ok && item.kind !== 'book') award(5, undefined, 'review')
  }

  function onMove(m: BoardMove) {
    if (state !== 'ask' || !q) return false
    const uci = m.from + m.to + (m.promotion ?? '')
    setPlayed(uci)
    const hit = q.answers.some((a) => a === uci || (a.length === 4 && a === uci.slice(0, 4)))
    if (item.kind === 'book') {
      const change = recordAnswer(item.def.id, item.node.id, hit ? 'correct' : 'wrong')
      if (hit) {
        if (change.promoted) count('dueCorrect')
        award(change.promoted ? 4 + 2 * change.box : 1, undefined, 'review')
      }
      const book = bookMoves(item.node)
      finish(hit, hit ? book.find((b) => b.uci.slice(0, 4) === uci.slice(0, 4))?.note || 'Correct.' : `The book move is ${book.map(moveLabel).join(' / ')}. ${book[0]?.note ?? ''}`)
      return hit
    }
    if (item.kind === 'mate' && item.pattern.moves === 1) {
      const mates = new Chess(q.fen).move({ from: m.from, to: m.to, promotion: m.promotion }).san.includes('#')
      finish(mates, mates ? `Checkmate. ${item.pattern.idea}` : `That's not mate. ${item.pattern.idea}`)
      return mates
    }
    if (hit) {
      finish(true, 'Exactly.')
      return true
    }
    setState('checking')
    // endgames and longer mates have many good first moves — let Stockfish judge against its own best
    void reviewMove(q.fen, uci, q.answers[0], 14).then((r) => finish(r.verdict.loss < 0.3, r.verdict.loss < 0.3 ? `${r.playedSan} works too.` : `Not quite — the move was ${r.bookSan ?? r.bestSan}.`))
    return false
  }

  function next() {
    if (idx + 1 >= items.length) {
      count('reviews')
      // the completion bonus is once a day — rerunning the review doesn't pay it again
      if (addToSet('reviewDays', new Date().toDateString())) award(40, 'Daily review complete')
    }
    setIdx((i) => i + 1)
    setState('ask')
    setNote('')
    setPlayed(null)
  }

  // after you answer, the board shows the position after your move (right or wrong)
  // (plain code, not a hook: this runs after the early returns above)
  const shownFen = (() => {
    if (!played) return q.fen
    try {
      const c = new Chess(q.fen)
      c.move({ from: played.slice(0, 2), to: played.slice(2, 4), promotion: played[4] })
      return c.fen()
    } catch {
      return q.fen
    }
  })()
  const last = played ?? q.lastUci
  const arrows: Arrow[] = state === 'wrong' ? q.answers.map((a) => ({ startSquare: a.slice(0, 2), endSquare: a.slice(2, 4), color: 'rgba(16,185,129,0.85)' })) : []

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-brand-400">Daily review</p>
          <h1 className="mt-1 text-2xl font-bold text-zinc-50">{q.title}</h1>
          <p className="text-sm text-zinc-500">{q.prompt}</p>
        </div>
        <div className="ml-auto text-right text-sm text-zinc-400">
          {idx + 1} / {items.length}
          <div className="mt-1 h-1 w-40 overflow-hidden rounded bg-zinc-800">
            <div className="h-full bg-brand-500" style={{ width: `${(idx / items.length) * 100}%` }} />
          </div>
        </div>
      </header>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,560px)_1fr]">
        <Board
          fen={shownFen}
          orientation={solver === 'w' ? 'white' : 'black'}
          onMove={onMove}
          player={solver}
          interactive={state === 'ask'}
          arrows={arrows}
          lastMove={last ? { from: last.slice(0, 2), to: last.slice(2, 4) } : null}
          flash={played && (state === 'right' || state === 'wrong') ? { square: played.slice(2, 4), color: state === 'right' ? 'good' : 'bad' } : null}
          result={
            state === 'right' || state === 'wrong' ? (
              <ResultCard tone={state === 'right' ? 'success' : 'fail'} title={state === 'right' ? 'Right' : 'Not this time'} subtitle={note} onPrimary={next} primaryLabel={idx + 1 >= items.length ? 'Finish' : 'Next'} burst={false} />
            ) : undefined
          }
        />
        <section className="h-fit space-y-2 rounded-xl bg-zinc-900/80 p-4 text-sm ring-1 ring-white/5">
          <p className="text-zinc-300">
            ✓ {tally.right} · ✗ {tally.wrong}
          </p>
          {item.kind === 'book' && item.node.parent && (
            <p className="text-zinc-400">
              Last move: <span className="font-mono text-zinc-200">{moveLabel(item.node)}</span>
              {item.node.note ? ` — ${item.node.note}` : ''}
            </p>
          )}
          {state === 'checking' && <p className="text-zinc-400">Checking with Stockfish…</p>}
        </section>
      </div>
    </div>
  )
}
