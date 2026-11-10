import { useMemo, useState } from 'react'
import type { Arrow } from 'react-chessboard'
import { Board, type BoardMove } from '../../components/Board'
import { ResultCard } from '../../components/ResultCard'
import { fenAfter } from '../../lib/fenAfter'
import { OPENINGS, type OpeningDef } from '../../data/openings'
import { addToSet, award, count, useProfile } from '../../lib/game'
import { reviewMove } from '../../lib/review'
import { getTree, isMistake, moveLabel, sideToMove, type TreeNode } from '../../lib/tree'

interface Spot {
  id: string
  def: OpeningDef
  node: TreeNode // the position before the blunder
  trap: TreeNode // the blunder itself
}

/** Every position in the book where the side to move has a famous losing move available. */
function spots(): Spot[] {
  const out: Spot[] = []
  for (const def of OPENINGS)
    for (const node of getTree(def).nodes.values()) {
      const trap = node.children.find(isMistake)
      if (trap) out.push({ id: `${def.id}|${node.id}`, def, node, trap })
    }
  return out
}

type State = 'solving' | 'checking' | 'held' | 'fell'

/**
 * The reverse of trap puzzles: you're the side being tricked. Find a move that doesn't walk into it —
 * any move Stockfish rates as holding the balance counts, so there are usually several answers.
 */
export function DefendIt() {
  const all = useMemo(spots, [])
  const profile = useProfile()
  const held = new Set(profile.sets.defended ?? [])
  const [i, setI] = useState(() => Math.max(0, all.findIndex((s) => !held.has(s.id))))
  const [state, setState] = useState<State>('solving')
  const [note, setNote] = useState('')
  const [played, setPlayed] = useState<string | null>(null) // your answer, kept on the board

  const s = all[i % all.length]
  const me = sideToMove(s.node)

  function next() {
    const order = all.map((_, k) => (i + 1 + k) % all.length)
    setI(order.find((k) => !held.has(all[k].id)) ?? (i + 1) % all.length)
    setState('solving')
    setNote('')
    setPlayed(null)

  }

  function onMove(m: BoardMove) {
    if (state !== 'solving') return false
    const uci = m.from + m.to + (m.promotion ?? '')
    setPlayed(uci)

    if (uci === s.trap.uci || uci === s.trap.uci.slice(0, 4)) {
      setState('fell')
      setNote(`${moveLabel(s.trap)} is exactly the trap. ${s.trap.note || ''}`)
      count('defendFails')
      return true
    }
    setState('checking')
    void reviewMove(s.node.fen, uci, undefined, 14).then((r) => {
      if (r.verdict.loss < 0.4) {
        setState('held')
        const first = addToSet('defended', s.id)
        count('defendSolves')
        award(first ? 25 : 4, first ? 'Trap dodged!' : 'Held again', 'defend')
        setNote(`${r.playedSan} holds (${r.verdict.label.toLowerCase()}). The trap was ${moveLabel(s.trap)}: ${s.trap.note || 'it loses by force.'}`)
      } else {
        setState('fell')
        setNote(`${r.playedSan} avoids the famous trap but still loses ground (${r.verdict.label.toLowerCase()}). ${r.bestSan} was safest. The trap here was ${moveLabel(s.trap)}.`)
      }
    })
    return true
  }

  const arrows: Arrow[] = state === 'held' || state === 'fell' ? [{ startSquare: s.trap.uci.slice(0, 2), endSquare: s.trap.uci.slice(2, 4), color: 'rgba(239,68,68,0.8)' }] : []
  const fen = s.node.fen
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="text-xl font-bold text-zinc-50">Defend it</h2>
          <p className="max-w-2xl text-sm text-zinc-400">You're the one being tricked. One natural move here walks into a known trap — find a move that keeps you safe.</p>
        </div>
        <span className="ml-auto text-sm text-zinc-500">
          {held.size}/{all.length} defended
        </span>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,560px)_1fr]">
        <Board
          fen={played ? fenAfter(fen, played) : fen}
          orientation={me === 'w' ? 'white' : 'black'}
          onMove={onMove}
          interactive={state === 'solving'}
          arrows={arrows}
          lastMove={played ? { from: played.slice(0, 2), to: played.slice(2, 4) } : s.node.uci ? { from: s.node.uci.slice(0, 2), to: s.node.uci.slice(2, 4) } : null}
          flash={played && (state === 'held' || state === 'fell') ? { square: played.slice(2, 4), color: state === 'held' ? 'good' : 'bad' } : null}
          result={state === 'held' || state === 'fell' ? <ResultCard tone={state === 'held' ? 'success' : 'fail'} title={state === 'held' ? 'Safe!' : 'Caught'} subtitle={note} onPrimary={next} primaryLabel="Next" /> : undefined}
        />
        <section className="h-fit space-y-2 rounded-xl bg-zinc-900/80 p-4 text-sm ring-1 ring-white/5">
          <p className="text-zinc-100">{s.def.name}</p>
          <p className="text-zinc-400">
            {me === 'w' ? 'White' : 'Black'} to move{s.node.ply ? ` after ${moveLabel(s.node)}` : ''}. Something here is poisoned.
          </p>
          {state === 'checking' && <p className="text-zinc-500">Checking with Stockfish…</p>}
          <button className="btn-secondary" onClick={next}>
            Skip
          </button>
        </section>
      </div>
    </div>
  )
}
