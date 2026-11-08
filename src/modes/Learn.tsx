import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Arrow } from 'react-chessboard'
import { Board, type BoardMove } from '../components/Board'
import { EnginePanel, EvalBar, useAnalysis } from '../components/EnginePanel'
import { MoveTrail, historyText } from '../components/MoveTrail'
import { ResultCard } from '../components/ResultCard'
import { bookMoves, isMistake, leavesUnder, moveLabel, sideToMove, type OpeningTree, type TreeNode } from '../lib/tree'
import { getProgress, markLearned } from '../lib/progress'
import { addToSet, award, count } from '../lib/game'

import { GapFinder } from '../components/GapFinder'

interface Props {
  tree: OpeningTree
  onAnalyze: (fen: string) => void
}

export function Learn({ tree, onAnalyze }: Props) {
  const { def } = tree
  const [node, setNode] = useState<TreeNode>(tree.root)
  // The line we're walking toward; "Next" follows it, choosing a branch changes it.
  const [target, setTarget] = useState<TreeNode>(tree.leaves[0])
  const [wrong, setWrong] = useState<string | null>(null)
  const [engineOn, setEngineOn] = useState(false)
  const [bestUci, setBestUci] = useState<string | null>(null)
  const [learned, setLearned] = useState(() => new Set(getProgress(def.id).learned))
  const orientation = def.side === 'w' ? 'white' : 'black'
  const analysis = useAnalysis(node.fen, engineOn)

  const userTurn = sideToMove(node) === def.side
  const isLeaf = node.children.length === 0

  const nextOnTarget = useMemo(() => {
    if (isLeaf) return null
    return node.children.find((c) => target.id === c.id || target.id.startsWith(c.id + ' ')) ?? node.children[0]
  }, [node, target, isLeaf])

  const go = useCallback(
    (n: TreeNode) => {
      setWrong(null)
      setNode(n)
      if (!(target.id === n.id || target.id.startsWith(n.id + ' '))) setTarget(leavesUnder(n)[0])
      if (n.children.length === 0 && !learned.has(n.id)) {
        markLearned(def.id, n.id)
        addToSet('openingsStudied', def.id)
        count('linesLearned')
        award(10, 'New line studied', `learn:${def.id}`)
        setLearned((s) => new Set(s).add(n.id))
      }
    },
    [target, learned, def.id],
  )

  const next = useCallback(() => nextOnTarget && go(nextOnTarget), [nextOnTarget, go])
  const back = useCallback(() => node.parent && go(node.parent), [node, go])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, back])

  function onMove(m: BoardMove) {
    const uci = m.from + m.to + (m.promotion ?? '')
    const hit = node.children.find((c) => c.uci === uci || c.uci === m.from + m.to)
    if (hit) {
      go(hit)
      return true
    }
    setWrong(userTurn ? `That's not the book move. Book: ${bookMoves(node).map((c) => c.san).join(' or ') || '— none; this line only shows a mistake'}.` : `Not one of the book replies here — pick one below, or explore it in Analysis.`)
    return false
  }

  function nextUnlearned() {
    const leaf = tree.leaves.find((l) => !learned.has(l.id))
    setTarget(leaf ?? tree.leaves[0])
    setNode(tree.root)
    setWrong(null)
  }

  const arrows: Arrow[] = []
  if (!isLeaf && userTurn)
    for (const c of node.children) arrows.push({ startSquare: c.uci.slice(0, 2), endSquare: c.uci.slice(2, 4), color: isMistake(c) ? 'rgba(239,68,68,0.75)' : 'rgba(16,185,129,0.8)' })
  if (!isLeaf && !userTurn && nextOnTarget) arrows.push({ startSquare: nextOnTarget.uci.slice(0, 2), endSquare: nextOnTarget.uci.slice(2, 4), color: 'rgba(148,163,184,0.7)' })
  if (engineOn && bestUci) arrows.push({ startSquare: bestUci.slice(0, 2), endSquare: bestUci.slice(2, 4), color: 'rgba(59,130,246,0.75)' })

  const lastMove = node.uci ? { from: node.uci.slice(0, 2), to: node.uci.slice(2, 4) } : null

  return (
    <div className="grid xl:grid-cols-[minmax(0,560px)_1fr] gap-6">
      <div className="space-y-3">
        <div className="flex gap-2">
          {engineOn && <EvalBar analysis={analysis} orientation={orientation} />}
          <div className="flex-1">
            <Board
              fen={node.fen}
              orientation={orientation}
              onMove={onMove}
              arrows={arrows}
              lastMove={lastMove}
              result={
                isLeaf ? (
                  <ResultCard
                    tone="success"
                    title="End of the line"
                    subtitle={`${tree.leaves.filter((l) => learned.has(l.id)).length}/${tree.leaves.length} lines studied`}
                    onPrimary={nextUnlearned}
                    primaryLabel="Next line"
                  >
                  </ResultCard>
                ) : undefined
              }
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => go(tree.root)}>⟲ Start</button>
          <button className="btn-secondary" onClick={back} disabled={!node.parent}>← Back</button>
          <button className="btn-primary" onClick={next} disabled={isLeaf}>Next →</button>
          <button className="btn-secondary ml-auto" onClick={() => onAnalyze(node.fen)}>Analyze position</button>
        </div>
        <p className="text-xs text-zinc-500">Tip: use ← / → keys. Green arrows are your book moves; play them on the board or press Next.</p>
      </div>

      <div className="space-y-4 min-w-0">
        <section className="rounded-xl bg-zinc-900/80 ring-1 ring-white/5 p-4 space-y-3">
          <MoveTrail node={node} onJump={go} />
          {node.note && (
            <div className="rounded-lg bg-zinc-800/70 p-3 text-sm leading-relaxed text-zinc-200">
              {node.ply > 0 && <span className="font-mono font-semibold text-emerald-400 mr-2">{moveLabel(node)}</span>}
              {node.note}
            </div>
          )}
          {wrong && <div className="rounded-lg bg-red-950/50 p-3 text-sm text-red-300">{wrong}</div>}

          {isLeaf ? (
            <div className="rounded-lg bg-emerald-950/40 p-3 text-sm space-y-2">
              <p className="font-semibold text-emerald-300">End of this line of theory.</p>
              <p className="text-zinc-300">From here you're on your own — the engine and Analysis board can show you how to continue.</p>
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" onClick={nextUnlearned}>Next unexplored line</button>
                <button className="btn-secondary" onClick={() => onAnalyze(node.fen)}>Play it out vs Stockfish</button>
              </div>
            </div>
          ) : userTurn ? (
            <div className="text-sm">
              <p className="text-zinc-400 mb-2">Your move. Theory says:</p>
              <div className="flex flex-wrap gap-2">
                {node.children.map((c) =>
                  isMistake(c) ? (
                    <button key={c.id} className="chip chip-bad" onClick={() => go(c)} title="A mistake shown so you know the trap — don't play it">
                      {moveLabel(c)} · see the trap
                    </button>
                  ) : (
                    <button key={c.id} className="chip chip-good" onClick={() => go(c)}>
                      {moveLabel(c)}
                    </button>
                  ),
                )}
              </div>
            </div>
          ) : (
            <div className="text-sm">
              <p className="text-zinc-400 mb-2">
                Opponent to move — {node.children.length > 1 ? `${node.children.length} responses in your repertoire. Explore each:` : 'the expected reply:'}
              </p>
              <div className="flex flex-col gap-1.5">
                {node.children.map((c) => {
                  const leaves = leavesUnder(c)
                  const done = leaves.filter((l) => learned.has(l.id)).length
                  return (
                    <button key={c.id} onClick={() => go(c)} className={`text-left rounded-lg px-3 py-2 ring-1 transition ${c === nextOnTarget ? 'ring-brand-500/60 bg-zinc-800' : 'ring-white/5 hover:bg-zinc-800/70'}`}>
                      <span className="font-mono font-semibold text-zinc-100">{moveLabel(c)}</span>
                      <span className="ml-2 text-xs text-zinc-500">
                        {done}/{leaves.length} line{leaves.length > 1 ? 's' : ''} seen
                      </span>
                      {c.note && <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{c.note}</p>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        <EnginePanel fen={node.fen} analysis={analysis} enabled={engineOn} onToggle={setEngineOn} onBest={setBestUci} />

        <section className="rounded-xl bg-zinc-900/80 ring-1 ring-white/5 p-4">
          <h3 className="text-sm font-semibold tracking-wide text-zinc-300 uppercase mb-2">
            Lines <span className="text-zinc-500 normal-case font-normal">· {tree.leaves.filter((l) => learned.has(l.id)).length}/{tree.leaves.length} seen</span>
          </h3>
          <ul className="space-y-1 text-sm max-h-64 overflow-auto pr-1">
            {tree.leaves.map((leaf) => (
              <li key={leaf.id}>
                <button
                  onClick={() => {
                    setTarget(leaf)
                    setNode(tree.root)
                    setWrong(null)
                  }}
                  className={`w-full text-left rounded px-2 py-1 hover:bg-zinc-800 ${leaf === target ? 'bg-zinc-800' : ''}`}
                >
                  <span className={learned.has(leaf.id) ? 'text-emerald-400' : 'text-zinc-600'}>{learned.has(leaf.id) ? '✓' : '○'}</span>{' '}
                  <span className="font-mono text-xs text-zinc-300">{historyText(leaf)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <GapFinder tree={tree} onJump={go} onAnalyze={onAnalyze} />
      </div>
    </div>
  )
}
