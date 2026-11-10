import { useEffect, useMemo, useState } from 'react'
import type { Arrow } from 'react-chessboard'
import { Board } from '../../components/Board'
import { WhyList } from '../../components/EnginePanel'
import { EvalGraph } from '../../components/EvalGraph'
import { formatPv, formatScore } from '../../lib/engine'
import { explainMove } from '../../lib/explain'
import { TAG_LABEL, fensOf } from '../../lib/gameAnalysis'
import { AddLineButton, plyLabel } from '../../components/AddLine'
import { useExtensionsVersion } from '../../lib/extensions'
import { bookOf } from '../../lib/openingIndex'
import { removeGame, safeUrl, setNotMine, userResult, type ImportedGame, type MoveAnalysis } from '../../lib/games'

const CLS_STYLE: Record<MoveAnalysis['cls'], { label: string; color: string; mark: string }> = {
  best: { label: 'Best', color: 'text-emerald-400', mark: '' },
  good: { label: 'Good', color: 'text-zinc-300', mark: '' },
  inaccuracy: { label: 'Inaccuracy', color: 'text-yellow-400', mark: '?!' },
  mistake: { label: 'Mistake', color: 'text-orange-400', mark: '?' },
  blunder: { label: 'Blunder', color: 'text-red-400', mark: '??' },
}

export function GameReview({ game, initialPly = 0, onBack }: { game: ImportedGame; initialPly?: number; onBack: () => void }) {
  const fens = useMemo(() => fensOf(game.sans), [game.sans])
  const [ply, setPly] = useState(initialPly) // 0 = start position; n = after move n
  const [onlyMine, setOnlyMine] = useState(!game.notMine)
  const moves = game.analysis?.moves ?? []
  const move = ply > 0 ? moves[ply - 1] : undefined
  const mine = (m: MoveAnalysis) => (m.ply % 2 === 1 ? 'w' : 'b') === game.userColor
  const bad = moves.filter((m) => (m.cls === 'mistake' || m.cls === 'blunder') && (!onlyMine || mine(m)))

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'ArrowRight') setPly((p) => Math.min(fens.length - 1, p + 1))
      if (e.key === 'ArrowLeft') setPly((p) => Math.max(0, p - 1))
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [fens.length])

  const arrows: Arrow[] = []
  if (move && move.cls !== 'best' && move.cls !== 'good') arrows.push({ startSquare: move.best.slice(0, 2), endSquare: move.best.slice(2, 4), color: 'rgba(16,185,129,0.85)' })
  if (move?.reply[0] && (move.cls === 'mistake' || move.cls === 'blunder')) arrows.push({ startSquare: move.reply[0].slice(0, 2), endSquare: move.reply[0].slice(2, 4), color: 'rgba(239,68,68,0.7)' })
  const res = userResult(game)

  return (
    <div className="space-y-5">
      <div>
        <button className="text-xs uppercase tracking-widest text-zinc-500 hover:text-zinc-300" onClick={onBack}>
          ← Your games
        </button>
        <h1 className="mt-1 text-2xl font-bold text-zinc-50">
          {game.white} – {game.black} <span className="text-zinc-500">{game.result}</span>
        </h1>
        <p className="text-sm text-zinc-500">
          {game.opening ?? 'Unknown opening'}
          {game.notMine
            ? game.analysis && ` · accuracy White ${game.analysis.accuracy.w.toFixed(0)}%, Black ${game.analysis.accuracy.b.toFixed(0)}%`
            : <>
                {` · you were ${game.userColor === 'w' ? 'White' : 'Black'} · ${res}`}
                {game.analysis && ` · your accuracy ${game.analysis.accuracy[game.userColor].toFixed(0)}% (opponent ${game.analysis.accuracy[game.userColor === 'w' ? 'b' : 'w'].toFixed(0)}%)`}
              </>}
          {safeUrl(game.url) && (
            <a className="ml-2 text-brand-400 hover:underline" href={safeUrl(game.url)} target="_blank" rel="noopener noreferrer">
              original ↗
            </a>
          )}
        </p>
        <BookNote game={game} onJump={setPly} />
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-2 text-zinc-400" title="Games that aren't yours can be analyzed, but stay out of your mistake report, puzzles and daily review">
            <input type="checkbox" checked={!!game.notMine} onChange={(e) => setNotMine(game.id, e.target.checked)} />
            Not my game — analysis only
          </label>
          <button
            className="text-zinc-600 hover:text-red-400"
            onClick={() => {
              if (confirm('Remove this game and its analysis?')) {
                removeGame(game.id)
                onBack()
              }
            }}
          >
            Remove game
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,560px)_1fr]">
        <div className="space-y-3">
          <Board fen={fens[ply]} orientation={game.userColor === 'w' ? 'white' : 'black'} interactive={false} arrows={arrows} lastMove={move ? { from: move.uci.slice(0, 2), to: move.uci.slice(2, 4) } : null} />
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => setPly(0)}>⏮</button>
            <button className="btn-secondary" onClick={() => setPly((p) => Math.max(0, p - 1))}>←</button>
            <button className="btn-secondary" onClick={() => setPly((p) => Math.min(fens.length - 1, p + 1))}>→</button>
            <button className="btn-secondary" onClick={() => setPly(fens.length - 1)}>⏭</button>
            <button className="btn-primary ml-auto" disabled={!bad.length} onClick={() => setPly((bad.find((m) => m.ply > ply) ?? bad[0]).ply)}>
              Next mistake →
            </button>
          </div>
          {moves.length > 0 && <EvalGraph moves={moves} current={ply} onPick={setPly} />}
        </div>

        <div className="min-w-0 space-y-4">
          <section className="space-y-3 rounded-xl bg-zinc-900/80 p-4 ring-1 ring-white/5">
            {!game.analysis && <p className="text-sm text-amber-300">This game hasn't been analyzed yet — run the analysis from the Games page.</p>}
            {move ? <MoveDetail game={game} move={move} fenBefore={fens[ply - 1]} fenAfter={fens[ply]} /> : <p className="text-sm text-zinc-400">Start position. Use the arrows, the graph, or "Next mistake".</p>}
          </section>

          <section className="rounded-xl bg-zinc-900/80 p-4 ring-1 ring-white/5">
            <label className="mb-2 flex items-center gap-2 text-xs text-zinc-400">
              <input type="checkbox" className="accent-brand-500" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
              "Next mistake" only jumps to your moves
            </label>
            <div className="flex max-h-80 flex-wrap gap-x-1 gap-y-1 overflow-auto font-mono text-sm">
              {game.sans.map((san, i) => {
                const m = moves[i]
                const st = m ? CLS_STYLE[m.cls] : null
                return (
                  <button key={i} onClick={() => setPly(i + 1)} className={`rounded px-1 ${ply === i + 1 ? 'bg-brand-600 text-white' : `${st?.color ?? 'text-zinc-300'} hover:bg-zinc-800`}`}>
                    {i % 2 === 0 && <span className="text-zinc-500">{i / 2 + 1}.</span>}
                    {san}
                    {st?.mark}
                  </button>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function MoveDetail({ game, move, fenBefore, fenAfter }: { game: ImportedGame; move: MoveAnalysis; fenBefore: string; fenAfter: string }) {
  const st = CLS_STYLE[move.cls]
  const who = (move.ply % 2 === 1 ? 'w' : 'b') === game.userColor ? 'You' : 'Your opponent'
  const serious = move.cls === 'mistake' || move.cls === 'blunder' || move.cls === 'inaccuracy'
  return (
    <div className="space-y-3 text-sm">
      <p>
        <span className="font-mono text-zinc-400">
          {Math.ceil(move.ply / 2)}
          {move.ply % 2 ? '.' : '…'}
        </span>
        <b className="font-mono text-zinc-100">{move.san}</b> <span className={`font-semibold ${st.color}`}>{st.label}</span>
        <span className="ml-2 text-zinc-500">
          {formatScore(move.before)} → {formatScore(move.after)}
        </span>
      </p>
      {move.tags.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {move.tags.slice(1).map((t) => (
            <span key={t} className="rounded bg-red-500/10 px-1.5 py-0.5 text-xs text-red-300 ring-1 ring-red-400/20">
              {TAG_LABEL[t] ?? t}
            </span>
          ))}
        </div>
      )}
      {serious && (
        <>
          <p className="text-zinc-300">
            {who} played <b className="font-mono">{move.san}</b>; best was <b className="font-mono text-emerald-300">{move.bestSan}</b> <span className="text-zinc-500">({formatPv(fenBefore, move.pv, 8)})</span>
          </p>
          <WhyList explanation={explainMove(fenBefore, move.best, move.pv)} />
          {move.reply[0] && (move.cls === 'mistake' || move.cls === 'blunder') && <WhyList explanation={explainMove(fenAfter, move.reply[0], move.reply)} title={`The punishment: ${formatPv(fenAfter, move.reply, 5)}`} />}
        </>
      )}
    </div>
  )
}

/** Where this game left Outpost's book, and a one-click way to add that move to the opening. */
function BookNote({ game, onJump }: { game: ImportedGame; onJump: (ply: number) => void }) {
  const ext = useExtensionsVersion()
  const b = useMemo(() => bookOf(game), [game, ext]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!b || !(b.identified || b.depth >= 4)) return null
  const name = `${b.tree.def.name}${b.tree.def.flipped ? ' (facing it)' : ''}`
  if (b.leftBy === 'end' || !b.deviation) {
    return (
      <p className="mt-1 text-xs text-zinc-500">
        Followed {name} to the end of its book ({Math.ceil(b.depth / 2)} moves).
      </p>
    )
  }
  const inBook = b.node.children.some((c) => c.san === b.deviation!.san)
  return (
    <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs text-zinc-500">
      <span>
        In {name} until{' '}
        <button className="font-mono text-zinc-200 hover:underline" onClick={() => onJump(b.depth + 1)}>
          {plyLabel(b.node, b.deviation.san)}
        </button>
        , where {b.leftBy === 'opponent' ? 'your opponent' : 'you'} left the book.
      </span>
      {inBook ? <span className="text-emerald-400">now in the book ✓</span> : <AddLineButton tree={b.tree} node={b.node} uci={b.deviation.uci} label="+ add this line to the opening" />}
    </p>
  )
}
