import { Chess } from 'chess.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Arrow } from 'react-chessboard'
import { Board, type BoardMove } from '../components/Board'
import { BlindfoldBar } from '../components/Blindfold'
import { ResultCard } from '../components/ResultCard'
import { WhyList } from '../components/EnginePanel'
import { ENDGAMES, type EndgameDef } from '../data/endgames'
import { getCheckEngine, getPlayEngine } from '../lib/engine'
import { perfectMove, probe } from '../lib/tablebase'
import { explainMove, type Explanation } from '../lib/explain'
import { addToSet, award, best, count, useProfile } from '../lib/game'
import { COURSES } from '../data/courses'
import { MiniBoard } from '../components/MiniBoard'
import { EndgameLearn } from './EndgameLearn'

type Result = { ok: boolean; text: string } | null

const GOAL_LABEL: Record<EndgameDef['goal'], string> = { mate: 'deliver mate', promote: 'promote', win: 'win', draw: 'hold the draw' }

/** Courses: progress dots, a "continue" button, and a one-off bonus when a course is complete (and when every step has ★★★). */
function CourseStrip({ solved, stars, current, onPick }: { solved: Set<string>; stars: Record<string, number>; current: string; onPick: (id: string) => void }) {
  useEffect(() => {
    for (const c of COURSES) {
      if (c.steps.every((s) => solved.has(s)) && addToSet('courses', c.id)) award(150, `Course complete: ${c.name}`)
      // stars only exist for mates; other steps just need solving
      const perfect = (s: string) => (ENDGAMES.find((e) => e.id === s)?.goal === 'mate' ? (stars[`eg-${s}`] ?? 0) >= 3 : solved.has(s))
      if (c.steps.some((s) => ENDGAMES.find((e) => e.id === s)?.goal === 'mate') && c.steps.every(perfect) && addToSet('coursesGold', c.id)) award(100, `${c.name}: perfect technique`)
    }
  }, [solved, stars])
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
      {COURSES.map((c) => {
        const done = c.steps.filter((s) => solved.has(s)).length
        const next = c.steps.find((s) => !solved.has(s)) ?? c.steps.find((s) => (stars[`eg-${s}`] ?? 0) < 3) ?? c.steps[0]
        const active = c.steps.includes(current)
        return (
          <button key={c.id} onClick={() => onPick(next)} title={c.blurb} className={`rounded-lg p-3 text-left ring-1 transition ${active ? 'ring-brand-500/50' : 'ring-white/5 hover:ring-white/15'}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-zinc-100">{c.name}</span>
              <span className="text-[11px] text-zinc-500">
                {done}/{c.steps.length}
              </span>
            </div>
            <div className="mt-2 flex gap-1">
              {c.steps.map((s) => (
                <span key={s} className={`h-1.5 flex-1 rounded-full ${(stars[`eg-${s}`] ?? 0) >= 3 ? 'bg-amber-400' : solved.has(s) ? 'bg-emerald-500' : s === current ? 'bg-brand-400/60' : 'bg-zinc-800'}`} />
              ))}
            </div>
            <span className="mt-2 block text-[11px] text-brand-400">{done === c.steps.length ? 'Replay for ★★★ →' : 'Continue →'}</span>
          </button>
        )
      })}
    </div>
  )
}

function judge(def: EndgameDef, chess: Chess, startPawns: number, myMoves: number): Result {
  const me = def.side
  const pieces = chess.board().flat().filter((p) => p !== null)
  const mine = pieces.filter((p) => p.color === me)
  const theirs = pieces.filter((p) => p.color !== me)
  const myPawns = mine.filter((p) => p.type === 'p').length
  if (chess.isCheckmate()) return chess.turn() === me ? { ok: false, text: 'You got mated.' } : def.goal === 'draw' ? { ok: true, text: 'You even won it!' } : { ok: true, text: 'Checkmate — solved!' }

  if (def.goal === 'draw') {
    if (chess.isDraw() || chess.isStalemate()) return { ok: true, text: 'Draw secured — solved!' }
    if (startPawns === 0 && !pieces.some((p) => p.type === 'p') && theirs.length <= 1) return { ok: true, text: 'Nothing left to win with — solved!' }
    if (theirs.some((p) => p.type === 'q') && !new Chess(def.fen).board().flat().some((p) => p?.type === 'q' && p.color !== me))
      return { ok: false, text: 'They promoted. Try again!' }
    if (def.holdMoves && myMoves >= def.holdMoves) return { ok: true, text: `You held for ${def.holdMoves} moves — solved!` }
    if (!def.holdMoves && !pieces.some((p) => p.type === 'p')) return { ok: true, text: 'The pawn is gone — a dead draw. Solved!' }
    return null
  }

  if (chess.isDraw() || chess.isStalemate()) return { ok: false, text: chess.isStalemate() ? 'Stalemate! Careful with the last moves.' : 'Draw — the win slipped away.' }
  if (def.goal === 'promote') {
    if (mine.some((p) => p.type === 'q') && !new Chess(def.fen).board().flat().some((p) => p?.type === 'q' && p.color === me)) return { ok: true, text: 'Promoted — solved! (The rest is technique.)' }
    if (startPawns && !myPawns) return { ok: false, text: 'You lost the pawn.' }
  }
  if (def.goal === 'win' && theirs.length === 1 && mine.some((p) => p.type === 'q' || p.type === 'r')) return { ok: true, text: 'Only a bare king left — solved!' }
  if ((def.goal === 'win' || def.goal === 'mate') && !mine.some((p) => p.type !== 'k')) return { ok: false, text: 'You lost your winning material.' }
  return null
}

export function Endgames() {
  const profile = useProfile()
  const solved = new Set(profile.sets.endgames ?? [])
  const [def, setDef] = useState<EndgameDef>(ENDGAMES[0])
  const [category, setCategory] = useState<EndgameDef['category']>(ENDGAMES[0].category)
  const [moves, setMoves] = useState<string[]>([])
  const [hint, setHint] = useState<Explanation | null>(null)
  const [mode, setMode] = useState<'play' | 'learn'>('play')
  const [hintUci, setHintUci] = useState<string | null>(null)
  const [thinking, setThinking] = useState(false)
  const [blind, setBlind] = useState(false)
  const [peek, setPeek] = useState(false)
  const assisted = useRef(false) // used a hint, take-back or peek this attempt
  if (peek) assisted.current = true

  const { chess, fen } = useMemo(() => {
    const c = new Chess(def.fen)
    for (const u of moves) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
    return { chess: c, fen: c.fen() }
  }, [def, moves])

  const startPawns = useMemo(() => new Chess(def.fen).board().flat().filter((p) => p?.type === 'p' && p.color === def.side).length, [def])
  const myMoves = Math.ceil((moves.length - (new Chess(def.fen).turn() === def.side ? 0 : 1)) / 2)
  const result = judge(def, chess, startPawns, myMoves)

  // Reward once per attempt when the result first appears.
  // Perfect-play benchmark from the Lichess endgame database (≤7 pieces): how fast can this be won?
  const [optimal, setOptimal] = useState<number | null>(null)
  useEffect(() => {
    setOptimal(null)
    if (def.goal !== 'mate' && def.goal !== 'win') return
    if (def.fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').length > 7) return
    let live = true
    fetch(`https://tablebase.lichess.ovh/standard?fen=${encodeURIComponent(def.fen)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((tb) => {
        // dtm is in plies; we count your moves
        if (live && tb && typeof tb.dtm === 'number' && tb.dtm !== 0) setOptimal(Math.ceil(Math.abs(tb.dtm) / 2))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [def])
  const stars = result?.ok && optimal && chess.isCheckmate() ? (myMoves <= optimal ? 3 : myMoves <= optimal + 4 ? 2 : 1) : 0

  const rewarded = useRef(false)
  useEffect(() => {
    if (!result?.ok || rewarded.current) return
    rewarded.current = true
    const first = addToSet('endgames', def.id)
    const mult = blind && !assisted.current ? 2 : 1
    if (def.goal === 'draw') count('drawsHeld')
    if (mult === 2) count('blindEndgames')
    count('endgameSolves')
    award((first ? 100 : 10) * mult * (assisted.current && !blind ? 0.5 : 1), first ? `${def.name} solved!` : 'Endgame solved', `endgame:${def.id}`)
    if (stars && best(`eg-${def.id}`, stars) && stars === 3) award(50, 'Perfect technique ★★★')
  }, [result?.ok, def, blind])

  // Stockfish defends / attacks at full strength.
  useEffect(() => {
    if (result || chess.isGameOver() || chess.turn() === def.side) return
    let live = true
    setThinking(true)
    // the defender plays perfectly too (tablebase), so the ★★★ target is fair; Stockfish otherwise
    void (async () => {
      const tb = await probe(fen)
      const perfect = tb && perfectMove(tb)
      let uci = perfect?.uci
      if (!uci) {
        const engine = getPlayEngine()
        engine.setOption('Skill Level', 20)
        uci = (await engine.analyze(fen, { movetime: 500 })).bestmove
      }
      if (!live) return
      setThinking(false)
      if (uci && uci !== '(none)') setMoves((m) => [...m, uci!])
    })()
    return () => {
      live = false
    }
  }, [fen, chess, def.side, result])

  function choose(d: EndgameDef) {
    setDef(d)
    setCategory(d.category)
    setMoves([])
    setHint(null)
    setHintUci(null)
    assisted.current = false
    rewarded.current = false
  }

  function onMove(m: BoardMove) {
    if (result || chess.turn() !== def.side) return false
    setMoves((ms) => [...ms, m.from + m.to + (m.promotion ?? '')])
    setHint(null)
    setHintUci(null)
    return true
  }

  async function askHint() {
    assisted.current = true
    // perfect play from the tablebase when it covers the position (Stockfish finds *a* mate, not the fastest)
    const tb = await probe(fen)
    const perfect = tb && perfectMove(tb)
    if (perfect) {
      setHintUci(perfect.uci)
      const mateIn = perfect.dtm ? Math.ceil(Math.abs(perfect.dtm) / 2) : null
      const exp = explainMove(fen, perfect.uci, [perfect.uci])
      // opening heuristics ("early queen move", development) don't belong in an endgame
      const relevant = exp.reasons.filter((r) => !/early queen|develop|castl|center pawn|opening/i.test(r))
      setHint({ ...exp, reasons: [...(mateIn !== null && def.goal !== 'draw' ? [`Perfect play (endgame tablebase): mate in ${mateIn + 1} from here.`] : ['Perfect play (endgame tablebase).']), ...relevant] })
      return
    }
    const a = await getCheckEngine().analyze(fen, { depth: 18, multipv: 1 })
    const best = a.lines[0]
    if (!best) return
    setHintUci(best.pv[0])
    setHint(explainMove(fen, best.pv[0], best.pv))
  }

  const arrows: Arrow[] = hintUci ? [{ startSquare: hintUci.slice(0, 2), endSquare: hintUci.slice(2, 4), color: 'rgba(16,185,129,0.85)' }] : []
  const last = moves.at(-1)
  const categories = [...new Set(ENDGAMES.map((e) => e.category))]

  return (
    <div className="space-y-5">
      <CourseStrip solved={solved} stars={profile.bests} current={def.id} onPick={(id) => choose(ENDGAMES.find((e) => e.id === id)!)} />

      {/* compact picker: category tabs + the endgames in that category */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-white/10">
          {categories.map((cat) => {
            const inCat = ENDGAMES.filter((d) => d.category === cat)
            const done = inCat.filter((d) => solved.has(d.id)).length
            return (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${category === cat ? 'border-brand-400 text-zinc-50' : 'border-transparent text-zinc-500 hover:text-zinc-200'}`}
              >
                {cat} <span className="text-xs text-zinc-500">{done}/{inCat.length}</span>
              </button>
            )
          })}
          <span className="ml-auto pb-2 text-xs text-zinc-500">
            {solved.size}/{ENDGAMES.length} solved
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
          {ENDGAMES.filter((d) => d.category === category).map((d) => {
            const stars = profile.bests[`eg-${d.id}`] ?? 0
            return (
              <button
                key={d.id}
                onClick={() => choose(d)}
                title={`${d.name} — ${d.level} · ${GOAL_LABEL[d.goal]} as ${d.side === 'w' ? 'White' : 'Black'}`}
                className={`group overflow-hidden rounded-lg text-left ring-1 transition hover:-translate-y-0.5 ${d === def ? 'ring-2 ring-brand-400' : 'ring-white/10 hover:ring-white/30'}`}
              >
                <div className="relative">
                  <MiniBoard fen={d.fen} orientation={d.side === 'w' ? 'white' : 'black'} />
                  {solved.has(d.id) && (
                    <span className="absolute right-1 top-1 rounded bg-black/60 px-1 text-[10px] font-semibold text-emerald-300">{stars ? '★'.repeat(stars) : '✓'}</span>
                  )}
                </div>
                <div className="px-1.5 py-1">
                  <p className={`line-clamp-2 text-[11px] leading-tight ${d === def ? 'text-zinc-50' : 'text-zinc-300 group-hover:text-zinc-100'}`}>{d.name}</p>
                  <p className="text-[10px] text-zinc-500">{GOAL_LABEL[d.goal]}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-white/10">
        {(['play', 'learn'] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${mode === m ? 'border-brand-400 text-zinc-50' : 'border-transparent text-zinc-500 hover:text-zinc-200'}`}>
            {m === 'play' ? 'Play it' : 'Learn it — watch perfect play'}
          </button>
        ))}
      </div>

      {mode === 'learn' ? (
        <EndgameLearn key={def.id} def={def} />
      ) : (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-3">
          <Board size="large" fen={fen} orientation={def.side === 'w' ? 'white' : 'black'} onMove={onMove} interactive={!result} player={def.side} arrows={arrows} lastMove={last ? { from: last.slice(0, 2), to: last.slice(2, 4) } : null} blind={blind && !peek}
            result={
              result ? (
                <ResultCard
                  tone={result.ok ? 'success' : 'fail'}
                  title={result.ok ? 'Solved!' : 'Not this time'}
                  subtitle={
                    <>
                      <p>{result.text}</p>
                      {stars > 0 && (
                        <p className="mt-1 text-lg text-amber-300">
                          {'★'.repeat(stars)}
                          {'☆'.repeat(3 - stars)} <span className="text-sm text-zinc-400">{myMoves} moves · perfect play: {optimal}</span>
                        </p>
                      )}
                    </>
                  }
                  onPrimary={result.ok ? () => choose(ENDGAMES[(ENDGAMES.indexOf(def) + 1) % ENDGAMES.length]) : () => choose(def)}
                  primaryLabel={result.ok ? 'Next endgame' : 'Try again'}
                >
                  {result.ok && (
                    <button className="btn-secondary" onClick={() => choose(def)}>
                      Again
                    </button>
                  )}
                </ResultCard>
              ) : undefined
            }
          />
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => choose(def)}>⟲ Restart</button>
            <button
              className="btn-secondary"
              onClick={() => {
                assisted.current = true
                setMoves((m) => m.slice(0, Math.max(0, m.length - 2)))
              }}
              disabled={moves.length < 2 || !!result}
            >
              ← Take back
            </button>
            <button className="btn-secondary" onClick={askHint} disabled={!!result || chess.turn() !== def.side}>Hint</button>
            <span className="ml-auto text-sm text-zinc-500 self-center">
              {thinking ? 'Stockfish is thinking…' : `${myMoves} move${myMoves === 1 ? '' : 's'}`}
              {def.holdMoves && !result ? ` / hold ${def.holdMoves}` : ''}
            </span>
          </div>
          <BlindfoldBar blind={blind} setBlind={setBlind} setPeek={setPeek} fen={fen} onMove={onMove} myTurn={!result && chess.turn() === def.side} />
        </div>

        <div className="space-y-4 min-w-0">
          <section className="rounded-xl bg-zinc-900/80 ring-1 ring-white/5 p-4 space-y-3">
            <h2 className="text-lg font-semibold text-zinc-100">{def.name}</h2>
            {optimal && (
              <p className="text-xs text-amber-300/90">
                Perfect play mates in {optimal} moves · ★★★ for ≤{optimal}, ★★ for ≤{optimal + 4}
                {profile.bests[`eg-${def.id}`] ? ` · your best ${'★'.repeat(profile.bests[`eg-${def.id}`])}` : ''}
              </p>
            )}
            <p className="text-sm text-zinc-300">{def.summary}</p>
            <p className="text-xs text-zinc-500">
              Goal: {GOAL_LABEL[def.goal]}
              {def.holdMoves ? ` (or survive ${def.holdMoves} moves)` : ''} · first solve +100 XP, blindfold ×2, hints/take-backs halve it
            </p>
            <h3 className="text-sm font-semibold tracking-wide text-zinc-300 uppercase pt-1">Technique</h3>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-zinc-300">
              {def.technique.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
          </section>
          {hint && <WhyList explanation={hint} title={`Hint: ${hint.san}`} />}
        </div>
      </div>
      )}
    </div>
  )
}
