import { Chess } from 'chess.js'
import { useState } from 'react'
import type { Arrow } from 'react-chessboard'
import { Board, type BoardMove } from '../../components/Board'
import { WhyList } from '../../components/EnginePanel'
import { ResultCard } from '../../components/ResultCard'
import { uciToSan } from '../../lib/engine'
import { explainMove } from '../../lib/explain'
import { TAG_LABEL, type MistakePuzzle } from '../../lib/gameAnalysis'
import { addToSet, award, count, useProfile } from '../../lib/game'
import { isDuePuzzle, isRetired, nextDueText, puzzleStat, recordPuzzle, retireProgress } from '../../lib/ownPuzzles'
import { reviewMove } from '../../lib/review'

type Tab = 'train' | 'retired'

/** The position after a move (to keep your answer on the board). */
function after(fen: string, uci: string) {
  try {
    const c = new Chess(fen)
    c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    return c.fen()
  } catch {
    return fen
  }
}

/**
 * Positions where you went wrong in your own games: find the move you missed. Each one comes back
 * on a spaced schedule until you've solved it on enough separate occasions, then it retires.
 */
export function MistakePuzzles({ puzzles, title, onBack, onOpenGame }: { puzzles: MistakePuzzle[]; title: string; onBack: () => void; onOpenGame: (gameId: string, ply: number) => void }) {
  const profile = useProfile()
  const retiredIds = new Set(profile.sets.ownRetired ?? [])
  const active = puzzles.filter((p) => !retiredIds.has(p.id))
  const retired = puzzles.filter((p) => retiredIds.has(p.id))
  const dueCount = active.filter((p) => isDuePuzzle(p.id)).length
  const [tab, setTab] = useState<Tab>('train')
  // Freeze the order for the session (re-sorting each render would move the puzzle you just
  // solved and make "Next" skip one): due first, then least progress.
  const [order, setOrder] = useState(() => sortQueue(active, false))
  const [i, setI] = useState(0)
  const [state, setState] = useState<'solving' | 'checking' | 'solved' | 'failed'>('solving')
  const [note, setNote] = useState('')
  const [played, setPlayed] = useState<string | null>(null)
  const [score, setScore] = useState({ ok: 0, bad: 0 })

  function switchTo(t: Tab, all = false) {
    setTab(t)
    setOrder(t === 'retired' ? retired : sortQueue(active, all))
    setI(0)
    reset()
  }
  function reset() {
    setState('solving')
    setNote('')
    setPlayed(null)
  }

  // the queue is fixed when the session (or tab) starts: a puzzle you just solved stops being due,
  // but it stays on screen with your move and the result until you press Next
  const queue = order
  const p = queue[i] // undefined once the session's queue is used up

  const header = (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0">
        <button className="text-xs uppercase tracking-widest text-zinc-500 hover:text-zinc-300" onClick={onBack}>
          ← Report
        </button>
        <h1 className="mt-1 text-2xl font-bold text-zinc-50">{title}</h1>
        <p className="text-sm text-zinc-500">
          Positions from your own games where you went wrong. Solve each one on a few separate days and it retires. This session ✓{score.ok} ✗{score.bad}
        </p>
      </div>
      <div className="flex gap-1 sm:ml-auto">
        <button className={`chip !px-2.5 !py-0.5 text-xs ${tab === 'train' ? 'chip-active' : ''}`} onClick={() => switchTo('train')}>
          To train · {active.length}
          {dueCount ? ` (${dueCount} due)` : ''}
        </button>
        <button className={`chip !px-2.5 !py-0.5 text-xs ${tab === 'retired' ? 'chip-active' : ''}`} onClick={() => switchTo('retired')} disabled={!retired.length}>
          Retired · {retired.length}
        </button>
      </div>
    </div>
  )

  if (!puzzles.length)
    return (
      <div className="space-y-3">
        {header}
        <p className="text-zinc-400">No puzzles here yet.</p>
      </div>
    )

  if (!p) {
    const next = nextDueText(active.map((x) => x.id))
    return (
      <div className="space-y-4">
        {header}
        <div className="rounded-xl bg-zinc-900/80 p-6 text-center ring-1 ring-white/5">
          <p className="text-3xl">✓</p>
          <p className="mt-2 text-lg text-zinc-100">{active.length ? 'All caught up' : 'Every mistake here is retired'}</p>
          <p className="mt-1 text-sm text-zinc-400">
            {active.length ? `Nothing is due right now${next ? ` — the next one comes back ${next}` : ''}.` : 'You can still practice them in the Retired tab.'}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {active.length > 0 && (
              <button className="btn-secondary" onClick={() => switchTo('train', true)}>
                Practice anyway
              </button>
            )}
            {retired.length > 0 && (
              <button className="btn-secondary" onClick={() => switchTo('retired')}>
                Retired ({retired.length})
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const solver = new Chess(p.fen).turn()
  const practiceOnly = tab === 'retired' || isRetired(p.id)

  function next() {
    setI((x) => x + 1)
    reset()
  }

  function onMove(m: BoardMove) {
    if (state !== 'solving') return false
    const uci = m.from + m.to + (m.promotion ?? '')
    setPlayed(uci) // keep your move on the board, right or wrong
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
        if (!practiceOnly) recordPuzzle(p.id, false)
        setScore((s) => ({ ...s, bad: s.bad + 1 }))
        setNote(`${r.playedSan} isn't it. In the game you played ${p.played}; the move was ${uciToSan(p.fen, [p.best])[0]}.`)
      }
    })
    return true
  }

  function win(text: string) {
    addToSet('ownPuzzlesSeen', p.id)
    setState('solved')
    const retiredNow = !practiceOnly && recordPuzzle(p.id, true)
    const st = puzzleStat(p.id)
    setNote(`${text}${retiredNow ? ' Retired — you won\'t see this one in training again.' : !practiceOnly && st ? ` Back again ${st.due && st.due > Date.now() ? 'later' : 'soon'} to make it stick.` : ''}`)
    setScore((s) => ({ ...s, ok: s.ok + 1 }))
    count('ownSolves')
    award(addToSet('ownPuzzles', p.id) ? 25 : practiceOnly ? 2 : 6, 'Fixed one of your mistakes', 'own')
  }

  const done = state === 'failed' || state === 'solved'
  const arrows: Arrow[] = done && (state === 'failed' || played !== p.best) ? [{ startSquare: p.best.slice(0, 2), endSquare: p.best.slice(2, 4), color: 'rgba(16,185,129,0.85)' }] : []
  const fen = played ? after(p.fen, played) : p.fen
  const last = played ?? p.lastUci

  return (
    <div className="space-y-5">
      {header}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,560px)_1fr]">
        <div className="space-y-3">
          <Board
            fen={fen}
            orientation={solver === 'w' ? 'white' : 'black'}
            onMove={onMove}
            player={solver}
            interactive={state === 'solving'}
            arrows={arrows}
            lastMove={last ? { from: last.slice(0, 2), to: last.slice(2, 4) } : null}
            flash={played && done ? { square: played.slice(2, 4), color: state === 'solved' ? 'good' : 'bad' } : null}
            result={done ? <ResultCard tone={state === 'solved' ? 'success' : 'fail'} title={state === 'solved' ? 'Fixed!' : 'Not quite'} subtitle={note} onPrimary={next} primaryLabel="Next" /> : undefined}
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
          {!practiceOnly ? (
            <div className="space-y-1">
              <div className="h-1 overflow-hidden rounded bg-zinc-800">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${retireProgress(p.id) * 100}%` }} />
              </div>
              <p className="text-[11px] text-zinc-500">Progress to retiring this mistake</p>
            </div>
          ) : (
            <p className="text-[11px] text-zinc-500">Retired — practice only.</p>
          )}
          {state === 'checking' && <p className="text-zinc-400">Checking with Stockfish…</p>}
          {done && <WhyList explanation={explainMove(p.fen, p.best, p.pv)} />}
        </section>
      </div>
    </div>
  )
}

function sortQueue(list: MistakePuzzle[], all: boolean) {
  return [...list]
    .filter((p) => all || isDuePuzzle(p.id))
    .sort((a, b) => Number(isDuePuzzle(b.id)) - Number(isDuePuzzle(a.id)) || retireProgress(a.id) - retireProgress(b.id))
}
