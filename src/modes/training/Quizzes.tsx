import { Chess } from 'chess.js'
import { useEffect, useRef, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { OPENINGS, type OpeningDef } from '../../data/openings'
import { formatScore, getCheckEngine, scoreValue, uciToSan } from '../../lib/engine'
import { award, count, best, useProfile } from '../../lib/game'
import { getGames } from '../../lib/games'
import { boardColors, useSettings } from '../../lib/settings'
import { START_FEN as START_POS, getTree, pathTo } from '../../lib/tree'
import { DrillShell, shuffle, type DrillApi } from './shared'

export function Mini({ fen, orientation }: { fen: string; orientation: 'white' | 'black' }) {
  const [light, dark] = boardColors(useSettings())
  return (
    <div className="aspect-square w-full max-w-[520px] select-none">
      <Chessboard options={{ position: fen, boardOrientation: orientation, allowDragging: false, lightSquareStyle: { backgroundColor: light }, darkSquareStyle: { backgroundColor: dark }, animationDurationInMs: 0 }} />
    </div>
  )
}

/** Round-based quiz frame (no timer): N rounds, score, personal best, XP. */
export function RoundShell({ id, title, blurb, rounds, xpPer, children }: { id: string; title: string; blurb: string; rounds: number; xpPer: number; children: (api: { answer: (points: number) => void; round: number }) => React.ReactNode }) {
  const profile = useProfile()
  const [round, setRound] = useState(0)
  const [score, setScore] = useState(0)
  const [summary, setSummary] = useState<string | null>(null)
  const [answered, setAnswered] = useState(false)
  const scoreRef = useRef(0)
  function answer(points: number) {
    scoreRef.current += points
    setScore(scoreRef.current)
    setAnswered(true)
  }
  function next() {
    setAnswered(false)
    if (round >= rounds) {
      const final = scoreRef.current
      const isBest = best(id, final)
      award(final * xpPer + (isBest && final ? 25 : 0), isBest && final ? `New best in ${title}!` : `${title}: ${final}`, `drill:${title}`)
      count('drills')
      setSummary(`Score ${final}${isBest && final ? ' — new personal best!' : ''}`)
      setRound(0)
    } else setRound((r) => r + 1)
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-50">{title}</h2>
          <p className="max-w-2xl text-sm text-zinc-400">{blurb}</p>
        </div>
        <div className="ml-auto flex items-center gap-4 text-sm">
          <span className="text-zinc-400">
            best <b className="text-zinc-100">{profile.bests[id] ?? 0}</b>
          </span>
          {round > 0 && (
            <span className="text-zinc-300">
              {round}/{rounds} · <b className="text-emerald-400">{score}</b>
            </span>
          )}
          {round === 0 && (
            <button
              className="btn-primary"
              onClick={() => {
                scoreRef.current = 0
                setScore(0)
                setSummary(null)
                setRound(1)
              }}
            >
              {summary ? 'Again' : 'Start'}
            </button>
          )}
        </div>
      </div>
      {summary && round === 0 && <div className="rounded-lg bg-emerald-950/50 p-3 font-semibold text-emerald-200">{summary}</div>}
      {round > 0 && (
        <div key={round}>
          {children({ answer, round })}
          {answered && <NextButton onNext={next} last={round >= rounds} />}
        </div>
      )}
    </div>
  )
}

function NextButton({ onNext, last }: { onNext: () => void; last: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Enter' && onNext()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onNext])
  return (
    <button className="btn-primary mt-4" onClick={onNext}>
      {last ? 'Finish' : 'Next'} ↵
    </button>
  )
}

// ───────────── Plan quiz ─────────────

function planQuestion() {
  const withIdeas = OPENINGS.filter((o) => o.ideas.length >= 2)
  const def = withIdeas[Math.floor(Math.random() * withIdeas.length)]
  const tree = getTree(def)
  const leaf = tree.leaves[Math.floor(Math.random() * tree.leaves.length)]
  const correct = def.ideas[Math.floor(Math.random() * def.ideas.length)]
  const pool = withIdeas.filter((o) => o.id !== def.id && o.side === def.side).flatMap((o) => o.ideas)
  const options = shuffle([correct, ...shuffle(pool).slice(0, 3)])
  return { def, fen: leaf.fen, correct, options }
}

export function PlanQuiz() {
  return (
    <RoundShell id="plans" title="Plans & ideas" blurb="Knowing the moves isn't enough — know what they're for. Which idea belongs to this opening?" rounds={10} xpPer={4}>
      {({ answer }) => <PlanRound answer={answer} />}
    </RoundShell>
  )
}

function PlanRound({ answer }: { answer: (n: number) => void }) {
  const [q] = useState(planQuestion)
  const [picked, setPicked] = useState<string | null>(null)
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,480px)_1fr]">
      <Mini fen={q.fen} orientation={q.def.side === 'w' ? 'white' : 'black'} />
      <div className="space-y-3">
        <p className="text-zinc-200">
          You're playing the <b>{q.def.name}</b> as {q.def.side === 'w' ? 'White' : 'Black'}. Which of these is a key idea of <i>this</i> opening?
        </p>
        {q.options.map((o) => {
          const state = picked && (o === q.correct ? 'right' : o === picked ? 'wrong' : '')
          return (
            <button
              key={o}
              disabled={!!picked}
              onClick={() => {
                setPicked(o)
                answer(o === q.correct ? 1 : 0)
              }}
              className={`block w-full rounded-lg px-4 py-3 text-left text-sm ring-1 transition ${state === 'right' ? 'bg-emerald-950/50 text-emerald-200 ring-emerald-500/50' : state === 'wrong' ? 'bg-red-950/50 text-red-200 ring-red-500/50' : 'text-zinc-200 ring-white/10 hover:bg-zinc-900'}`}
            >
              {o}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ───────────── Guess the eval ─────────────

const BUCKETS = ['Black is winning', 'Black is better', 'About equal', 'White is better', 'White is winning'] as const
const bucketOf = (v: number) => (v <= -2.5 ? 0 : v <= -0.8 ? 1 : v < 0.8 ? 2 : v < 2.5 ? 3 : 4)

/** Positions from your analysed games (eval already known) and from the opening lines (evaluated on the fly). */
async function evalQuestion(): Promise<{ fen: string; value: number; label: string; bestSan: string; source: string }> {
  const games = getGames().games.filter((g) => g.analysis)
  if (games.length && Math.random() < 0.5) {
    const g = games[Math.floor(Math.random() * games.length)]
    const m = g.analysis!.moves[Math.floor(Math.random() * g.analysis!.moves.length)]
    const c = new Chess()
    for (const s of g.sans.slice(0, m.ply - 1)) c.move(s)
    return { fen: c.fen(), value: scoreValue(m.before), label: formatScore(m.before), bestSan: m.bestSan, source: g.notMine ? `${g.white} – ${g.black}` : `your game vs ${g.userColor === 'w' ? g.black : g.white}` }
  }
  const def = OPENINGS[Math.floor(Math.random() * OPENINGS.length)]
  const nodes = [...getTree(def).nodes.values()].filter((n) => n.ply >= 8)
  const node = nodes[Math.floor(Math.random() * nodes.length)]
  const a = await getCheckEngine().analyze(node.fen, { depth: 14, multipv: 1 })
  const l = a.lines[0]
  return { fen: node.fen, value: scoreValue(l), label: formatScore(l), bestSan: uciToSan(node.fen, [l?.pv[0] ?? ''])[0] ?? '', source: `${def.name}: ${pathTo(node).length} moves in` }
}

export function EvalGuess() {
  return (
    <RoundShell id="evalguess" title="Guess the eval" blurb="Who's better, and by how much? Calibrating your judgement makes you pick better plans — and know when a gambit has really paid off. Exact bucket = 2 points, one off = 1." rounds={8} xpPer={3}>
      {({ answer }) => <EvalRound answer={answer} />}
    </RoundShell>
  )
}

function EvalRound({ answer }: { answer: (n: number) => void }) {
  const [q, setQ] = useState<Awaited<ReturnType<typeof evalQuestion>> | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  useEffect(() => {
    void evalQuestion().then(setQ)
  }, [])
  if (!q) return <p className="text-sm text-zinc-400">Setting up a position…</p>
  const truth = bucketOf(q.value)
  const turn = new Chess(q.fen).turn()
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,480px)_1fr]">
      <Mini fen={q.fen} orientation="white" />
      <div className="space-y-3">
        <p className="text-sm text-zinc-400">
          {q.source} · {turn === 'w' ? 'White' : 'Black'} to move
        </p>
        <div className="grid gap-2">
          {BUCKETS.map((b, i) => {
            const state = picked === null ? '' : i === truth ? 'right' : i === picked ? 'wrong' : ''
            return (
              <button
                key={b}
                disabled={picked !== null}
                onClick={() => {
                  setPicked(i)
                  answer(i === truth ? 2 : Math.abs(i - truth) === 1 ? 1 : 0)
                  }}
                className={`rounded-lg px-4 py-2.5 text-left text-sm ring-1 ${state === 'right' ? 'bg-emerald-950/50 text-emerald-200 ring-emerald-500/50' : state === 'wrong' ? 'bg-red-950/50 text-red-200 ring-red-500/50' : 'text-zinc-200 ring-white/10 hover:bg-zinc-900'}`}
              >
                {b}
              </button>
            )
          })}
        </div>
        {picked !== null && (
          <p className="text-sm text-zinc-300">
            Stockfish: <b className="font-mono">{q.label}</b>
            {q.bestSan && (
              <>
                {' '}
                · best move <b className="font-mono">{q.bestSan}</b>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  )
}

// ───────────── Name that opening ─────────────

function openingQuestion() {
  for (let i = 0; i < 40; i++) {
    const def = OPENINGS[Math.floor(Math.random() * OPENINGS.length)]
    const tree = getTree(def)
    const leaf = tree.leaves[Math.floor(Math.random() * tree.leaves.length)]
    const path = pathTo(leaf)
    if (path.length < 5) continue
    const node = path[Math.min(path.length - 1, 5 + Math.floor(Math.random() * 4))]
    // every opening whose repertoire contains this exact move sequence counts as correct
    const holders = OPENINGS.filter((o) => getTree(o).nodes.has(node.id))
    const others = shuffle(OPENINGS.filter((o) => !holders.includes(o)))
    // prefer distractors that start the same way so it's not trivial
    const similar = others.filter((o) => o.lines[0].split(' ')[0] === def.lines[0].split(' ')[0])
    const options = shuffle([def, ...[...similar, ...others].filter((o, k, a) => a.indexOf(o) === k).slice(0, 3)])
    return { node, holders: new Set(holders.map((h) => h.id)), options, moves: pathTo(node).map((n) => n.san) }
  }
  return null
}

export function NameOpening() {
  const [pawnsOnly, setPawnsOnly] = useState(false)
  return (
    <DrillShell id="nameopening" title="Name that opening" blurb="60 seconds. Recognise openings from the position (or just the pawn structure — much harder). Great for spotting transpositions." seconds={60} xpPerPoint={3}>
      {(api) => (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <input type="checkbox" className="accent-brand-500" checked={pawnsOnly} onChange={(e) => setPawnsOnly(e.target.checked)} />
            Pawn structure only (hard mode)
          </label>
          <NameRound {...api} pawnsOnly={pawnsOnly} />
        </div>
      )}
    </DrillShell>
  )
}

function NameRound({ running, hit, miss, pawnsOnly }: DrillApi & { pawnsOnly: boolean }) {
  const [q, setQ] = useState(openingQuestion)
  const [fb, setFb] = useState<string | null>(null)
  useEffect(() => {
    if (running) setQ(openingQuestion())
  }, [running])
  if (!q) return null
  const fen = pawnsOnly ? q.node.fen.split(' ')[0].replace(/[nbrqkNBRQK]/g, '1').replace(/1+/g, (m) => String(m.length)) + ' w - - 0 1' : q.node.fen
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,480px)_1fr]">
      <Mini fen={running ? fen : START_POS} orientation="white" />
      <div className="space-y-2">
        {!pawnsOnly && running && <p className="font-mono text-xs text-zinc-500">{q.moves.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}.${s}` : s)).join(' ')}</p>}
        {q.options.map((o: OpeningDef) => (
          <button
            key={o.id}
            disabled={!running}
            onClick={() => {
              const ok = q.holders.has(o.id)
              if (ok) hit()
              else miss()
              setFb(ok ? `✓ ${o.name}` : `✗ It was ${q.options.find((x) => q.holders.has(x.id))?.name}`)
              setQ(openingQuestion())
            }}
            className="block w-full rounded-lg px-4 py-2.5 text-left text-sm text-zinc-200 ring-1 ring-white/10 hover:bg-zinc-900 disabled:opacity-40"
          >
            {o.name}
          </button>
        ))}
        {fb && <p className={fb.startsWith('✓') ? 'text-sm text-emerald-400' : 'text-sm text-red-400'}>{fb}</p>}
      </div>
    </div>
  )
}
