import { START_FEN as START_POS } from '../../lib/tree'
import { Chess } from 'chess.js'
import { useEffect, useMemo, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { OPENINGS } from '../../data/openings'
import { getTree } from '../../lib/tree'
import { boardColors, useSettings } from '../../lib/settings'
import { DrillShell, FILES, PlainBoard, isLight, randomSquare, shuffle, type DrillApi } from './shared'

type Orient = 'white' | 'black' | 'random'

function OrientPicker({ value, onChange }: { value: Orient; onChange: (o: Orient) => void }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-zinc-400">Board:</span>
      {(['white', 'black', 'random'] as const).map((o) => (
        <button key={o} className={`chip ${value === o ? 'chip-active' : ''}`} onClick={() => onChange(o)}>
          {o === 'white' ? 'White side' : o === 'black' ? 'Black side' : 'Random'}
        </button>
      ))}
    </div>
  )
}

const pickOrient = (o: Orient): 'white' | 'black' => (o === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : o)

// ───────────── Find the square ─────────────

function FindSquare({ running, hit, miss, orient, coords }: DrillApi & { orient: Orient; coords: boolean }) {
  const [target, setTarget] = useState(randomSquare)
  const [side, setSide] = useState<'white' | 'black'>(() => pickOrient(orient))
  const [flash, setFlash] = useState<{ sq: string; good: boolean } | null>(null)

  useEffect(() => {
    if (running) {
      setTarget(randomSquare())
      setSide(pickOrient(orient))
    }
  }, [running, orient])

  function click(sq: string) {
    if (!running) return
    const good = sq === target
    if (good) hit()
    else miss()
    setFlash({ sq, good })
    setTarget(randomSquare())
    if (orient === 'random') setSide(pickOrient(orient))
  }

  const styles: Record<string, React.CSSProperties> = {}
  if (flash) styles[flash.sq] = { background: flash.good ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.7)' }

  return (
    <div className="grid xl:grid-cols-[minmax(0,520px)_1fr] gap-6 items-start">
      <PlainBoard orientation={side} squareStyles={styles} onSquareClick={click} showNotation={coords} />
      <div className="rounded-xl bg-zinc-900/80 ring-1 ring-white/5 p-6 text-center">
        <p className="text-sm text-zinc-400">Click</p>
        <p className="text-7xl font-mono font-bold text-zinc-50">{running ? target : '–'}</p>
        <p className="text-xs text-zinc-500 mt-2">You're looking from {side === 'white' ? "White's" : "Black's"} side</p>
      </div>
    </div>
  )
}

// ───────────── Name the square ─────────────

function NameSquare({ running, hit, miss, orient, coords }: DrillApi & { orient: Orient; coords: boolean }) {
  const make = () => {
    const t = randomSquare()
    const wrong = new Set<string>()
    while (wrong.size < 3) {
      // plausible distractors: same file or rank, or the mirror square
      const r = Math.random()
      const cand = r < 0.33 ? `${t[0]}${1 + Math.floor(Math.random() * 8)}` : r < 0.66 ? `${FILES[Math.floor(Math.random() * 8)]}${t[1]}` : `${FILES[7 - FILES.indexOf(t[0])]}${9 - Number(t[1])}`
      if (cand !== t) wrong.add(cand)
    }
    return { target: t, options: shuffle([t, ...wrong]) }
  }
  const [q, setQ] = useState(make)
  const [side, setSide] = useState<'white' | 'black'>(() => pickOrient(orient))
  useEffect(() => {
    if (running) {
      setQ(make())
      setSide(pickOrient(orient))
    }
  }, [running, orient])

  function answer(sq: string) {
    if (!running) return
    if (sq === q.target) hit()
    else miss()
    setQ(make())
    if (orient === 'random') setSide(pickOrient(orient))
  }

  return (
    <div className="grid xl:grid-cols-[minmax(0,520px)_1fr] gap-6 items-start">
      <PlainBoard orientation={side} squareStyles={running ? { [q.target]: { background: 'rgba(56,189,248,0.75)' } } : {}} showNotation={coords} />
      <div className="grid grid-cols-2 gap-3">
        {q.options.map((o) => (
          <button key={o} disabled={!running} onClick={() => answer(o)} className="rounded-xl bg-zinc-800 py-6 text-3xl font-mono font-bold text-zinc-100 ring-1 ring-white/10 hover:bg-zinc-700 disabled:opacity-40">
            {o}
          </button>
        ))}
      </div>
    </div>
  )
}

export function CoordinatesDrill() {
  const [mode, setMode] = useState<'find' | 'name'>('find')
  const [orient, setOrient] = useState<Orient>('white')
  const [coords, setCoords] = useState(false)
  return (
    <DrillShell
      key={mode}
      id={mode === 'find' ? 'coords' : 'coordsName'}
      title={mode === 'find' ? 'Find the square' : 'Name the square'}
      blurb="30 seconds. Instantly knowing every square makes notation, calculation and blindfold play much easier."
      seconds={30}
      xpPerPoint={2}
    >
      {(api) => (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex gap-2">
              <button className={`chip ${mode === 'find' ? 'chip-active' : ''}`} onClick={() => setMode('find')} disabled={api.running}>
                Find it
              </button>
              <button className={`chip ${mode === 'name' ? 'chip-active' : ''}`} onClick={() => setMode('name')} disabled={api.running}>
                Name it
              </button>
            </div>
            <OrientPicker value={orient} onChange={setOrient} />
            <label className="flex items-center gap-2 text-sm text-zinc-400">
              <input type="checkbox" className="accent-brand-500" checked={coords} onChange={(e) => setCoords(e.target.checked)} />
              show coordinates (easier)
            </label>
          </div>
          {mode === 'find' ? <FindSquare {...api} orient={orient} coords={coords} /> : <NameSquare {...api} orient={orient} coords={coords} />}
        </div>
      )}
    </DrillShell>
  )
}

// ───────────── Light or dark ─────────────

export function ColorsDrill() {
  return (
    <DrillShell id="colours" title="Light or dark?" blurb="30 seconds, no board. Knowing square colors instantly helps with bishops, knight forks and blindfold play. Keys: ← light, → dark." seconds={30} xpPerPoint={1}>
      {(api) => <Colors {...api} />}
    </DrillShell>
  )
}

function Colors({ running, hit, miss }: DrillApi) {
  const [lightSq, darkSq] = boardColors(useSettings())
  const [sq, setSq] = useState(randomSquare)
  const [last, setLast] = useState<boolean | null>(null)
  useEffect(() => {
    if (running) setSq(randomSquare())
  }, [running])

  function answer(light: boolean) {
    if (!running) return
    const good = light === isLight(sq)
    if (good) hit()
    else miss()
    setLast(good)
    setSq(randomSquare())
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') answer(true)
      if (e.key === 'ArrowRight') answer(false)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  return (
    <div className="max-w-md mx-auto text-center space-y-6">
      <p className={`text-8xl font-mono font-bold transition-colors ${last === null ? 'text-zinc-50' : last ? 'text-emerald-300' : 'text-red-300'}`}>{running ? sq : '–'}</p>
      <div className="grid grid-cols-2 gap-4">
        <button disabled={!running} onClick={() => answer(true)} className="rounded-xl py-6 text-xl font-bold text-zinc-900 disabled:opacity-40" style={{ background: lightSq }}>
          ← Light
        </button>
        <button disabled={!running} onClick={() => answer(false)} className="rounded-xl py-6 text-xl font-bold text-white disabled:opacity-40" style={{ background: darkSq }}>
          Dark →
        </button>
      </div>
    </div>
  )
}

// ───────────── Knight routes ─────────────

const knightHops = (sq: string) => {
  const f = FILES.indexOf(sq[0])
  const r = Number(sq[1])
  return [
    [1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1],
  ]
    .map(([df, dr]) => [f + df, r + dr])
    .filter(([ff, rr]) => ff >= 0 && ff < 8 && rr >= 1 && rr <= 8)
    .map(([ff, rr]) => `${FILES[ff]}${rr}`)
}

function knightDistance(from: string, to: string) {
  const seen = new Map([[from, 0]])
  const queue = [from]
  while (queue.length) {
    const cur = queue.shift()!
    if (cur === to) return seen.get(cur)!
    for (const n of knightHops(cur)) if (!seen.has(n)) (seen.set(n, seen.get(cur)! + 1), queue.push(n))
  }
  return Infinity
}

export function KnightDrill() {
  return (
    <DrillShell id="knight" title="Knight routes" blurb="60 seconds. Get the knight to the ★ in the fewest possible moves. Only optimal routes score." seconds={60} xpPerPoint={5}>
      {(api) => <Knight {...api} />}
    </DrillShell>
  )
}

function Knight({ running, hit, miss }: DrillApi) {
  const make = () => {
    let a = randomSquare()
    let b = randomSquare()
    while (knightDistance(a, b) < 2) {
      a = randomSquare()
      b = randomSquare()
    }
    return { start: a, at: a, target: b, used: 0, optimal: knightDistance(a, b) }
  }
  const [p, setP] = useState(make)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (running) {
      setP(make())
      setMsg('')
    }
  }, [running])

  function click(sq: string) {
    if (!running || !knightHops(p.at).includes(sq)) return
    const used = p.used + 1
    if (sq === p.target) {
      if (used === p.optimal) {
        hit()
        setMsg(`✓ Optimal: ${used} moves`)
      } else {
        miss()
        setMsg(`Reached in ${used}, but ${p.optimal} was possible`)
      }
      setP(make())
    } else setP({ ...p, at: sq, used })
  }

  const styles: Record<string, React.CSSProperties> = {
    [p.target]: { background: 'radial-gradient(circle, rgba(250,204,21,0.95) 25%, transparent 28%)' },
  }
  if (running) for (const h of knightHops(p.at)) styles[h] = { ...(styles[h] ?? {}), boxShadow: 'inset 0 0 0 3px rgba(56,189,248,0.6)' }

  return (
    <div className="grid xl:grid-cols-[minmax(0,520px)_1fr] gap-6 items-start">
      <PlainBoard position={{ [p.at]: { pieceType: 'wN' } }} squareStyles={styles} onSquareClick={click} />
      <div className="rounded-xl bg-zinc-900/80 ring-1 ring-white/5 p-5 space-y-2 text-sm">
        <p className="text-zinc-300">
          From <b className="font-mono">{p.start}</b> to <b className="font-mono text-amber-300">{p.target}</b>
        </p>
        <p className="text-zinc-400">Moves used: {p.used}</p>
        {msg && <p className={msg.startsWith('✓') ? 'text-emerald-400' : 'text-amber-300'}>{msg}</p>}
      </div>
    </div>
  )
}

// ───────────── Count checks / captures ─────────────

const POSITIONS = (() => {
  const fens = new Set<string>()
  for (const def of OPENINGS) for (const n of getTree(def).nodes.values()) if (n.ply >= 6) fens.add(n.fen)
  return [...fens]
})()

export function CountingDrill() {
  return (
    <DrillShell id="count" title="Checks & captures" blurb="60 seconds. Count the checks or captures available to the side to move. Board vision is the foundation of tactics." seconds={60} xpPerPoint={3}>
      {(api) => <Counting {...api} />}
    </DrillShell>
  )
}

function Counting({ running, hit, miss }: DrillApi) {
  const [lightSq, darkSq] = boardColors(useSettings())
  const make = () => {
    const fen = POSITIONS[Math.floor(Math.random() * POSITIONS.length)]
    const kind = Math.random() < 0.5 ? 'captures' : 'checks'
    const moves = new Chess(fen).moves({ verbose: true })
    const answer = moves.filter((m) => (kind === 'checks' ? m.san.includes('+') || m.san.includes('#') : m.isCapture())).length
    return { fen, kind, answer }
  }
  const [q, setQ] = useState(make)
  const [feedback, setFeedback] = useState('')
  useEffect(() => {
    if (running) setQ(make())
  }, [running])
  const turn = q.fen.split(' ')[1] === 'w' ? 'White' : 'Black'
  const choices = useMemo(() => [0, 1, 2, 3, 4, 5, 6], [])

  function answer(n: number) {
    if (!running) return
    const correct = n === Math.min(q.answer, 6)
    if (correct) hit()
    else miss()
    setFeedback(correct ? `✓ ${q.answer}` : `✗ it was ${q.answer}`)
    setQ(make())
  }

  return (
    <div className="grid xl:grid-cols-[minmax(0,520px)_1fr] gap-6 items-start">
      <div className="aspect-square w-full">
        <Chessboard options={{ position: running ? q.fen : START_POS, allowDragging: false, boardOrientation: turn === 'White' ? 'white' : 'black', lightSquareStyle: { backgroundColor: lightSq }, darkSquareStyle: { backgroundColor: darkSq }, boardStyle: { borderRadius: 6 } }} />
      </div>
      <div className="rounded-xl bg-zinc-900/80 ring-1 ring-white/5 p-5 space-y-4">
        <p className="text-lg text-zinc-100">
          How many <b className="text-amber-300">{q.kind}</b> does <b>{turn}</b> have?
        </p>
        <div className="grid grid-cols-4 gap-2">
          {choices.map((c) => (
            <button key={c} disabled={!running} onClick={() => answer(c)} className="rounded-lg bg-zinc-800 py-3 text-xl font-bold text-zinc-100 ring-1 ring-white/10 hover:bg-zinc-700 disabled:opacity-40">
              {c === 6 ? '6+' : c}
            </button>
          ))}
        </div>
        {feedback && <p className={feedback.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}>{feedback}</p>}
      </div>
    </div>
  )
}
