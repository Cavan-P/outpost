import { Chess } from 'chess.js'
import { useEffect, useMemo, useState } from 'react'
import type { Arrow } from 'react-chessboard'
import { Board, type BoardMove } from '../../components/Board'
import { MASTER_GAMES, type MasterGame } from '../../data/masters'
import { addToSet, award, best, count, useProfile } from '../../lib/game'
import { reviewMove } from '../../lib/review'

/** Positions and UCI moves of a game, from SAN. */
function replay(g: MasterGame) {
  const c = new Chess()
  const fens = [c.fen()]
  const ucis: string[] = []
  const sans: string[] = []
  for (const san of g.moves.split(' ')) {
    const m = c.move(san)
    ucis.push(m.from + m.to + (m.promotion ?? ''))
    sans.push(m.san)
    fens.push(c.fen())
  }
  return { fens, ucis, sans }
}

export function MasterGames() {
  const profile = useProfile()
  const [game, setGame] = useState<MasterGame | null>(null)
  if (game) return <GuessGame key={game.id} game={game} onBack={() => setGame(null)} />
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-zinc-50">Guess the master's move</h2>
        <p className="max-w-2xl text-sm text-zinc-400">Play through a famous game as the winner. 3 points for the move that was played, 1 for a move Stockfish rates just as good.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {MASTER_GAMES.map((g) => {
          const b = profile.bests[`master:${g.id}`]
          return (
            <button key={g.id} onClick={() => setGame(g)} className="rounded-xl p-4 text-left ring-1 ring-white/5 transition hover:ring-brand-500/40">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-lg text-zinc-100">{g.title}</p>
                {b !== undefined && <span className="text-xs text-amber-300">best {b}%</span>}
              </div>
              <p className="text-xs text-zinc-500">
                {g.white} – {g.black}, {g.event} {g.year} · you play {g.side === 'w' ? 'White' : 'Black'}
              </p>
              <p className="mt-2 text-sm text-zinc-400">{g.blurb}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function GuessGame({ game, onBack }: { game: MasterGame; onBack: () => void }) {
  const { fens, ucis, sans } = useMemo(() => replay(game), [game])
  // first ply where it's your move at or after `from`
  const startPly = useMemo(() => {
    let p = game.from
    while (p < ucis.length && (p % 2 === 0 ? 'w' : 'b') !== game.side) p++
    return p
  }, [game, ucis.length])
  const myPlies = useMemo(() => ucis.map((_, i) => i).filter((i) => i >= startPly && (i % 2 === 0 ? 'w' : 'b') === game.side), [ucis, startPly, game.side])
  const [ply, setPly] = useState(startPly)
  const [state, setState] = useState<'guess' | 'checking' | 'shown' | 'done'>('guess')
  const [score, setScore] = useState(0)
  const [log, setLog] = useState<{ ply: number; pts: number; text: string }[]>([])
  const [guess, setGuess] = useState<string | null>(null)
  const max = myPlies.length * 3

  // after revealing your move, the opponent's reply plays itself
  useEffect(() => {
    if (state !== 'shown') return
    const t = setTimeout(() => {
      const next = ply + 2
      if (next > ucis.length - 1 || !myPlies.includes(next)) return finish()
      setPly(next)
      setGuess(null)
      setState('guess')
    }, 1400)
    return () => clearTimeout(t)
  }, [state]) // eslint-disable-line react-hooks/exhaustive-deps

  function finish() {
    setState('done')
    const pct = Math.round((score / Math.max(1, max)) * 100)
    const isBest = best(`master:${game.id}`, pct)
    count('masterGames')
    if (pct >= 70) addToSet('mastersPassed', game.id)
    award(Math.round(score / 2) + (isBest ? 20 : 0), isBest ? `New best: ${game.title}` : `${game.title}: ${pct}%`, `masters:${game.id}`)
  }

  function onMove(m: BoardMove) {
    if (state !== 'guess') return false
    const uci = m.from + m.to + (m.promotion ?? '')
    setGuess(uci)
    const master = ucis[ply]
    if (uci === master || (master.length === 4 && uci.slice(0, 4) === master)) {
      setScore((s) => s + 3)
      setLog((l) => [...l, { ply, pts: 3, text: `${sans[ply]} — exactly what was played!` }])
      setState('shown')
      return true
    }
    setState('checking')
    void reviewMove(fens[ply], uci, master, 12).then((r) => {
      const pts = r.verdict.loss < 0.3 ? 1 : 0
      setScore((s) => s + pts)
      setLog((l) => [...l, { ply, pts, text: `${r.playedSan}${pts ? ' is just as good' : ` (${r.verdict.label.toLowerCase()})`} — ${game.side === 'w' ? game.white.split(' ').pop() : game.black.split(' ').pop()} played ${sans[ply]}.` }])
      setState('shown')
    })
    return false
  }

  const shownFen = state === 'shown' || state === 'done' ? fens[Math.min(ply + 2, fens.length - 1)] : fens[ply]
  const lastIdx = state === 'shown' || state === 'done' ? Math.min(ply + 1, ucis.length - 1) : ply - 1
  const last = lastIdx >= 0 ? ucis[lastIdx] : null
  const arrows: Arrow[] = state === 'shown' && guess && guess !== ucis[ply] ? [{ startSquare: guess.slice(0, 2), endSquare: guess.slice(2, 4), color: 'rgba(148,163,184,0.6)' }] : []
  const moveNo = (p: number) => `${Math.floor(p / 2) + 1}${p % 2 ? '…' : '.'}`

  return (
    <div className="space-y-4">
      <button className="text-xs text-zinc-500 hover:text-zinc-300" onClick={onBack}>
        ← all games
      </button>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,560px)_1fr]">
        <Board fen={shownFen} orientation={game.side === 'w' ? 'white' : 'black'} onMove={onMove} interactive={state === 'guess'} lastMove={last ? { from: last.slice(0, 2), to: last.slice(2, 4) } : null} arrows={arrows} />
        <section className="h-fit space-y-3 rounded-xl bg-zinc-900/80 p-4 text-sm ring-1 ring-white/5">
          <h2 className="text-xl text-zinc-50">{game.title}</h2>
          <p className="text-zinc-500">
            {game.white} – {game.black}, {game.year}
          </p>
          <div className="flex gap-4 tabular-nums">
            <span>
              score <b className="text-amber-300">{score}</b>/{max}
            </span>
            <span>
              move {Math.min(myPlies.indexOf(ply) + 1, myPlies.length)}/{myPlies.length}
            </span>
          </div>
          {state === 'guess' && <p className="text-zinc-300">{moveNo(ply)} What did {game.side === 'w' ? game.white : game.black} play?</p>}
          {state === 'checking' && <p className="text-zinc-500">Asking Stockfish…</p>}
          {state === 'done' && (
            <p className="text-lg text-emerald-300">
              Game over — {Math.round((score / Math.max(1, max)) * 100)}% match. {ucis.length === fens.length - 1 && new Chess(fens.at(-1)).isCheckmate() ? 'Checkmate!' : ''}
            </p>
          )}
          <ol className="max-h-72 space-y-1 overflow-auto">
            {[...log].reverse().map((l) => (
              <li key={l.ply} className="flex gap-2">
                <span className="w-10 shrink-0 font-mono text-zinc-500">{moveNo(l.ply)}</span>
                <span className={l.pts === 3 ? 'text-emerald-400' : l.pts ? 'text-sky-300' : 'text-zinc-400'}>{l.text}</span>
                <span className="ml-auto text-xs text-zinc-500">+{l.pts}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}
