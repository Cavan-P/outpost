import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Arrow } from 'react-chessboard'
import { Board, type BoardMove } from '../components/Board'
import { EnginePanel, EvalBar, WhyList, useAnalysis } from '../components/EnginePanel'
import { MoveTrail } from '../components/MoveTrail'
import { formatScore } from '../lib/engine'
import { STAGES, getProgress, isDue, isMastered, progressOf, recordAnswer, resetProgress, stageOf, untilText, type OpeningProgress, type Outcome, type Stage } from '../lib/progress'
import { reviewMove, type MoveReview } from '../lib/review'
import { getSettings } from '../lib/settings'
import { addToSet, award, count, record } from '../lib/game'
import { BlindfoldBar } from '../components/Blindfold'
import { ResultCard } from '../components/ResultCard'
import { bookMoves, isMistake, moveLabel, sideToMove, userDecisionNodes, type OpeningTree, type TreeNode } from '../lib/tree'

type Phase = 'user' | 'opponent' | 'wrong' | 'done'

interface Props {
  tree: OpeningTree
  onAnalyze: (fen: string) => void
}

/** How much a subtree needs practice right now — steers the opponent toward new, weak and due decisions. */
function weakness(n: TreeNode, side: 'w' | 'b', p: OpeningProgress): number {
  let w = 0
  const stack = [n]
  const now = Date.now()
  while (stack.length) {
    const x = stack.pop()!
    if (sideToMove(x) === side && bookMoves(x).length) {
      const s = p.nodes[x.id]
      if (!s) w += 1.5 // never seen
      else if (isDue(s, now)) w += 1 + (1 - progressOf(s)) + Math.min(s.wrong, 4) * 0.25
      else w += 0.1 // reviewed recently — not due yet
    }
    stack.push(...x.children)
  }
  return w
}

function pickWeighted(children: TreeNode[], side: 'w' | 'b', p: OpeningProgress): TreeNode {
  const weights = children.map((c) => weakness(c, side, p) + 0.1)
  let r = Math.random() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < children.length; i++) if ((r -= weights[i]) <= 0) return children[i]
  return children[children.length - 1]
}

export function Practice({ tree, onAnalyze }: Props) {
  const { def } = tree
  const orientation = def.side === 'w' ? 'white' : 'black'
  const [node, setNode] = useState<TreeNode>(tree.root)
  const [phase, setPhase] = useState<Phase>(def.side === 'w' ? 'user' : 'opponent')
  const [progress, setProgress] = useState(() => getProgress(def.id))
  const [session, setSession] = useState({ correct: 0, wrong: 0, lines: 0 })
  const [flash, setFlash] = useState<{ square: string; color: 'good' | 'bad' } | null>(null)
  const [review, setReview] = useState<MoveReview | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [hint, setHint] = useState(false)
  // optional per-move clock: run out of time and it counts as a miss
  const [clock, setClock] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('ctt.clock')) || 0
    } catch {
      return 0
    }
  })
  const [timeLeft, setTimeLeft] = useState(0)
  const [timedOut, setTimedOut] = useState(false)
  const [trap, setTrap] = useState<TreeNode | null>(null) // you played the blunder this line warns about
  const [engineOn, setEngineOn] = useState(false)
  const [bestUci, setBestUci] = useState<string | null>(null)
  const answered = useRef(new Set<string>()) // nodes already scored this line (only first try counts)
  const analysis = useAnalysis(node.fen, engineOn)
  const [blind, setBlind] = useState(false)
  const [peek, setPeek] = useState(false)
  const [combo, setCombo] = useState(0)
  const [step, setStep] = useState<{ label: string; before: Stage; after: Stage; promoted: boolean; outcome: Outcome } | null>(null)
  // per-line bookkeeping for bonuses; refs because the opponent's reply runs from a timer
  const line = useRef({ mistakes: 0, peeked: false, blind: false, xp: 0, moves: 0 })
  line.current.blind = blind
  if (peek) line.current.peeked = true

  const decisions = useMemo(() => userDecisionNodes(tree), [tree])
  const now = Date.now()
  const stageCounts = Object.fromEntries(STAGES.map((st) => [st.id, 0])) as Record<Stage, number>
  for (const n of decisions) stageCounts[stageOf(progress.nodes[n.id])]++
  const seenDue = decisions.filter((n) => progress.nodes[n.id] && isDue(progress.nodes[n.id], now)).length
  const nextDue = Math.min(...decisions.map((n) => progress.nodes[n.id]?.due ?? Infinity).filter((d) => d > now))

  const startLine = useCallback(() => {
    answered.current.clear()
    line.current = { mistakes: 0, peeked: false, blind: line.current.blind, xp: 0, moves: 0 }
    setNode(tree.root)
    setReview(null)
    setHint(false)
    setFlash(null)
    setPhase(def.side === 'w' ? 'user' : 'opponent')
  }, [tree, def.side])

  // Opponent replies from the book, favouring lines you haven't mastered.
  useEffect(() => {
    if (phase !== 'opponent') return
    if (!node.children.length) {
      setPhase('done')
      return
    }
    const t = setTimeout(() => {
      const reply = pickWeighted(node.children, def.side, getProgress(def.id))
      setNode(reply)
      setFlash(null)
      if (!bookMoves(reply).length) finishLine()
      else setPhase('user')
    }, getSettings().autoReplyMs)
    return () => clearTimeout(t)
  }, [phase, node, def.side, def.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const blindBonus = () => (line.current.blind && !line.current.peeked ? 2 : 1)

  function finishLine() {
    setPhase('done')
    setSession((s) => ({ ...s, lines: s.lines + 1 }))
    const { mistakes } = line.current
    count('lines')
    if (def.flipped) count('flippedLines')
    if (blindBonus() === 2) count('blindLines')
    line.current.xp += 20 * blindBonus()
    award(20 * blindBonus(), 'Line complete')
    if (!mistakes) {
      count('flawless')
      line.current.xp += 15 * blindBonus()
      award(15 * blindBonus(), 'Flawless line!')
    }
  }

  function score(outcome: Outcome, label: string) {
    if (answered.current.has(node.id)) return
    answered.current.add(node.id)
    const change = recordAnswer(def.id, node.id, outcome)
    setStep({ label, outcome, ...change })
    const p = getProgress(def.id)
    setProgress(p)
    const correct = outcome === 'correct'
    setSession((s) => (correct ? { ...s, correct: s.correct + 1 } : { ...s, wrong: s.wrong + 1 }))
    if (correct) {
      const next = combo + 1
      setCombo(next)
      record('bestCombo', next)
      const xp = Math.round(10 * (1 + Math.min(next, 20) * 0.05) * blindBonus())
      line.current.xp += xp
      line.current.moves++
      award(xp, next >= 3 ? `Combo ×${next}` : undefined)
      if (decisions.every((n) => isMastered(p.nodes[n.id])) && addToSet('openingsMastered', def.id)) award(150, `${def.name} mastered!`)
    } else {
      setCombo(0)
      line.current.mistakes++
      line.current.moves++
    }
  }

  useEffect(() => {
    if (!clock || phase !== 'user') return
    const end = Date.now() + clock * 1000
    setTimeLeft(clock)
    setTimedOut(false)
    const t = setInterval(() => {
      const left = Math.max(0, (end - Date.now()) / 1000)
      setTimeLeft(left)
      if (left <= 0) {
        clearInterval(t)
        score('wrong', moveLabel(bookMoves(node)[0]))
        setTimedOut(true)
        setReview(null)
        setTrap(null)
        setPhase('wrong')
      }
    }, 100)
    return () => clearInterval(t)
  }, [clock, phase, node]) // eslint-disable-line react-hooks/exhaustive-deps

  function onMove(m: BoardMove) {
    if (phase !== 'user' && phase !== 'wrong') return false
    const uci = m.from + m.to + (m.promotion ?? '')
    const same = (c: TreeNode) => c.uci === uci || c.uci === m.from + m.to
    const hit = bookMoves(node).find(same)
    setTrap(node.children.find((c) => isMistake(c) && same(c)) ?? null)
    if (hit) {
      setTimedOut(false)
      score(hint ? 'hinted' : 'correct', moveLabel(hit))
      setReview(null)
      setHint(false)
      setFlash({ square: m.to, color: 'good' })
      setNode(hit)
      if (!hit.children.length) finishLine()
      else setPhase('opponent')
      return true
    }
    score('wrong', moveLabel(bookMoves(node)[0]))
    setFlash({ square: m.to, color: 'bad' })
    setPhase('wrong')
    setReview(null)
    setReviewing(true)
    const book = bookMoves(node)[0]
    reviewMove(node.fen, uci, book.uci, Math.min(getSettings().depth, 16))
      .then(setReview)
      .finally(() => setReviewing(false))
    return false
  }

  const arrows: Arrow[] = []
  if ((phase === 'wrong' && (review || timedOut)) || hint)
    for (const c of bookMoves(node)) arrows.push({ startSquare: c.uci.slice(0, 2), endSquare: c.uci.slice(2, 4), color: 'rgba(16,185,129,0.85)' })
  if (engineOn && bestUci && phase !== 'user') arrows.push({ startSquare: bestUci.slice(0, 2), endSquare: bestUci.slice(2, 4), color: 'rgba(59,130,246,0.75)' })
  const lastMove = node.uci ? { from: node.uci.slice(0, 2), to: node.uci.slice(2, 4) } : null

  const goodAlternative = review && review.verdict.loss < 0.3

  return (
    <div className="grid xl:grid-cols-[minmax(0,560px)_1fr] gap-6">
      <div className="space-y-3">
        <div className="flex gap-2">
          {engineOn && <EvalBar analysis={analysis} orientation={orientation} />}
          <div className="flex-1">
            <Board fen={node.fen} orientation={orientation} onMove={onMove} interactive={phase !== 'done'} player={def.side} arrows={arrows} lastMove={lastMove} flash={flash}
              blind={blind && !peek}
              result={
                phase === 'done' ? (
                  <ResultCard
                    tone="success"
                    title={line.current.mistakes ? 'Line complete' : 'Flawless line!'}
                    subtitle={
                      <>
                        <p>
                          {line.current.moves - line.current.mistakes}/{line.current.moves} moves right first time · <span className="text-amber-300">+{line.current.xp} XP</span>
                        </p>
                        {node.note && <p className="mt-2 text-xs text-zinc-400">{node.note}</p>}
                      </>
                    }
                    onPrimary={startLine}
                    primaryLabel="Next line"
                  >
                  </ResultCard>
                ) : undefined
              }
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={startLine}>⟲ New line</button>
          <button className="btn-secondary" onClick={() => setHint(true)} disabled={phase !== 'user'}>Hint</button>
          <select
            className="input"
            value={clock}
            title="Seconds per move"
            onChange={(e) => {
              const v = Number(e.target.value)
              setClock(v)
              try {
                localStorage.setItem('ctt.clock', String(v))
              } catch {
                /* not persisted */
              }
            }}
          >
            <option value={0}>⏱ No clock</option>
            <option value={3}>⏱ 3 s / move</option>
            <option value={5}>⏱ 5 s / move</option>
            <option value={10}>⏱ 10 s / move</option>
            <option value={20}>⏱ 20 s / move</option>
          </select>
          <button className="btn-secondary ml-auto" onClick={() => onAnalyze(node.fen)}>Analyze position</button>
        </div>
        <BlindfoldBar blind={blind} setBlind={setBlind} setPeek={setPeek} fen={node.fen} onMove={onMove} myTurn={phase === 'user' || phase === 'wrong'} />
      </div>

      <div className="space-y-4 min-w-0">
        <section className="rounded-xl bg-zinc-900/80 ring-1 ring-white/5 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className={`font-semibold ${phase === 'wrong' ? 'text-red-400' : phase === 'done' ? 'text-emerald-400' : 'text-zinc-200'}`}>
              {phase === 'user' && 'Your move — play the book move.'}
              {phase === 'opponent' && 'Opponent is thinking…'}
              {phase === 'wrong' && (timedOut ? "Time's up! The book move is shown — play it to continue." : 'Not the book move. Try again.')}
              {phase === 'done' && 'Line complete!'}
            </span>
            <span className="text-zinc-400 tabular-nums">
              {combo >= 2 && <span className="mr-2 font-semibold text-orange-400">🔥 ×{combo}</span>}✓ {session.correct} · ✗ {session.wrong} · lines {session.lines}
            </span>
          </div>
          <MoveTrail node={node} onJump={() => {}} />
          {clock > 0 && phase === 'user' && (
            <div className="h-1 overflow-hidden rounded bg-zinc-800">
              <div className={`h-full transition-[width] duration-100 ${timeLeft < clock * 0.3 ? 'bg-red-500' : 'bg-brand-500'}`} style={{ width: `${(timeLeft / clock) * 100}%` }} />
            </div>
          )}
          {step && <StepNote {...step} />}

          {phase === 'wrong' && (
            <div className="rounded-lg bg-zinc-800/70 p-3 text-sm space-y-2">
              {trap && (
                <div className="rounded-lg bg-rose-950/50 p-3 text-rose-200">
                  <p className="font-semibold">You fell for the trap this line is about!</p>
                  {trap.note && <p>{moveLabel(trap)}: {trap.note}</p>}
                  {trap.children[0]?.note && <p>{moveLabel(trap.children[0])}: {trap.children[0].note}</p>}
                </div>
              )}
              {reviewing && <p className="text-zinc-400">Checking your move with Stockfish…</p>}
              {review && (
                <>
                  <p className="text-zinc-200">
                    You played <b className="font-mono">{review.playedSan}</b> ({formatScore(review.played)}) —{' '}
                    engine verdict: <span className={goodAlternative ? 'text-amber-300' : 'text-red-300'}>{review.verdict.label.toLowerCase()}</span>
                    {review.verdict.loss >= 0.05 && <>, about {review.verdict.loss.toFixed(1)} pawns worse than the book</>}.
                  </p>
                  <p className="text-zinc-200">
                    Book move: <b className="font-mono text-emerald-300">{bookMoves(node).map((c) => c.san).join(' / ')}</b> ({formatScore(review.bookLine)})
                    {review.bestSan && review.bookSan !== review.bestSan && (
                      <span className="text-zinc-400"> · engine's top choice: {review.bestSan} ({formatScore(review.best)})</span>
                    )}
                  </p>
                  {goodAlternative && <p className="text-amber-200/90">Your move is fine objectively, but it isn't part of this repertoire — stick to the book to keep the lines you know.</p>}
                  {review.refutation && <WhyList explanation={review.refutation} title={`After ${review.playedSan}, the opponent answers ${review.refutation.san}:`} />}
                  {review.why && <WhyList explanation={review.why} />}
                  {bookMoves(node)[0]?.note && <p className="text-zinc-300 italic">{bookMoves(node)[0].note}</p>}
                </>
              )}
            </div>
          )}

          {phase === 'user' && node.note && node.ply > 0 && (
            <p className="text-sm text-zinc-400">
              <span className="font-mono text-zinc-300 mr-1">{moveLabel(node)}</span>
              {node.note}
            </p>
          )}

          {phase === 'done' && (
            <div className="rounded-lg bg-emerald-950/40 p-3 text-sm space-y-2">
              {node.note && <p className="text-zinc-200">{node.note}</p>}
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" onClick={startLine}>Next line</button>
                <button className="btn-secondary" onClick={() => onAnalyze(node.fen)}>Play it out vs Stockfish</button>
              </div>
            </div>
          )}
        </section>

        <EnginePanel fen={node.fen} analysis={analysis} enabled={engineOn} onToggle={setEngineOn} onBest={setBestUci} />

        <section className="rounded-xl bg-zinc-900/80 ring-1 ring-white/5 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold tracking-wide text-zinc-300 uppercase">Mastery</h3>
            <button
              className="text-xs text-zinc-500 hover:text-red-400"
              onClick={() => {
                if (confirm(`Reset practice stats for ${def.name}?`)) {
                  resetProgress(def.id)
                  setProgress(getProgress(def.id))
                }
              }}
            >
              reset
            </button>
          </div>
          <div className="flex h-2.5 rounded overflow-hidden bg-zinc-800">
            {STAGES.map((st) => (
              <div key={st.id} className={`${st.color} transition-all`} style={{ width: `${(stageCounts[st.id] / Math.max(1, decisions.length)) * 100}%` }} title={`${st.label}: ${stageCounts[st.id]}`} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {STAGES.map((st) => (
              <span key={st.id} className="flex items-center gap-1 text-zinc-300">
                <span className={`h-2 w-2 rounded-sm ${st.color}`} />
                {st.label} <b className="tabular-nums">{stageCounts[st.id]}</b>
              </span>
            ))}
            <span className="text-zinc-500">of {decisions.length} positions</span>
          </div>
          <p className="text-xs text-zinc-400">
            {seenDue > 0 ? `${seenDue} due for review now` : stageCounts.new > 0 ? 'Nothing due — keep going to meet the new positions' : 'All caught up'}
            {Number.isFinite(nextDue) && ` · next review ${untilText(nextDue - now)}`}.
          </p>
          <details className="text-xs text-zinc-500">
            <summary className="cursor-pointer hover:text-zinc-300">How mastery works</summary>
            <p className="mt-1">
              Each position climbs New → Learning → Familiar → Mastered, one step per correct answer — but only after a waiting period (5 min, 1 h, 1 day, then 3 days), so mastering a move takes several
              sessions spread over days. Answering again before it's due still earns XP but doesn't move it up. A mistake drops a move back to Learning; using Hint caps it there too. The opponent
              steers toward new, weak and due positions.
            </p>
          </details>
        </section>
      </div>
    </div>
  )
}

const STAGE_LABEL: Record<Stage, string> = { new: 'New', learning: 'Learning', familiar: 'Familiar', mastered: 'Mastered' }

/** One-line feedback on how the last answer moved that position's mastery. */
function StepNote({ label, before, after, promoted, outcome }: { label: string; before: Stage; after: Stage; promoted: boolean; outcome: Outcome }) {
  const text =
    outcome === 'hinted'
      ? `${label} with a hint — stays at ${STAGE_LABEL[after]}.`
      : outcome === 'wrong'
        ? before === after
          ? `${label} missed — still ${STAGE_LABEL[after]}.`
          : `${label} missed — back to ${STAGE_LABEL[after]}.`
        : promoted && before !== after
          ? `↑ ${label}: ${STAGE_LABEL[before]} → ${STAGE_LABEL[after]}`
          : promoted
            ? `✓ ${label}: ${after === 'mastered' ? 'mastery reinforced' : `one step closer to ${after === 'learning' ? 'Familiar' : 'Mastered'}`}`
            : `✓ ${label} — already reviewed recently, no mastery change yet.`
  const tone = outcome === 'correct' ? (promoted ? 'text-emerald-300' : 'text-zinc-400') : outcome === 'hinted' ? 'text-amber-300' : 'text-red-300'
  return <p className={`text-xs ${tone}`}>{text}</p>
}
