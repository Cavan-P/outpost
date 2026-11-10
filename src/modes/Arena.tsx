import { Chess } from 'chess.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Board, type BoardMove } from '../components/Board'
import { MedalBadge } from '../components/GameUI'
import { ResultCard } from '../components/ResultCard'
import type { OpeningDef } from '../data/openings'
import { allOpenings } from '../lib/custom'
import { getPlayEngine, scoreValue, uciToSan } from '../lib/engine'
import { games, getExplorer } from '../lib/explorer'
import { addToSet, award, best, count, useProfile } from '../lib/game'
import { getProgress, isDue, medalOf, progressOf, recordAnswer, type OpeningProgress } from '../lib/progress'
import { reviewMove } from '../lib/review'
import { bookMoves, flipOpening, getTree, isMistake, leavesUnder, moveLabel, sideToMove, userDecisionNodes, type OpeningTree, type TreeNode } from '../lib/tree'
import { DrillShell } from './training/shared'

type Mode = 'gauntlet' | 'boss' | 'blitz' | 'spar'

const MODES: { id: Mode; name: string; desc: string }[] = [
  { id: 'gauntlet', name: 'Opening Gauntlet', desc: 'Stockfish plays your repertoire against you — every book reply, traps included. Stay in book, then survive 8 moves on your own. How deep can you go?' },
  { id: 'boss', name: 'Boss fights', desc: 'Each opening has a boss that hunts your weakest lines. Three lines, three lives. Unlocks with a Bronze medal.' },
  { id: 'blitz', name: 'Blitz the book', desc: '60 seconds. Positions from everything you have studied. Play the book move — fast.' },
  { id: 'spar', name: 'Sparring', desc: 'Start from the end of one of your lines and play it out against Stockfish, with a graded review.' },
]

export function Arena({ onAnalyze }: { onAnalyze: (fen: string) => void }) {
  const [mode, setMode] = useState<Mode | null>(null)
  if (mode)
    return (
      <div className="space-y-4">
        <button className="text-xs uppercase tracking-widest text-zinc-500 hover:text-zinc-300" onClick={() => setMode(null)}>
          ← Arena
        </button>
        {mode === 'gauntlet' && <OpeningPicker title="Opening Gauntlet" allowFlip onPick={(t) => <Duel key={t.def.id} tree={t} kind="gauntlet" />} />}
        {mode === 'boss' && <BossPicker />}
        {mode === 'blitz' && <BlitzBook />}
        {mode === 'spar' && <Sparring onAnalyze={onAnalyze} />}
      </div>
    )
  return (
    <div className="max-w-4xl space-y-8">
      <header>
        <p className="text-xs uppercase tracking-[0.25em] text-brand-400">Arena</p>
        <h1 className="mt-1 text-3xl font-bold text-zinc-50">Put your prep to the test</h1>
        <p className="mt-1 text-sm text-zinc-500">Practice teaches the lines. The Arena checks whether they hold up under pressure.</p>
      </header>
      <div className="divide-y divide-white/5 border-y border-white/10">
        {MODES.map((m) => (
          <button key={m.id} onClick={() => setMode(m.id)} className="group flex w-full flex-wrap items-baseline gap-x-6 gap-y-1 py-5 text-left sm:flex-nowrap">
            <span className="w-full text-lg text-zinc-100 group-hover:text-brand-300 sm:w-48 sm:shrink-0">{m.name}</span>
            <span className="min-w-0 flex-1 text-sm text-zinc-500 group-hover:text-zinc-300">{m.desc}</span>
            <span className="text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-brand-400">→</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ───────────── shared ─────────────

/** Openings sorted so the ones you've worked on come first. */
function studiedFirst(): { def: OpeningDef; tree: OpeningTree; p: OpeningProgress; seen: number; medal: number }[] {
  return allOpenings()
    .map((def) => {
      const tree = getTree(def)
      const p = getProgress(def.id)
      const ids = userDecisionNodes(tree).map((n) => n.id)
      return { def, tree, p, seen: Object.keys(p.nodes).length + p.learned.length, medal: medalOf(ids, p) }
    })
    .sort((a, b) => b.medal - a.medal || b.seen - a.seen || a.def.name.localeCompare(b.def.name))
}

function OpeningPicker({ title, allowFlip, onPick }: { title: string; allowFlip?: boolean; onPick: (t: OpeningTree) => React.ReactNode }) {
  const list = useMemo(studiedFirst, [])
  const [id, setId] = useState(list[0]?.def.id ?? '')
  const [flip, setFlip] = useState(false)
  const [started, setStarted] = useState<OpeningTree | null>(null)
  if (started)
    return (
      <div className="space-y-3">
        <button className="text-xs text-zinc-500 hover:text-zinc-300" onClick={() => setStarted(null)}>
          ← change opening
        </button>
        {onPick(started)}
      </div>
    )
  const go = () => {
    const def = list.find((x) => x.def.id === id)!.def
    setStarted(getTree(flip ? flipOpening(def) : def))
  }
  return (
    <section className="space-y-3">
      <h2 className="text-2xl font-bold text-zinc-50">{title}</h2>
      <div className="flex flex-wrap items-center gap-2">
        <select className="input min-w-64" value={id} onChange={(e) => setId(e.target.value)}>
          {list.map((x) => (
            <option key={x.def.id} value={x.def.id}>
              {x.def.name} ({x.def.side === 'w' ? 'White' : 'Black'}){x.medal ? ` · ${['', 'Bronze', 'Silver', 'Gold', 'Diamond'][x.medal]}` : x.seen ? ' · studied' : ''}
            </option>
          ))}
        </select>
        {allowFlip && (
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <input type="checkbox" checked={flip} onChange={(e) => setFlip(e.target.checked)} /> Face it (play the other side)
          </label>
        )}
        <button className="btn-primary" onClick={go} disabled={!id}>
          Start
        </button>
      </div>
    </section>
  )
}

/** Steers toward positions you know least (new, due, often wrong). */
function weakness(n: TreeNode, side: 'w' | 'b', p: OpeningProgress): number {
  let w = 0
  const stack = [n]
  while (stack.length) {
    const x = stack.pop()!
    if (sideToMove(x) === side && bookMoves(x).length) {
      const s = p.nodes[x.id]
      w += !s ? 1.5 : isDue(s) ? 1 + (1 - progressOf(s)) + Math.min(s.wrong, 4) * 0.4 : 0.15
    }
    stack.push(...x.children)
  }
  return w
}

const pick = <T,>(xs: T[], weight: (x: T) => number) => {
  const ws = xs.map((x) => weight(x) + 0.05)
  let r = Math.random() * ws.reduce((a, b) => a + b, 0)
  for (let i = 0; i < xs.length; i++) if ((r -= ws[i]) <= 0) return xs[i]
  return xs[xs.length - 1]
}

/** Out of book: what club players actually play here (Lichess explorer), else a "human" engine. */
async function humanMove(fen: string): Promise<string | null> {
  const ex = await getExplorer(fen, 'lichess', 2500)
  if (ex && ex.total >= 30) {
    const options = ex.moves.filter((m) => games(m) / ex.total >= 0.05)
    if (options.length) return pick(options, (m) => games(m)).uci
  }
  const engine = getPlayEngine()
  engine.setOption('Skill Level', 20)
  const a = await engine.analyze(fen, { depth: 10, multipv: 3 })
  if (!a.lines.length) return a.bestmove || null
  const sign = fen.split(' ')[1] === 'w' ? 1 : -1
  const top = sign * scoreValue(a.lines[0])
  const ok = a.lines.filter((l) => top - sign * scoreValue(l) < 0.4)
  return ok[Math.floor(Math.random() * ok.length)].pv[0] ?? a.bestmove
}

const BOSS_TITLES = [
  'Ambusher', 'Archon', 'Assassin', 'Avenger', 'Baron', 'Butcher', 'Brute', 'Banshee', 'Behemoth', 'Conqueror', 'Corsair', 'Count', 'Crusher',
  'Duke', 'Demon', 'Despot', 'Dragon', 'Executioner', 'Enforcer', 'Emperor', 'Fiend', 'Fury', 'Phantom', 'Gatekeeper', 'Gladiator', 'Golem', 'Grinder',
  'Hangman', 'Hydra', 'Harbinger', 'Inquisitor', 'Imp', 'Illusionist', 'Jackal', 'Juggernaut', 'Jester', 'Kraken', 'Knight-Errant', 'Kingslayer',
  'Lich', 'Leviathan', 'Lord', 'Marauder', 'Mauler', 'Menace', 'Minotaur', 'Necromancer', 'Nemesis', 'Ogre', 'Oracle', 'Pirate', 'Predator', 'Poisoner',
  'Raider', 'Reaper', 'Revenant', 'Sorcerer', 'Strangler', 'Serpent', 'Sentinel', 'Saboteur', 'Tyrant', 'Titan', 'Trickster', 'Usurper', 'Undertaker',
  'Viper', 'Vandal', 'Vampire', 'Warden', 'Wraith', 'Warlock', 'Zealot',
]
export function bossName(def: OpeningDef) {
  const word = def.name.replace(/^(The |King's |Queen's )/, (m) => m).split(/[\s(:&-]/)[0].replace(/'s$/, '')
  const same = BOSS_TITLES.filter((t) => t[0] === word[0]?.toUpperCase())
  const pool = same.length ? same : BOSS_TITLES
  const h = [...def.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 3)
  return `The ${word} ${pool[Math.abs(h) % pool.length]}`
}

// ───────────── Gauntlet & boss duel ─────────────

const SURVIVE = 8
const BOSS_LINES = 3
const LIVES = 3

function Duel({ tree, kind, onWin }: { tree: OpeningTree; kind: 'gauntlet' | 'boss'; onWin?: () => void }) {
  const { def } = tree
  const side = def.side
  const [fen, setFen] = useState(tree.root.fen)
  const [node, setNode] = useState<TreeNode | null>(tree.root) // null = out of book
  const [last, setLast] = useState<string | null>(null)
  // two separate waits: Stockfish grading YOUR move, and Stockfish choosing ITS move. The opponent
  // has to wait for the grading, and must try again when it finishes (it's in the effect's deps).
  const [judging, setJudging] = useState(false)
  const [thinking, setThinking] = useState(false)
  const busy = judging || thinking
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad' | 'info'; text: string } | null>(null)
  const [stats, setStatsState] = useState({ book: 0, survived: 0, free: 0 })
  // a ref too: finish() can run in the same tick as an update
  const statsRef = useRef(stats)
  const setStats = (f: (s: typeof stats) => typeof stats) => {
    statsRef.current = f(statsRef.current)
    setStatsState(statsRef.current)
  }
  const [lives, setLives] = useState(LIVES)
  const [lines, setLines] = useState(0)
  const [over, setOver] = useState<{ win: boolean; text: string } | null>(null)
  const alive = useRef(true)
  // set on (re)mount too: React's dev mode mounts, unmounts and remounts once, which would otherwise
  // leave this false and make every "still mounted?" check bail out
  useEffect(() => {
    alive.current = true
    return () => void (alive.current = false)
  }, [])
  const turn = new Chess(fen).turn()

  // opponent moves
  useEffect(() => {
    if (over || turn === side || judging) return
    let cancel = false
    const t = setTimeout(async () => {
      if (node && node.children.length) {
        const p = getProgress(def.id)
        // gauntlet: any book reply (traps included); boss: the reply that hits your weakest spot
        // gauntlet: book replies weighted by how often people really play them (when the explorer is available)
        const ex = kind === 'gauntlet' ? await getExplorer(node.fen, 'lichess', 2500) : null
        const popularity = (c: TreeNode) => {
          const m = ex?.moves.find((x) => x.uci === c.uci)
          return m ? games(m) / Math.max(1, ex!.total) + 0.02 : ex ? 0.02 : 1
        }
        const reply = kind === 'boss' ? pick(node.children.filter((c) => !isMistake(c)).length ? node.children.filter((c) => !isMistake(c)) : node.children, (c) => weakness(c, side, p) ** 2) : pick(node.children, popularity)
        if (cancel) return
        setFen(reply.fen)
        setLast(reply.uci)
        setNode(reply)
        if (kind === 'boss' && !bookMoves(reply).length) lineDone()
        return
      }
      if (kind === 'boss') return
      setThinking(true)
      let u: string | null = null
      try {
        u = await humanMove(fen)
      } catch {
        // the explorer or the multi-line search failed: just take Stockfish's move
        u = (await getPlayEngine().analyze(fen, { depth: 8 }).catch(() => null))?.bestmove ?? null
      }
      if (!alive.current) return
      setThinking(false)
      if (cancel) return
      if (!u) return finish(true, 'Stockfish has no moves left — you outlasted it!')
      const c = new Chess(fen)
      c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
      setFen(c.fen())
      setLast(u)
      setNode(null)
      if (c.isGameOver()) finish(!c.isCheckmate() || c.turn() !== side, c.isCheckmate() ? 'Checkmated.' : 'The game ended.')
    }, 450)
    return () => {
      cancel = true
      clearTimeout(t)
    }
  }, [fen, turn, over, judging]) // eslint-disable-line react-hooks/exhaustive-deps

  // boss: when the line ends on your move (no opponent reply), count it
  useEffect(() => {
    if (kind === 'boss' && node && !over && turn === side && !node.children.length && node !== tree.root) lineDone()
  }, [node]) // eslint-disable-line react-hooks/exhaustive-deps

  function lineDone() {
    const n = lines + 1
    setLines(n)
    if (n >= BOSS_LINES) return finish(true, `${bossName(def)} is defeated!`)
    setMsg({ tone: 'good', text: `Line ${n}/${BOSS_LINES} survived. The boss regroups…` })
    setTimeout(() => {
      if (!alive.current) return
      setFen(tree.root.fen)
      setNode(tree.root)
      setLast(null)
    }, 900)
  }

  function restart() {
    setFen(tree.root.fen)
    setNode(tree.root)
    setLast(null)
    setMsg(null)
    setStats(() => ({ book: 0, survived: 0, free: 0 }))
    setLives(LIVES)
    setLines(0)
    setOver(null)
    setJudging(false)
    setThinking(false)
  }

  function finish(win: boolean, text: string) {
    setOver({ win, text })
    if (kind === 'gauntlet') {
      const st = statsRef.current
      const score = st.book + st.survived * 2 + (win ? 5 : 0)
      const isBest = best(`gauntlet:${def.id}`, score)
      count('gauntlets')
      award(score * 2 + (isBest && score ? 20 : 0), isBest && score ? 'New Gauntlet best!' : `Gauntlet: ${score}`, 'gauntlet')
    } else if (win) {
      count('bossWins')
      const first = addToSet('bosses', def.id)
      award(first ? 200 : 30, first ? `${bossName(def)} defeated!` : 'Boss defeated again', `boss:${def.id}`)
      onWin?.()
    }
  }

  function onMove(m: BoardMove): boolean {
    const uci = m.from + m.to + (m.promotion ?? '')
    const before = fen
    const c = new Chess(fen)
    const mv = c.move({ from: m.from, to: m.to, promotion: m.promotion })
    if (node && bookMoves(node).length) {
      const hit = bookMoves(node).find((b) => b.uci === uci || b.uci === m.from + m.to)
      recordAnswer(def.id, node.id, hit ? 'correct' : 'wrong')
      if (hit) {
        setStats((s) => ({ ...s, book: s.book + 1 }))
        setFen(hit.fen)
        setLast(hit.uci)
        setNode(hit)
        setMsg(null)
        if (kind === 'boss' && !hit.children.length) lineDone()
        return true
      }
      const book = bookMoves(node).map(moveLabel).join(' / ')
      if (kind === 'boss') {
        const l = lives - 1
        setLives(l)
        if (l <= 0) {
          finish(false, `Out of lives. The book move was ${book}.`)
          return false
        }
        // show the right move and carry on from it
        const right = bookMoves(node)[0]
        setMsg({ tone: 'bad', text: `${mv.san}? The boss hits back — the book move is ${book}. ${l} ${l === 1 ? 'life' : 'lives'} left.` })
        setFen(right.fen)
        setLast(right.uci)
        setNode(right)
        if (!right.children.length) lineDone()
        return false
      }
      finish(false, `You left your preparation with ${mv.san}. The book move was ${book}.`)
      return false
    }
    if (kind === 'boss') return false
    // out of book: Stockfish judges every move
    setFen(c.fen())
    setLast(uci)
    setNode(null)
    void judge(before, uci, c)
    return true
  }

  async function judge(before: string, uci: string, c: Chess) {
    setJudging(true)
    let r: Awaited<ReturnType<typeof reviewMove>>
    try {
      r = await reviewMove(before, uci, undefined, 12)
    } catch {
      // grading failed: don't hold the game hostage — count it as a fine move and play on
      if (alive.current) setJudging(false)
      setStats((s) => ({ ...s, free: s.free + 1 }))
      return
    }
    if (!alive.current) return
    setJudging(false)
    const free = statsRef.current.free + 1
    const survived = statsRef.current.survived
    if (r.verdict.loss >= 1) return finish(false, `${r.playedSan} was a ${r.verdict.label.toLowerCase()} — ${r.bestSan} was the move. You survived ${survived} move${survived === 1 ? '' : 's'} out of book.`)
    const good = r.verdict.loss < 0.5
    setStats((s) => ({ ...s, free, survived: s.survived + (good ? 1 : 0) }))
    setMsg({ tone: good ? 'good' : 'info', text: `${r.playedSan}: ${r.verdict.label}${good ? '' : ` — ${r.bestSan} was better`}` })
    if (c.isCheckmate()) return finish(true, 'Checkmate! 🎉')
    if (free >= SURVIVE) return finish(true, `You made it ${SURVIVE} moves past your book.`)
  }

  const inBook = !!node
  const score = stats.book + stats.survived * 2
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,560px)_1fr]">
      <Board
        fen={fen}
        orientation={side === 'w' ? 'white' : 'black'}
        player={side}
        interactive={!over} // stays live on the opponent's turn so you can premove
        onMove={onMove}
        lastMove={last ? { from: last.slice(0, 2), to: last.slice(2, 4) } : null}
        result={over ? <ResultCard tone={over.win ? 'success' : 'fail'} title={over.win ? 'Victory' : 'Defeated'} subtitle={<p>{over.text}{kind === 'gauntlet' && ` Score ${score + (over.win ? 5 : 0)}.`}</p>} onPrimary={restart} primaryLabel="Try again" /> : undefined}
      />
      <section className="h-fit space-y-3 rounded-xl bg-zinc-900/80 p-4 text-sm ring-1 ring-white/5">
        <h2 className="text-xl text-zinc-50">{kind === 'boss' ? bossName(def) : def.name}</h2>
        {kind === 'gauntlet' ? (
          <>
            <p className="text-zinc-400">{inBook ? 'In book — play your preparation.' : `Out of book: ${stats.free}/${SURVIVE} moves. Don't blunder.`}</p>
            <div className="flex gap-4 tabular-nums">
              <span>book moves <b className="text-zinc-100">{stats.book}</b></span>
              <span>good moves after <b className="text-zinc-100">{stats.survived}</b></span>
              <span>score <b className="text-amber-300">{score}</b></span>
            </div>
          </>
        ) : (
          <>
            <p className="text-zinc-400">The boss steers into the lines you know worst. Survive {BOSS_LINES} lines.</p>
            <div className="flex items-center gap-4">
              <span className="text-lg text-red-400">{'♥'.repeat(lives)}<span className="text-zinc-700">{'♥'.repeat(LIVES - lives)}</span></span>
              <span className="text-zinc-400">
                lines <b className="text-zinc-100">{lines}/{BOSS_LINES}</b>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-zinc-800">
              <div className="h-full bg-red-500 transition-all" style={{ width: `${(1 - lines / BOSS_LINES) * 100}%` }} />
            </div>
          </>
        )}
        {busy && <p className="text-zinc-500">Stockfish is thinking…</p>}
        {msg && <p className={msg.tone === 'good' ? 'text-emerald-400' : msg.tone === 'bad' ? 'text-red-400' : 'text-amber-300'}>{msg.text}</p>}
      </section>
    </div>
  )
}

function BossPicker() {
  const profile = useProfile()
  const beaten = new Set(profile.sets.bosses ?? [])
  const list = useMemo(studiedFirst, [])
  const [fight, setFight] = useState<OpeningTree | null>(null)
  if (fight)
    return (
      <div className="space-y-3">
        <button className="text-xs text-zinc-500 hover:text-zinc-300" onClick={() => setFight(null)}>
          ← all bosses
        </button>
        <Duel tree={fight} kind="boss" />
      </div>
    )
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-zinc-50">Boss fights</h2>
        <p className="text-sm text-zinc-500">
          {beaten.size} defeated. Earn a Bronze medal in an opening to unlock its boss.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map(({ def, tree, medal }) => {
          const locked = medal < 1
          return (
            <button
              key={def.id}
              disabled={locked}
              onClick={() => setFight(tree)}
              className={`rounded-xl p-4 text-left ring-1 transition ${locked ? 'opacity-40 ring-white/5' : beaten.has(def.id) ? 'ring-emerald-500/30 hover:ring-emerald-400/60' : 'ring-red-500/30 hover:ring-red-400/60'}`}
            >
              <p className="text-lg text-zinc-100">{locked ? '🔒 ' : beaten.has(def.id) ? '☠ ' : '⚔ '}{bossName(def)}</p>
              <p className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                {def.name} <MedalBadge tier={medal} />
              </p>
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ───────────── Blitz the book ─────────────

interface BlitzPos {
  def: OpeningDef
  node: TreeNode
}

function blitzPool(): BlitzPos[] {
  const out: BlitzPos[] = []
  const all: BlitzPos[] = []
  for (const def of allOpenings()) {
    const tree = getTree(def)
    const p = getProgress(def.id)
    for (const node of userDecisionNodes(tree)) {
      all.push({ def, node })
      if (p.nodes[node.id]) out.push({ def, node })
    }
  }
  return out.length >= 10 ? out : all.filter((x) => x.node.ply <= 8)
}

function BlitzBook() {
  const pool = useMemo(blitzPool, [])
  return (
    <DrillShell id="blitz" title="Blitz the book" blurb="Play the book move in each position. Wrong answers cost nothing but time." seconds={60} xpPerPoint={2}>
      {(api) => <BlitzRound pool={pool} api={api} />}
    </DrillShell>
  )
}

function BlitzRound({ pool, api }: { pool: BlitzPos[]; api: { running: boolean; hit: () => void; miss: () => void } }) {
  const [cur, setCur] = useState(() => pool[Math.floor(Math.random() * pool.length)])
  const [flash, setFlash] = useState<{ square: string; color: 'good' | 'bad' } | null>(null)
  const next = () => setCur(pool[Math.floor(Math.random() * pool.length)])
  if (!api.running) return <p className="text-sm text-zinc-500">{pool.length} positions in the pool — the more you study, the bigger it gets.</p>
  const { def, node } = cur
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,520px)_1fr]">
      <Board
        fen={node.fen}
        orientation={def.side === 'w' ? 'white' : 'black'}
        lastMove={node.uci ? { from: node.uci.slice(0, 2), to: node.uci.slice(2, 4) } : null}
        flash={flash}
        onMove={(m) => {
          const ok = bookMoves(node).some((b) => b.uci === m.from + m.to + (m.promotion ?? '') || b.uci === m.from + m.to)
          if (ok) api.hit()
          else api.miss()
          setFlash({ square: m.to, color: ok ? 'good' : 'bad' })
          setTimeout(() => setFlash(null), 250)
          next()
          return false
        }}
      />
      <div className="space-y-2 text-sm">
        <p className="text-lg text-zinc-100">{def.name}</p>
        <p className="text-zinc-500">{def.side === 'w' ? 'White' : 'Black'} to move · after {node.ply ? moveLabel(node) : 'the start'}</p>
      </div>
    </div>
  )
}

// ───────────── Sparring ─────────────

function Sparring({ onAnalyze }: { onAnalyze: (fen: string) => void }) {
  const [seed, setSeed] = useState(0)
  const spots = useMemo(() => {
    const studied = studiedFirst().filter((x) => x.seen > 0)
    const src = studied.length ? studied : studiedFirst().slice(0, 8)
    const leaves = src.flatMap((x) => leavesUnder(x.tree.root).map((leaf) => ({ def: x.def, leaf })))
    return leaves.sort(() => Math.random() - 0.5).slice(0, 6)
  }, [seed]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="space-y-4">
      <div className="flex items-end gap-3">
        <div>
          <h2 className="text-2xl font-bold text-zinc-50">Sparring</h2>
          <p className="text-sm text-zinc-500">The book ends here — now play the middlegame. You get {10} moves against Stockfish and a graded review.</p>
        </div>
        <button className="btn-secondary ml-auto" onClick={() => setSeed((s) => s + 1)}>
          Shuffle
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {spots.map(({ def, leaf }) => (
          <button key={def.id + leaf.id} onClick={() => onAnalyze(leaf.fen)} className="rounded-xl p-4 text-left ring-1 ring-white/5 transition hover:ring-brand-500/40">
            <p className="text-zinc-100">{def.name}</p>
            <p className="mt-1 line-clamp-2 font-mono text-[11px] text-zinc-500">{uciToSanPath(leaf)}</p>
            <p className="mt-2 text-xs text-brand-400">Spar from here →</p>
          </button>
        ))}
      </div>
    </section>
  )
}

function uciToSanPath(n: TreeNode) {
  const out: string[] = []
  for (let x: TreeNode | null = n; x && x.ply > 0; x = x.parent) out.unshift(`${x.ply % 2 ? `${Math.ceil(x.ply / 2)}.` : ''}${x.san}`)
  return out.slice(-8).join(' ')
}
void uciToSan
