import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { OPENINGS } from '../../data/openings'
import { award, count, best, useProfile } from '../../lib/game'
import { colorWord, moveToWords, parseTypedMove, pieceWord, speak } from '../../lib/notation'
import { boardColors, useSettings } from '../../lib/settings'
import { START_FEN as START_POS, getTree } from '../../lib/tree'
import { DrillShell, FILES, type DrillApi } from './shared'

/** Real positions + continuations, taken from every opening line in the trainer. */
const LINES = (() => {
  const out: { fen: string; moves: string[] }[] = []
  for (const def of OPENINGS) {
    for (const leaf of getTree(def).leaves) {
      const path: string[] = []
      for (let n = leaf; n.parent; n = n.parent) path.unshift(n.san)
      if (path.length < 8) continue
      const c = new Chess()
      // start somewhere in the middle of the line so there's something on the board to track
      const start = 4 + Math.floor(Math.random() * Math.max(1, path.length - 10))
      for (const s of path.slice(0, start)) c.move(s)
      out.push({ fen: c.fen(), moves: path.slice(start) })
    }
  }
  return out
})()

function StaticBoard({ fen, orientation, highlight }: { fen: string; orientation: 'white' | 'black'; highlight?: string[] }) {
  const [light, dark] = boardColors(useSettings())
  const styles: Record<string, React.CSSProperties> = {}
  for (const sq of highlight ?? []) styles[sq] = { boxShadow: 'inset 0 0 0 4px rgba(250,204,21,0.9)' }
  return (
    <div className="aspect-square w-full max-w-[560px] select-none">
      <Chessboard options={{ position: fen, boardOrientation: orientation, allowDragging: false, lightSquareStyle: { backgroundColor: light }, darkSquareStyle: { backgroundColor: dark }, squareStyles: styles, animationDurationInMs: 250 }} />
    </div>
  )
}

// ───────────── Name the move ─────────────

export function NotationDrill() {
  return (
    <DrillShell
      id="notation"
      title="Name the move"
      blurb='60 seconds. An arrow shows a move — type it. "Nb4", "Bxe2+", or in words: "knight b4", "bishop takes e2 check". Saying moves by their squares is the foundation of calculation.'
      seconds={60}
      xpPerPoint={3}
    >
      {(api) => <Notation {...api} />}
    </DrillShell>
  )
}

function Notation({ running, hit, miss }: DrillApi) {
  const make = () => {
    const l = LINES[Math.floor(Math.random() * LINES.length)]
    const c = new Chess(l.fen)
    const legal = c.moves({ verbose: true })
    // prefer the book move, sometimes a random legal one (captures/checks make it interesting)
    const pick = Math.random() < 0.6 ? c.move(l.moves[0]) : legal[Math.floor(Math.random() * legal.length)]
    return { fen: l.fen, move: pick }
  }
  const [q, setQ] = useState(make)
  const [text, setText] = useState('')
  const [fb, setFb] = useState<{ ok: boolean; text: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (running) {
      setQ(make())
      setFb(null)
      input.current?.focus()
    }
  }, [running])

  function submit() {
    if (!running || !text.trim()) return
    const m = parseTypedMove(q.fen, text)
    const ok = !!m && m.from === q.move.from && m.to === q.move.to
    if (ok) hit()
    else miss()
    setFb({ ok, text: ok ? `✓ ${q.move.san} — ${moveToWords(q.move)}` : `✗ It was ${q.move.san} (${moveToWords(q.move)})` })
    setText('')
    setQ(make())
  }

  const turn = new Chess(q.fen).turn()
  const [light, dark] = boardColors(useSettings())
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,520px)_1fr]">
      <div className="aspect-square w-full max-w-[560px] select-none">
        <Chessboard
          options={{
            position: running ? q.fen : START_POS,
            boardOrientation: turn === 'w' ? 'white' : 'black',
            allowDragging: false,
            arrows: running ? [{ startSquare: q.move.from, endSquare: q.move.to, color: 'rgba(250,204,21,0.9)' }] : [],
            lightSquareStyle: { backgroundColor: light },
            darkSquareStyle: { backgroundColor: dark },
          }}
        />
      </div>
      <div className="space-y-4 rounded-xl bg-zinc-900/80 p-5 ring-1 ring-white/5">
        <p className="text-zinc-300">{colorWord(turn)} plays the arrow. Name it:</p>
        <input
          ref={input}
          className="input w-full font-mono text-lg"
          placeholder="e.g. Nf3 or knight f3"
          value={text}
          disabled={!running}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {fb && <p className={fb.ok ? 'text-emerald-400' : 'text-red-400'}>{fb.text}</p>}
        <p className="text-xs text-zinc-500">Captures need an x (or "takes"); check symbols are optional.</p>
      </div>
    </div>
  )
}

// ───────────── Calculate it (read-out) ─────────────

type Question =
  | { kind: 'what'; square: Square; answer: string } // "w-n", "b-p", or "empty"
  | { kind: 'where'; color: Color; piece: PieceSymbol; answer: Square }
  | { kind: 'check'; color: Color; answer: boolean }

function makeRound(plies: number) {
  for (let tries = 0; tries < 50; tries++) {
    const l = LINES[Math.floor(Math.random() * LINES.length)]
    if (l.moves.length < plies) continue
    const c = new Chess(l.fen)
    const moves: Move[] = []
    for (const s of l.moves.slice(0, plies)) moves.push(c.move(s))
    const qs: Question[] = []
    // what's on a square that changed during the line?
    const touched = [...new Set(moves.flatMap((m) => [m.from, m.to]))] as Square[]
    const sq = touched[Math.floor(Math.random() * touched.length)]
    const p = c.get(sq)
    qs.push({ kind: 'what', square: sq, answer: p ? `${p.color}-${p.type}` : 'empty' })
    // where is a uniquely identifiable piece that moved?
    const movers = moves.filter((m) => m.piece !== 'p' && c.board().flat().filter((x) => x && x.color === m.color && x.type === m.piece).length === 1)
    if (movers.length) {
      const m = movers[Math.floor(Math.random() * movers.length)]
      const at = c
        .board()
        .flat()
        .find((x) => x && x.color === m.color && x.type === m.piece)!
      qs.push({ kind: 'where', color: m.color, piece: m.piece, answer: at.square })
    }
    qs.push({ kind: 'check', color: c.turn(), answer: c.inCheck() })
    return { fen: l.fen, finalFen: c.fen(), moves, questions: qs.slice(0, 2 + (plies >= 4 ? 1 : 0)) }
  }
  return null
}

const ROUNDS = 8

export function CalculationDrill() {
  const profile = useProfile()
  const [plies, setPlies] = useState(4)
  const [voice, setVoice] = useState(false)
  const [round, setRound] = useState(0) // 0 = not started
  const [score, setScore] = useState(0)
  const [data, setData] = useState(() => makeRound(4))
  const [phase, setPhase] = useState<'read' | 'answer' | 'reveal'>('read')
  const [answers, setAnswers] = useState<(string | null)[]>([])
  const [done, setDone] = useState<string | null>(null)
  const narration = useMemo(() => data?.moves.map((m) => moveToWords(m)) ?? [], [data])

  function start() {
    setScore(0)
    setDone(null)
    setRound(1)
    newRound()
  }

  function newRound() {
    const d = makeRound(plies)
    setData(d)
    setPhase('read')
    setAnswers([])
    if (voice && d) speak(d.moves.map((m) => moveToWords(m)).join('. '))
  }

  function check() {
    if (!data) return
    const right = data.questions.filter((q, i) => {
      const a = (answers[i] ?? '').trim().toLowerCase()
      return q.kind === 'check' ? a === String(q.answer) : a === String(q.answer)
    }).length
    setScore((s) => s + right)
    setPhase('reveal')
  }

  function next() {
    if (round >= ROUNDS) {
      const max = ROUNDS * 3
      const isBest = best('calc', score)
      award(score * 4 + (isBest ? 25 : 0), isBest ? 'New best in Calculate it!' : `Calculate it: ${score}`, 'drill:calc')
      count('drills')
      setDone(`${score} correct answers out of about ${max}${isBest ? ' — new personal best!' : ''}`)
      setRound(0)
      return
    }
    setRound((r) => r + 1)
    newRound()
  }

  const orientation = data && new Chess(data.fen).turn() === 'w' ? 'white' : 'black'
  const whatOptions = ['empty', ...(['w', 'b'] as const).flatMap((c) => (['p', 'n', 'b', 'r', 'q', 'k'] as const).map((p) => `${c}-${p}`))]
  const label = (v: string) => (v === 'empty' ? 'Empty' : `${colorWord(v[0] as Color)} ${pieceWord(v[2] as PieceSymbol)}`)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-50">Calculate it</h2>
          <p className="max-w-2xl text-sm text-zinc-400">
            Look at the position, then follow the moves in your head — the board won't move. Name the squares as you go: "knight b4, bishop e2 check, king f1". Then answer.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-4 text-sm">
          <span className="text-zinc-400">
            best <b className="text-zinc-100">{profile.bests.calc ?? 0}</b>
          </span>
          {round > 0 && (
            <span className="text-zinc-300">
              round {round}/{ROUNDS} · <b className="text-emerald-400">{score}</b>
            </span>
          )}
        </div>
      </div>

      {round === 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-zinc-400">Moves to calculate:</span>
          {[2, 4, 6, 8].map((n) => (
            <button key={n} className={`chip ${plies === n ? 'chip-active' : ''}`} onClick={() => setPlies(n)}>
              {n} ({n / 2} each)
            </button>
          ))}
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <input type="checkbox" className="accent-brand-500" checked={voice} onChange={(e) => setVoice(e.target.checked)} />
            🔊 read the moves aloud
          </label>
          <button className="btn-primary" onClick={start}>
            Start
          </button>
          {done && <p className="w-full font-semibold text-emerald-300">{done}</p>}
        </div>
      )}

      {round > 0 && data && (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,520px)_1fr]">
          <StaticBoard fen={phase === 'reveal' ? data.finalFen : data.fen} orientation={orientation as 'white' | 'black'} highlight={phase === 'reveal' ? data.questions.flatMap((q) => (q.kind === 'what' ? [q.square] : q.kind === 'where' ? [q.answer] : [])) : undefined} />
          <div className="space-y-4 rounded-xl bg-zinc-900/80 p-5 ring-1 ring-white/5">
            <div>
              <p className="text-xs uppercase tracking-widest text-zinc-500">From this position{phase === 'reveal' ? ' (now showing the result)' : ''}</p>
              <ol className="mt-2 space-y-1">
                {narration.map((t, i) => (
                  <li key={i} className="text-lg text-zinc-100">
                    <span className="mr-2 text-sm text-zinc-500">{colorWord(data.moves[i].color)}:</span>
                    {t}
                  </li>
                ))}
              </ol>
              {voice && (
                <button className="mt-2 text-xs text-brand-400 hover:underline" onClick={() => speak(narration.join('. '))}>
                  🔊 repeat
                </button>
              )}
            </div>

            {phase === 'read' && (
              <button className="btn-primary" onClick={() => setPhase('answer')}>
                I've got it — ask me
              </button>
            )}

            {phase !== 'read' && (
              <div className="space-y-4">
                {data.questions.map((q, i) => {
                  const a = answers[i] ?? ''
                  const correct = phase === 'reveal' && a.trim().toLowerCase() === String(q.answer)
                  const setA = (v: string) => setAnswers((xs) => Object.assign([...xs], { [i]: v }))
                  return (
                    <div key={i} className="space-y-1.5">
                      <p className="text-sm text-zinc-200">
                        {q.kind === 'what' && (
                          <>
                            What is on <b className="font-mono text-amber-300">{q.square}</b> now?
                          </>
                        )}
                        {q.kind === 'where' && (
                          <>
                            Which square is the {colorWord(q.color).toLowerCase()} {pieceWord(q.piece)} on?
                          </>
                        )}
                        {q.kind === 'check' && <>Is {colorWord(q.color)} in check?</>}
                      </p>
                      {q.kind === 'what' && (
                        <select className="input" value={a} disabled={phase === 'reveal'} onChange={(e) => setA(e.target.value)}>
                          <option value="">choose…</option>
                          {whatOptions.map((o) => (
                            <option key={o} value={o}>
                              {label(o)}
                            </option>
                          ))}
                        </select>
                      )}
                      {q.kind === 'where' && (
                        <input className="input w-24 font-mono" maxLength={2} placeholder="e.g. f3" value={a} disabled={phase === 'reveal'} onChange={(e) => setA(e.target.value.toLowerCase())} />
                      )}
                      {q.kind === 'check' && (
                        <div className="flex gap-2">
                          {['true', 'false'].map((v) => (
                            <button key={v} disabled={phase === 'reveal'} className={`chip ${a === v ? 'chip-active' : ''}`} onClick={() => setA(v)}>
                              {v === 'true' ? 'Yes' : 'No'}
                            </button>
                          ))}
                        </div>
                      )}
                      {phase === 'reveal' && (
                        <p className={`text-xs ${correct ? 'text-emerald-400' : 'text-red-400'}`}>
                          {correct ? '✓ correct' : `✗ ${q.kind === 'what' ? label(q.answer) : q.kind === 'where' ? q.answer : q.answer ? 'Yes' : 'No'}`}
                        </p>
                      )}
                    </div>
                  )
                })}
                {phase === 'answer' ? (
                  <button className="btn-primary" onClick={check}>
                    Check answers
                  </button>
                ) : (
                  <button className="btn-primary" onClick={next}>
                    {round >= ROUNDS ? 'Finish' : 'Next round'} ↵
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <p className="text-xs text-zinc-600">Tip: squares are named file-then-rank — {FILES[0]}1 is White's bottom-left corner.</p>
    </div>
  )
}
