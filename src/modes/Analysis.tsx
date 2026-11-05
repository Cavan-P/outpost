import { Chess } from 'chess.js'
import { useEffect, useMemo, useState } from 'react'
import type { Arrow } from 'react-chessboard'
import { Board, type BoardMove } from '../components/Board'
import { EnginePanel, EvalBar, WhyList, useAnalysis } from '../components/EnginePanel'
import { getPlayEngine } from '../lib/engine'
import { reviewMove, type MoveReview } from '../lib/review'
import { START_FEN } from '../lib/tree'
import { BlindfoldBar } from '../components/Blindfold'
import { analyzeGame } from '../lib/gameAnalysis'
import type { GameAnalysis } from '../lib/games'
import { award } from '../lib/game'

const GRADE_MOVES = 10

interface Props {
  initialFen?: string
  /** start in blindfold mode against Stockfish */
  blindfold?: boolean
}

type Opponent = 'none' | 'w' | 'b'

/** Free analysis board: move freely, get engine lines + explanations, or play the position out against Stockfish. */
export function Analysis({ initialFen, blindfold = false }: Props) {
  const [startFen, setStartFen] = useState(initialFen ?? START_FEN)
  const [moves, setMoves] = useState<string[]>([]) // uci
  const [cursor, setCursor] = useState(0)
  const [flipped, setFlipped] = useState(false)
  // coming from the end of a book line: a graded play-out (engine help off until it's reviewed)
  const [graded, setGraded] = useState(!!initialFen && !blindfold)
  const [grade, setGrade] = useState<GameAnalysis | null>(null)
  const [grading, setGrading] = useState<[number, number] | null>(null)
  const [engineOn, setEngineOn] = useState(!blindfold && !initialFen)
  const [opponent, setOpponent] = useState<Opponent>(blindfold ? 'b' : 'none')
  const [blind, setBlind] = useState(blindfold)
  const [peek, setPeek] = useState(false)
  const [skill, setSkill] = useState(20)
  const [fenInput, setFenInput] = useState('')
  const [fenError, setFenError] = useState('')
  const [bestUci, setBestUci] = useState<string | null>(null)
  const [lastReview, setLastReview] = useState<MoveReview | null>(null)
  const [gradeMoves, setGradeMoves] = useState(!initialFen)

  useEffect(() => {
    if (initialFen) {
      setStartFen(initialFen)
      setMoves([])
      setCursor(0)
      // coming from an opening line: play the other side by default
      setOpponent(new Chess(initialFen).turn())
    }
  }, [initialFen])

  const { fen, sans, chess } = useMemo(() => {
    const c = new Chess(startFen)
    const sans: string[] = []
    for (const u of moves.slice(0, cursor)) sans.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san)
    return { fen: c.fen(), sans, chess: c }
  }, [startFen, moves, cursor])

  const analysis = useAnalysis(fen, engineOn)
  const userColor = opponent === 'w' ? 'b' : 'w'
  const orientation = (opponent === 'none' ? !flipped : (userColor === 'w') !== flipped) ? 'white' : 'black'

  // Engine plays its side.
  useEffect(() => {
    if (opponent === 'none' || chess.isGameOver() || chess.turn() !== opponent || cursor !== moves.length) return
    let live = true
    const engine = getPlayEngine()
    engine.setOption('Skill Level', skill)
    void engine.analyze(fen, { movetime: 400 + skill * 40 }).then((a) => {
      if (!live || !a.bestmove || a.bestmove === '(none)') return
      setMoves((m) => [...m, a.bestmove])
      setCursor((c) => c + 1)
    })
    return () => {
      live = false
    }
  }, [fen, opponent, skill, chess, cursor, moves.length])

  // all moves played so far (not just up to the cursor), for grading
  const allSans = useMemo(() => {
    const c = new Chess(startFen)
    return moves.map((u) => c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san)
  }, [startFen, moves])
  const myMoveCount = allSans.filter((_, i) => (i % 2 === 0) === (new Chess(startFen).turn() === userColor)).length
  const finalGameOver = useMemo(() => {
    const c = new Chess(startFen)
    for (const u of moves) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
    return c.isGameOver()
  }, [startFen, moves])

  useEffect(() => {
    if (!graded || grade || grading || opponent === 'none') return
    if (myMoveCount < GRADE_MOVES && !finalGameOver) return
    // wait for the engine's reply to land so the last move is judged too
    if (!finalGameOver && new Chess(fen).turn() !== userColor) return
    setGrading([0, allSans.length + 1])
    void analyzeGame({ id: 'playout', source: 'pgn', white: '', black: '', userColor, result: '*', date: 0, sans: allSans, startFen }, 12, (d, t) => setGrading([d, t])).then((a) => {
      setGrading(null)
      if (!a) return
      setGrade(a)
      award(5 + Math.round(a.accuracy[userColor] / 5), `Play-out graded: ${a.accuracy[userColor].toFixed(0)}% accuracy`)
    })
  }, [graded, grade, grading, myMoveCount, finalGameOver, fen, userColor, allSans, startFen, opponent])

  function onMove(m: BoardMove) {
    if (opponent !== 'none' && chess.turn() === opponent) return false
    const uci = m.from + m.to + (m.promotion ?? '')
    const before = fen
    setMoves((ms) => [...ms.slice(0, cursor), uci])
    setCursor((c) => c + 1)
    setLastReview(null)
    if (opponent !== 'none' && gradeMoves) void reviewMove(before, uci, undefined, 14).then(setLastReview)
    return true
  }

  function loadFen() {
    try {
      new Chess(fenInput.trim())
      setStartFen(fenInput.trim())
      setMoves([])
      setCursor(0)
      setFenError('')
    } catch (e) {
      setFenError((e as Error).message)
    }
  }

  const arrows: Arrow[] = engineOn && bestUci && (opponent === 'none' || chess.turn() !== opponent) ? [{ startSquare: bestUci.slice(0, 2), endSquare: bestUci.slice(2, 4), color: 'rgba(59,130,246,0.75)' }] : []
  const last = cursor > 0 ? moves[cursor - 1] : null
  const status = chess.isCheckmate() ? `Checkmate — ${chess.turn() === 'w' ? 'Black' : 'White'} wins` : chess.isDraw() ? 'Draw' : chess.isStalemate() ? 'Stalemate' : null

  const startNo = Number(startFen.split(' ')[5])
  const whiteFirst = startFen.split(' ')[1] === 'w'

  return (
    <div className="grid xl:grid-cols-[minmax(0,560px)_1fr] gap-6">
      <div className="space-y-3">
        <div className="flex gap-2">
          {engineOn && <EvalBar analysis={analysis} orientation={orientation} />}
          <div className="flex-1">
            <Board fen={fen} orientation={orientation} onMove={onMove} player={opponent === 'none' ? undefined : userColor} blind={blind && !peek} arrows={arrows} lastMove={last ? { from: last.slice(0, 2), to: last.slice(2, 4) } : null} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => setCursor(0)}>⏮</button>
          <button className="btn-secondary" onClick={() => setCursor((c) => Math.max(0, c - (opponent === 'none' ? 1 : 2)))}>← Undo</button>
          <button className="btn-secondary" onClick={() => setCursor((c) => Math.min(moves.length, c + 1))} disabled={cursor >= moves.length}>→</button>
          <button className="btn-secondary" onClick={() => setFlipped((f) => !f)}>⇅ Flip</button>
          <button
            className="btn-secondary ml-auto"
            onClick={() => {
              setStartFen(START_FEN)
              setMoves([])
              setCursor(0)
            }}
          >
            Reset
          </button>
        </div>
        <BlindfoldBar blind={blind} setBlind={setBlind} setPeek={setPeek} fen={fen} onMove={onMove} myTurn={opponent === 'none' || chess.turn() !== opponent} />
        {blind && engineOn && <p className="text-xs text-amber-300/80">Tip: hide the engine panel too, or its lines give the position away.</p>}
      </div>

      <div className="space-y-4 min-w-0">
        {graded && opponent !== 'none' && (
          <GradePanel
            moves={myMoveCount}
            grading={grading}
            grade={grade}
            userColor={userColor}
            startTurn={new Chess(startFen).turn()}
            onJump={(i) => setCursor(i)}
            onStop={() => setGraded(false)}
          />
        )}
        <section className="rounded-xl bg-zinc-900/80 ring-1 ring-white/5 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="text-zinc-400">Stockfish plays</label>
            <select className="input" value={opponent} onChange={(e) => setOpponent(e.target.value as Opponent)}>
              <option value="none">nobody (free analysis)</option>
              <option value="b">Black</option>
              <option value="w">White</option>
            </select>
            {opponent !== 'none' && (
              <>
                <label className="text-zinc-400" htmlFor="skill">
                  strength {skill}
                </label>
                <input id="skill" type="range" min={0} max={20} value={skill} onChange={(e) => setSkill(Number(e.target.value))} className="accent-brand-500" />
                <label className="flex items-center gap-1.5 text-zinc-400">
                  <input type="checkbox" className="accent-brand-500" checked={gradeMoves} onChange={(e) => setGradeMoves(e.target.checked)} />
                  grade my moves
                </label>
              </>
            )}
          </div>
          {status && <p className="text-emerald-400 font-semibold">{status}</p>}
          <div className="flex flex-wrap gap-x-2 gap-y-1 font-mono text-sm">
            {sans.map((s, i) => {
              const ply = i + (whiteFirst ? 0 : 1)
              const no = startNo + Math.floor(ply / 2)
              return (
                <button key={i} onClick={() => setCursor(i + 1)} className={`rounded px-1 ${i + 1 === cursor ? 'bg-brand-600 text-white' : 'text-zinc-300 hover:bg-zinc-800'}`}>
                  {ply % 2 === 0 ? `${no}.` : i === 0 ? `${no}…` : ''}
                  {s}
                </button>
              )
            })}
            {!sans.length && <span className="text-zinc-500 font-sans">Make a move on the board.</span>}
          </div>
          {lastReview && (
            <div className="text-sm space-y-2">
              <p className="text-zinc-300">
                Your last move <b className="font-mono">{lastReview.playedSan}</b>: <span className={lastReview.verdict.loss < 0.5 ? 'text-emerald-400' : 'text-red-400'}>{lastReview.verdict.label}</span>
                {lastReview.verdict.loss >= 0.2 && <> — best was <b className="font-mono">{lastReview.bestSan}</b></>}
              </p>
              {lastReview.verdict.loss >= 0.5 && lastReview.refutation && <WhyList explanation={lastReview.refutation} title={`The problem: ${lastReview.refutation.san} comes next`} />}
              {lastReview.verdict.loss >= 0.5 && lastReview.why && <WhyList explanation={lastReview.why} />}
            </div>
          )}
        </section>

        <EnginePanel fen={fen} analysis={analysis} enabled={engineOn} onToggle={setEngineOn} onBest={setBestUci} />

        <section className="rounded-xl bg-zinc-900/80 ring-1 ring-white/5 p-4 space-y-2">
          <h3 className="text-sm font-semibold tracking-wide text-zinc-300 uppercase">Position</h3>
          <code className="block text-xs text-zinc-400 break-all select-all">{fen}</code>
          <div className="flex gap-2">
            <input className="input flex-1 min-w-0" placeholder="Paste a FEN…" value={fenInput} onChange={(e) => setFenInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && loadFen()} />
            <button className="btn-secondary" onClick={loadFen}>
              Load
            </button>
          </div>
          {fenError && <p className="text-xs text-red-400">{fenError}</p>}
        </section>
      </div>
    </div>
  )
}

function GradePanel({
  moves,
  grading,
  grade,
  userColor,
  startTurn,
  onJump,
  onStop,
}: {
  moves: number
  grading: [number, number] | null
  grade: GameAnalysis | null
  userColor: 'w' | 'b'
  startTurn: 'w' | 'b'
  onJump: (ply: number) => void
  onStop: () => void
}) {
  if (grade) {
    const mine = grade.moves.filter((m) => (m.ply % 2 === 1) === (startTurn === userColor))
    const slips = mine.filter((m) => m.cls === 'inaccuracy' || m.cls === 'mistake' || m.cls === 'blunder')
    const color = { inaccuracy: 'text-yellow-400', mistake: 'text-orange-400', blunder: 'text-red-400' } as const
    return (
      <section className="space-y-3 rounded-xl bg-zinc-900/80 p-4 ring-1 ring-emerald-500/30">
        <div className="flex items-baseline justify-between">
          <h3 className="text-lg font-semibold text-zinc-50">Play-out review</h3>
          <span className="text-2xl font-semibold tabular-nums text-emerald-300">{grade.accuracy[userColor].toFixed(0)}%</span>
        </div>
        {slips.length ? (
          <ul className="space-y-1 text-sm">
            {slips.map((m) => (
              <li key={m.ply}>
                <button className="text-left hover:underline" onClick={() => onJump(m.ply)}>
                  <span className={`font-semibold ${color[m.cls as keyof typeof color]}`}>{m.cls}</span> <span className="text-zinc-300">— you played</span> <b className="font-mono">{m.san}</b>
                  <span className="text-zinc-300">, better was</span> <b className="font-mono text-emerald-300">{m.bestSan}</b>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-emerald-300">Clean — no inaccuracies. You understood the position.</p>
        )}
        <p className="text-xs text-zinc-500">Turn on the engine panel to dig into any position. Click a move above to jump to it.</p>
      </section>
    )
  }
  return (
    <section className="space-y-2 rounded-xl bg-zinc-900/80 p-4 ring-1 ring-brand-500/30">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-zinc-50">Graded play-out</h3>
        <button className="text-xs text-zinc-500 hover:text-zinc-300" onClick={onStop}>
          turn off
        </button>
      </div>
      {grading ? (
        <p className="text-sm text-zinc-400">
          Reviewing your moves… {grading[0]}/{grading[1]}
        </p>
      ) : (
        <>
          <p className="text-sm text-zinc-300">
            The book is over — now show you understand the position. Play {GRADE_MOVES} moves against Stockfish; you'll get an accuracy score and a review.
          </p>
          <div className="h-1 overflow-hidden rounded bg-zinc-800">
            <div className="h-full bg-brand-500" style={{ width: `${Math.min(1, moves / GRADE_MOVES) * 100}%` }} />
          </div>
          <p className="text-xs text-zinc-500">
            {moves}/{GRADE_MOVES} moves · engine hints are off until you're graded
          </p>
        </>
      )}
    </section>
  )
}
