import { useMemo, useState } from 'react'
import type { PieceSymbol } from 'chess.js'
import { runAnalysis, stopAnalysis, useRunner } from '../../lib/analysisRunner'
import { TAG_LABEL, buildReport, type Report } from '../../lib/gameAnalysis'
import { addGames, clearGames, fetchChessCom, fetchLichess, myGames, parsePgnText, useGames, userResult, type ImportedGame } from '../../lib/games'
import { GameReview } from './GameReview'
import { MistakePuzzles } from './MistakePuzzles'
import { GameOpenings } from './GameOpenings'

type Sub = { kind: 'report' } | { kind: 'game'; id: string; ply?: number } | { kind: 'puzzles'; tag?: string }

export function MyGames({ onOpenOpening, onFind }: { onOpenOpening: (id: string, flip: boolean) => void; onFind: (sans: string[]) => void }) {
  const store = useGames()
  const [sub, setSub] = useState<Sub>({ kind: 'report' })
  // only your own games feed the report and puzzles; ones imported "just to analyze" are listed but left out
  const report = useMemo(() => buildReport(myGames(store.games)), [store.games])

  if (sub.kind === 'game') {
    const g = store.games.find((x) => x.id === sub.id)
    if (g) return <GameReview game={g} initialPly={sub.ply} onBack={() => setSub({ kind: 'report' })} />
  }
  if (sub.kind === 'puzzles')
    return <MistakePuzzles puzzles={sub.tag ? report.puzzles.filter((p) => p.tags.includes(sub.tag!)) : report.puzzles} title={sub.tag ? TAG_LABEL[sub.tag] : 'All your mistakes'} onBack={() => setSub({ kind: 'report' })} onOpenGame={(id, ply) => setSub({ kind: 'game', id, ply })} />

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-[0.25em] text-brand-400">Your games</p>
        <h1 className="mt-1 text-3xl font-bold text-zinc-50">Game analysis</h1>
        <p className="mt-1 text-sm text-zinc-500">Import your games, let Stockfish go through every move, and see the patterns behind your mistakes.</p>
      </header>
      <Importer />
      <RunnerBar count={store.games.length} unanalyzed={store.games.filter((g) => !g.analysis).length} />
      <GameOpenings games={myGames(store.games)} onOpenOpening={onOpenOpening} onFind={onFind} />
      {report.analyzed > 0 ? (
        <ReportView report={report} onTrain={(tag) => setSub({ kind: 'puzzles', tag })} onOpenOpening={onOpenOpening} />
      ) : (
        store.games.length > 0 && (
          <p className="text-sm text-zinc-400">
            {myGames(store.games).length ? 'Run the analysis to see your report.' : 'These games are marked "analysis only", so there\'s no report on your play yet — import your own games for that.'}
          </p>
        )
      )}
      {store.games.length > 0 && <GameList games={store.games} onOpen={(id) => setSub({ kind: 'game', id })} />}
    </div>
  )
}

// ───────────── import ─────────────

function Importer() {
  const store = useGames()
  const [source, setSource] = useState<ImportedGame['source']>(store.source)
  const [user, setUser] = useState(store.username)
  const [count, setCount] = useState(25)
  const [pgn, setPgn] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [notMine, setNotMine] = useState(false)

  async function go() {
    setBusy(true)
    setMsg(null)
    try {
      const games = source === 'lichess' ? await fetchLichess(user.trim(), count) : source === 'chess.com' ? await fetchChessCom(user.trim(), count) : parsePgnText(pgn, user)
      if (!games.length) throw new Error(source === 'pgn' ? "Couldn't read any games from that PGN." : 'No standard games found.')
      const added = addGames(user.trim(), source, games, notMine)
      setMsg({ ok: true, text: `Imported ${games.length} game${games.length === 1 ? '' : 's'} (${added} new)${notMine ? ' to analyze only — they won\'t count towards your report or puzzles' : ''}.` })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof TypeError ? "Couldn't reach the server — check your connection." : (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3 rounded-xl bg-zinc-900/80 p-5 ring-1 ring-white/5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg p-0.5 ring-1 ring-white/10">
          {(['lichess', 'chess.com', 'pgn'] as const).map((s) => (
            <button key={s} onClick={() => setSource(s)} className={`rounded-md px-3 py-1 text-sm ${source === s ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-400 hover:text-zinc-100'}`}>
              {s === 'pgn' ? 'Paste PGN' : s === 'lichess' ? 'Lichess' : 'chess.com'}
            </button>
          ))}
        </div>
        <input className="input w-48" placeholder={source === 'pgn' ? 'Your name in the PGN (optional)' : 'Username'} value={user} onChange={(e) => setUser(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && source !== 'pgn' && go()} />
        {source !== 'pgn' && (
          <select className="input" value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                last {n} games
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-2 text-sm text-zinc-400" title="For games you didn't play: you can analyze them, but they stay out of your mistake report, puzzles and daily review">
          <input type="checkbox" checked={notMine} onChange={(e) => setNotMine(e.target.checked)} />
          Not my games — just analyze
        </label>
        <button className="btn-primary" onClick={go} disabled={busy || (source === 'pgn' ? !pgn.trim() : !user.trim())}>
          {busy ? 'Importing…' : 'Import'}
        </button>
      </div>
      {source === 'pgn' && <textarea className="input h-32 w-full font-mono text-xs" placeholder="Paste one or more PGN games…" value={pgn} onChange={(e) => setPgn(e.target.value)} />}
      {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>}
      <p className="text-xs text-zinc-500">Uses the public Lichess and chess.com APIs — no login. Games are stored only in this browser.</p>
    </section>
  )
}

function RunnerBar({ count, unanalyzed }: { count: number; unanalyzed: number }) {
  const r = useRunner()
  const [depth, setDepth] = useState(12)
  if (!count) return null
  const pct = r.running ? ((r.gamesDone + r.positions[0] / Math.max(1, r.positions[1])) / Math.max(1, r.gamesTotal)) * 100 : 0
  return (
    <section className="space-y-2 rounded-xl p-4 ring-1 ring-white/5">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-zinc-300">
          {count} games · {count - unanalyzed} analyzed
        </span>
        <label className="ml-auto flex items-center gap-2 text-zinc-400">
          Depth
          <select className="input" value={depth} onChange={(e) => setDepth(Number(e.target.value))} disabled={r.running}>
            <option value={10}>Quick (10)</option>
            <option value={12}>Standard (12)</option>
            <option value={15}>Deep (15)</option>
          </select>
        </label>
        {r.running ? (
          <button className="btn-secondary" onClick={stopAnalysis}>
            Stop
          </button>
        ) : (
          <button className="btn-primary" onClick={() => runAnalysis(depth)} disabled={!unanalyzed && depth <= 12}>
            {unanalyzed ? `Analyze ${unanalyzed} game${unanalyzed === 1 ? '' : 's'}` : 'Re-analyze deeper'}
          </button>
        )}
        <button
          className="text-xs text-zinc-500 hover:text-red-400"
          disabled={r.running}
          onClick={() => {
            if (confirm('Remove all imported games and their analysis?')) clearGames()
          }}
        >
          clear
        </button>
      </div>
      {r.running && (
        <>
          <div className="h-1 overflow-hidden rounded bg-zinc-800">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-zinc-500">
            Game {Math.min(r.gamesDone + 1, r.gamesTotal)} of {r.gamesTotal} · position {r.positions[0]}/{r.positions[1]} — keeps running if you switch pages.
          </p>
        </>
      )}
    </section>
  )
}

// ───────────── report ─────────────

const PIECES: PieceSymbol[] = ['q', 'r', 'b', 'n', 'p']
const PIECE_ICON: Record<string, string> = { q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }

function Bar({ value, max, color = 'bg-brand-500' }: { value: number; max: number; color?: string }) {
  return (
    <div className="h-1.5 flex-1 overflow-hidden rounded bg-zinc-800">
      <div className={`h-full ${color}`} style={{ width: `${(value / Math.max(1, max)) * 100}%` }} />
    </div>
  )
}

function ReportView({ report: r, onTrain, onOpenOpening }: { report: Report; onTrain: (tag?: string) => void; onOpenOpening: (id: string, flip: boolean) => void }) {
  const tile = (label: string, value: string, hint?: string) => (
    <div className="rounded-xl p-4 ring-1 ring-white/5">
      <p className="text-2xl font-semibold tabular-nums text-zinc-50">{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
      {hint && <p className="mt-1 text-[11px] text-zinc-600">{hint}</p>}
    </div>
  )
  const hungMax = Math.max(...PIECES.map((p) => r.hung[p]))
  const missed = r.tags.filter(([t]) => t.startsWith('missed'))
  const allowed = r.tags.filter(([t]) => !t.startsWith('missed') && !t.startsWith('hung'))
  const phaseNames = { opening: 'Opening (moves 1–10)', middlegame: 'Middlegame', endgame: 'Endgame' } as const
  const worstPhase = (Object.keys(r.phases) as (keyof typeof r.phases)[]).sort((a, b) => r.phases[b].errors / Math.max(1, r.phases[b].moves) - r.phases[a].errors / Math.max(1, r.phases[a].moves))[0]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tile('average accuracy', `${r.accuracy.toFixed(0)}%`, `${r.analyzed} analyzed games`)}
        {tile('blunders per game', r.perGame.blunders.toFixed(1), `${r.perGame.mistakes.toFixed(1)} mistakes, ${r.perGame.inaccuracies.toFixed(1)} inaccuracies`)}
        {tile('results', `${r.results.win}-${r.results.draw}-${r.results.loss}`, 'wins · draws · losses')}
        {tile('puzzles from your mistakes', String(r.puzzles.length))}
      </div>

      {r.tags.length > 0 && (
        <section className="rounded-xl bg-zinc-900/80 p-5 ring-1 ring-white/5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-zinc-50">Your most common mistakes</h2>
            <button className="btn-primary" onClick={() => onTrain()} disabled={!r.puzzles.length}>
              Train all {r.puzzles.length} →
            </button>
          </div>
          <ol className="mt-4 space-y-2">
            {r.tags.slice(0, 6).map(([t, n], i) => (
              <li key={t} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-zinc-500">{i + 1}.</span>
                {/* a fixed 16rem name column overflowed phones: let it shrink and wrap there */}
                <span className="min-w-0 flex-1 text-zinc-200 sm:w-64 sm:flex-none sm:shrink-0">{TAG_LABEL[t] ?? t}</span>
                <Bar value={n} max={r.tags[0][1]} color={i === 0 ? 'bg-red-500' : 'bg-brand-500'} />
                <span className="w-10 text-right tabular-nums text-zinc-400">{n}×</span>
                <button className="text-xs text-brand-400 hover:underline" onClick={() => onTrain(t)}>
                  train
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl p-5 ring-1 ring-white/5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Pieces you hang</h3>
          <ul className="mt-3 space-y-2">
            {PIECES.map((p) => (
              <li key={p} className="flex items-center gap-3 text-sm">
                <span className="w-6 text-xl text-zinc-300">{PIECE_ICON[p]}</span>
                <Bar value={r.hung[p]} max={hungMax} color="bg-red-500/80" />
                <span className="w-8 text-right tabular-nums text-zinc-400">{r.hung[p]}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl p-5 ring-1 ring-white/5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">What you miss</h3>
          <TagList tags={missed} onTrain={onTrain} empty="Nothing missed so far." />
        </section>
        <section className="rounded-xl p-5 ring-1 ring-white/5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">How you get hit</h3>
          <TagList tags={allowed} onTrain={onTrain} empty="Nothing yet." />
        </section>
      </div>

      <section className="rounded-xl p-5 ring-1 ring-white/5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Mistakes by phase</h3>
        <ul className="mt-3 space-y-2">
          {(Object.keys(r.phases) as (keyof typeof r.phases)[]).map((ph) => {
            const rate = r.phases[ph].errors / Math.max(1, r.phases[ph].moves)
            return (
              <li key={ph} className="flex items-center gap-3 text-sm">
                <span className="w-44 shrink-0 text-zinc-300">{phaseNames[ph]}</span>
                <Bar value={rate} max={0.25} color={ph === worstPhase && r.phases[ph].errors ? 'bg-red-500' : 'bg-brand-500'} />
                <span className="w-40 text-right text-xs text-zinc-400">
                  {r.phases[ph].errors} errors / {r.phases[ph].moves} moves ({(rate * 100).toFixed(1)}%)
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <div>
        <section className="rounded-xl p-5 ring-1 ring-white/5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Where you leave your theory</h3>
          {r.deviations.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {r.deviations.slice(0, 8).map((d) => (
                <li key={d.key} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-zinc-200">{d.opening}</span>
                  <span className="text-xs text-zinc-500">
                    move {Math.ceil(d.ply / 2)}: you played <b className="font-mono text-red-300">{d.played}</b>, theory is <b className="font-mono text-emerald-300">{d.expected.join(' / ')}</b>
                  </span>
                  <span className="text-xs text-zinc-500">({d.count}×)</span>
                  <button className="ml-auto text-xs text-brand-400 hover:underline" onClick={() => onOpenOpening(d.key.split('|')[0].replace('~flip', ''), d.key.includes('~flip'))}>
                    drill it
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">Either you stayed in book, or your openings aren't in the trainer yet — you can add them with "My repertoire".</p>
          )}
        </section>
      </div>
    </div>
  )
}

function TagList({ tags, onTrain, empty }: { tags: [string, number][]; onTrain: (t: string) => void; empty: string }) {
  if (!tags.length) return <p className="mt-3 text-sm text-zinc-500">{empty}</p>
  return (
    <ul className="mt-3 space-y-1.5 text-sm">
      {tags.map(([t, n]) => (
        <li key={t} className="flex items-center gap-2">
          <span className="flex-1 text-zinc-300">{TAG_LABEL[t] ?? t}</span>
          <span className="tabular-nums text-zinc-500">{n}×</span>
          <button className="text-xs text-brand-400 hover:underline" onClick={() => onTrain(t)}>
            train
          </button>
        </li>
      ))}
    </ul>
  )
}

// ───────────── list ─────────────

function GameList({ games, onOpen }: { games: ImportedGame[]; onOpen: (id: string) => void }) {
  const [shown, setShown] = useState(20)
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Games</h2>
      <div className="divide-y divide-white/5 rounded-xl ring-1 ring-white/5">
        {games.slice(0, shown).map((g) => {
          const res = g.notMine ? (g.result === '1/2-1/2' ? '½–½' : g.result) : userResult(g)
          const blunders = g.analysis?.moves.filter((m, i) => (i % 2 === 0 ? 'w' : 'b') === g.userColor && m.cls === 'blunder').length
          return (
            <button key={g.id} onClick={() => onOpen(g.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-left text-sm hover:bg-white/[0.02]">
              <span className={`w-12 font-semibold ${res === 'win' ? 'text-emerald-400' : res === 'loss' ? 'text-red-400' : 'text-zinc-400'}`}>{res}</span>
              <span className="min-w-0 flex-1 truncate text-zinc-200">
                {g.notMine ? (
                  <>
                    {g.white} – {g.black}
                    <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400 ring-1 ring-white/10">analysis only</span>
                  </>
                ) : (
                  <>
                    {g.userColor === 'w' ? '♔' : '♚'} vs {g.userColor === 'w' ? g.black : g.white}
                  </>
                )}
                <span className="ml-2 text-xs text-zinc-500">{g.opening ?? ''}</span>
              </span>
              <span className="text-xs text-zinc-500">{g.speed ?? g.source}</span>
              <span className="w-24 text-right text-xs text-zinc-400">
                {!g.analysis ? 'not analyzed' : g.notMine ? `${g.analysis.accuracy.w.toFixed(0)}% / ${g.analysis.accuracy.b.toFixed(0)}%` : `${g.analysis.accuracy[g.userColor].toFixed(0)}% · ${blunders}✗`}
              </span>
              <span className="w-20 text-right text-xs text-zinc-600">{g.date ? new Date(g.date).toLocaleDateString() : ''}</span>
            </button>
          )
        })}
      </div>
      {games.length > shown && (
        <button className="mt-2 text-sm text-zinc-400 hover:text-zinc-100" onClick={() => setShown((s) => s + 30)}>
          Show more
        </button>
      )}
    </section>
  )
}
