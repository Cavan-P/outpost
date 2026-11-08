import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'
import { allOpenings } from './custom'
import { getBatchEngine, scoreValue, uciToSan, winProb } from './engine'
import { VALUE, enPrise, explainMove, material, pieceName } from './explain'
import type { GameAnalysis, ImportedGame, MoveAnalysis, Score } from './games'
import { bookMoves, flipOpening, getTree, type TreeNode } from './tree'

// Full-game analysis with Stockfish, plus pattern-mining across many games:
// what you hang, what you miss, how you get hit, and where you leave your repertoire.

export const fensOf = (sans: string[], startFen?: string) => {
  const c = new Chess(startFen)
  const out = [c.fen()]
  for (const s of sans) {
    try {
      c.move(s)
    } catch {
      break
    }
    out.push(c.fen())
  }
  return out
}

const other = (c: Color): Color => (c === 'w' ? 'b' : 'w')
/** Winning chances for `side`, 0..1. */
const wp = (s: Score, side: Color) => (side === 'w' ? winProb(s) : 1 - winProb(s))
const play = (c: Chess, uci: string) => c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' })

function phaseOf(fen: string, ply: number): 'opening' | 'middlegame' | 'endgame' {
  if (ply <= 20) return 'opening'
  const c = new Chess(fen)
  let heavy = 0
  for (const row of c.board()) for (const p of row) if (p && p.type !== 'p' && p.type !== 'k') heavy += VALUE[p.type]
  return heavy <= 26 ? 'endgame' : 'middlegame'
}

/** Material the side to move comes out ahead after the line settles (no capture on the last move). */
function settledGain(fen: string, pv: string[]): number {
  const c = new Chess(fen)
  const me = c.turn()
  const start = material(c, me) - material(c, other(me))
  let settled = start
  for (const u of pv.slice(0, 8)) {
    let m
    try {
      m = play(c, u)
    } catch {
      break
    }
    if (!m.captured && !m.promotion) settled = material(c, me) - material(c, other(me))
  }
  return settled - start
}

function tagMistake(fenBefore: string, fenAfter: string, m: Omit<MoveAnalysis, 'tags' | 'cls'>, mover: Color): string[] {
  const tags: string[] = []
  // ── what it allowed (the opponent's best reply) ──
  const after = new Chess(fenAfter)
  if (m.after.mate !== undefined && (mover === 'w' ? m.after.mate < 0 : m.after.mate > 0)) {
    tags.push('allowed-mate')
    // back-rank: the mating move lands a rook/queen on the mover's first rank
    const line = new Chess(fenAfter)
    let last
    for (const u of m.reply.slice(0, 7)) {
      try {
        last = play(line, u)
      } catch {
        break
      }
    }
    if (last && line.isCheckmate() && (last.piece === 'r' || last.piece === 'q') && last.to[1] === (mover === 'w' ? '1' : '8')) tags.push('back-rank')
  }
  const reply = m.reply[0]
  if (reply) {
    const target = after.get(reply.slice(2, 4) as Square)
    const hanging = enPrise(after, mover)
    if (target && target.color === mover && hanging.has(reply.slice(2, 4) as Square) && settledGain(fenAfter, m.reply) >= 1) tags.push(`hung-${target.type}`)
    else {
      const why = explainMove(fenAfter, reply, m.reply).reasons.join(' ')
      if (why.includes('Fork')) tags.push('allowed-fork')
      else if (why.includes('Discovered')) tags.push('allowed-discovered')
      else if (settledGain(fenAfter, m.reply) >= 2) tags.push('lost-material')
    }
  }
  // ── what it missed (our best move) ──
  if (m.before.mate !== undefined && (mover === 'w' ? m.before.mate > 0 : m.before.mate < 0)) tags.push('missed-mate')
  else if (m.best && m.best !== m.uci) {
    const why = explainMove(fenBefore, m.best, m.pv).reasons.join(' ')
    if (why.includes('Fork')) tags.push('missed-fork')
    else if (why.includes('Wins a free')) tags.push('missed-free-piece')
    else if (why.includes('Discovered')) tags.push('missed-discovered')
    else if (settledGain(fenBefore, m.pv) >= 2) tags.push('missed-win-material')
  }
  return tags
}

function terminalScore(fen: string): Score | null {
  const c = new Chess(fen)
  if (c.isCheckmate()) return { cp: c.turn() === 'w' ? -100000 : 100000 }
  if (c.isGameOver()) return { cp: 0 }
  return null
}

/** Mistake tags that mean the move let the opponent win material or start a mating attack. */
const TACTICAL = (t: string) => t.startsWith('hung-') || t === 'allowed-fork' || t === 'allowed-discovered' || t === 'lost-material' || t === 'allowed-mate'

/**
 * Label one move and explain what went wrong. Any move that loses ground (inaccuracy or worse)
 * gets checked for a concrete tactic it allowed — a fork, a hung piece, a mating attack — and if
 * there is one, it's at least a mistake: Stockfish may only score a hung knight at −1.2 when the
 * position offers some compensation, but "you walked into a fork" is what a player wants flagged.
 */
export function labelMove(fenBefore: string, fenAfter: string, m: Omit<MoveAnalysis, 'tags' | 'cls'>, mover: Color): { cls: MoveAnalysis['cls']; tags: string[] } {
  let cls = classifyMove(m.before, m.after, mover, m.uci === m.best)
  if (cls === 'best') return { cls, tags: [] }
  if (cls === 'good') {
    // Eval swings say little once a game is decided (−8 → −9.5 barely changes the winning chances),
    // so a "good" move still gets checked for a concrete tactic: if the opponent's best reply is a
    // fork / hung piece / mating attack that really nets material, it's a mistake.
    const tags = tagMistake(fenBefore, fenAfter, m, mover)
    const nets = m.after.mate !== undefined || settledGain(fenAfter, m.reply) >= 2
    return tags.some(TACTICAL) && nets ? { cls: 'mistake', tags } : { cls, tags: [] }
  }
  const tags = tagMistake(fenBefore, fenAfter, m, mover)
  if (cls === 'inaccuracy' && tags.some(TACTICAL)) cls = 'mistake'
  return { cls, tags: cls === 'inaccuracy' ? [] : tags }
}

/** Bump when the labeling rules change; stored analyzes get relabelled by `relabel()`. */
export const ANALYSIS_VERSION = 4

/** Re-apply the current labeling rules to a stored analysis — no engine needed, the evals are saved. */
export function relabel(game: ImportedGame): GameAnalysis | null {
  const a = game.analysis
  if (!a || a.version === ANALYSIS_VERSION) return null
  const fens = fensOf(game.sans, game.startFen)
  const moves = a.moves.map((m, i) => {
    const mover: Color = new Chess(fens[i]).turn()
    const { cls, tags } = labelMove(fens[i], fens[i + 1], m, mover)
    return { ...m, cls, tags: [m.tags[0], ...tags] }
  })
  return { ...a, version: ANALYSIS_VERSION, moves }
}

const SEVERITY: MoveAnalysis['cls'][] = ['best', 'good', 'inaccuracy', 'mistake', 'blunder']

/**
 * How a move is labeled, from the evaluation before and after it (both from White's point of view).
 * Two yardsticks, and the worse verdict wins:
 *  - winning chances (lichess-style): catches throwing away a win or a draw, and missed mates;
 *  - pawns of evaluation lost: catches tactical errors in positions that are already lopsided,
 *    where winning chances barely move (e.g. hanging a knight at −5.6). Only applied while the
 *    game isn't completely decided, so "mate in 5 instead of mate in 3" isn't called a mistake.
 */
export function classifyMove(before: Score, after: Score, mover: Color, isBest: boolean): MoveAnalysis['cls'] {
  if (isBest) return 'best'
  const loss = Math.max(0, wp(before, mover) - wp(after, mover))
  const byChances = SEVERITY.indexOf(loss < 0.01 ? 'best' : loss < 0.05 ? 'good' : loss < 0.1 ? 'inaccuracy' : loss < 0.15 ? 'mistake' : 'blunder')
  const sign = mover === 'w' ? 1 : -1
  const b = scoreValue(before)
  const a = scoreValue(after)
  const pawns = Math.max(0, sign * (b - a))
  const undecided = Math.min(Math.abs(b), Math.abs(a)) <= 8
  const byPawns = !undecided ? 0 : SEVERITY.indexOf(pawns < 0.8 ? 'best' : pawns < 1.5 ? 'inaccuracy' : pawns < 3 ? 'mistake' : 'blunder')
  return SEVERITY[Math.max(byChances, byPawns)]
}

/** Analyze every move of a game. `onProgress(done, total)` is called as positions are evaluated. */
export async function analyzeGame(game: ImportedGame, depth: number, onProgress?: (done: number, total: number) => void, shouldStop?: () => boolean): Promise<GameAnalysis | null> {
  const fens = fensOf(game.sans, game.startFen)
  const engine = getBatchEngine()
  const evals: { score: Score; pv: string[] }[] = []
  for (let i = 0; i < fens.length; i++) {
    if (shouldStop?.()) return null
    const t = terminalScore(fens[i])
    if (t) evals.push({ score: t, pv: [] })
    else {
      const a = await engine.analyze(fens[i], { depth, multipv: 1 })
      const l = a.lines[0]
      evals.push({ score: l ? { cp: l.cp, mate: l.mate } : { cp: 0 }, pv: l?.pv ?? [] })
    }
    onProgress?.(i + 1, fens.length)
  }

  const moves: MoveAnalysis[] = []
  const acc: Record<Color, number[]> = { w: [], b: [] }
  for (let i = 0; i < fens.length - 1; i++) {
    const mover = new Chess(fens[i]).turn()
    const c = new Chess(fens[i])
    const mv = c.move(game.sans[i])
    const uci = mv.from + mv.to + (mv.promotion ?? '')
    const before = evals[i].score
    const afterScore = evals[i + 1].score
    const best = evals[i].pv[0] ?? uci
    const loss = Math.max(0, wp(before, mover) - wp(afterScore, mover))
    const base = {
      ply: i + 1,
      san: mv.san,
      uci,
      before,
      after: afterScore,
      best,
      bestSan: uciToSan(fens[i], [best])[0] ?? '',
      pv: evals[i].pv.slice(0, 10),
      reply: evals[i + 1].pv.slice(0, 10),
      loss,
    }
    const label = labelMove(fens[i], fens[i + 1], base, mover)
    moves.push({ ...base, cls: label.cls, tags: [phaseOf(fens[i], i + 1), ...label.tags] })
    // lichess-style per-move accuracy from the drop in winning chances
    acc[mover].push(Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss * 100) - 3.1669)))
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  return { version: ANALYSIS_VERSION, depth, moves, accuracy: { w: avg(acc.w), b: avg(acc.b) } }
}

// ───────────── repertoire check ─────────────

export interface Deviation {
  opening: string
  openingId: string
  flipped: boolean
  ply: number
  played: string
  expected: string[]
}

// trees are cached by getTree, so rebuilding this list per call is cheap and picks up custom repertoires
const repertoireTrees = () => ({
  w: allOpenings().map((d) => (d.side === 'w' ? getTree(d) : getTree(flipOpening(d)))),
  b: allOpenings().map((d) => (d.side === 'b' ? getTree(d) : getTree(flipOpening(d)))),
})

/** Where did you (not your opponent) leave the theory you've studied? Uses the deepest-matching repertoire. */
export function repertoireDeviation(game: ImportedGame): Deviation | null {
  let bestDepth = 0
  let found: Deviation | null = null
  for (const tree of repertoireTrees()[game.userColor]) {
    let node: TreeNode = tree.root
    let i = 0
    for (; i < game.sans.length; i++) {
      const next = node.children.find((c) => c.san === game.sans[i])
      if (!next) break
      node = next
    }
    if (i < 4 || i <= bestDepth) continue
    bestDepth = i
    const userToMove = (i % 2 === 0 ? 'w' : 'b') === game.userColor
    const book = bookMoves(node)
    found =
      userToMove && book.length && i < game.sans.length
        ? { opening: tree.def.name, openingId: tree.def.id, flipped: !!tree.def.flipped, ply: i + 1, played: game.sans[i], expected: book.map((c) => c.san) }
        : null
  }
  return found
}

// ───────────── aggregate report ─────────────

export const TAG_LABEL: Record<string, string> = {
  'hung-q': 'Hung your queen',
  'hung-r': 'Hung a rook',
  'hung-b': 'Hung a bishop',
  'hung-n': 'Hung a knight',
  'hung-p': 'Hung a pawn',
  'allowed-mate': 'Allowed a mating attack',
  'back-rank': 'Back-rank weakness',
  'allowed-fork': 'Walked into a fork',
  'allowed-discovered': 'Walked into a discovered attack',
  'lost-material': 'Allowed a tactic that wins material',
  'missed-mate': 'Missed a mate',
  'missed-fork': 'Missed a fork',
  'missed-free-piece': 'Missed a free piece',
  'missed-discovered': 'Missed a discovered attack',
  'missed-win-material': 'Missed a material-winning tactic',
}

export interface MistakePuzzle {
  id: string
  gameId: string
  fen: string
  /** the opponent's move that led to this position, for highlighting */
  lastUci?: string
  best: string
  pv: string[]
  played: string
  tags: string[]
  ply: number
}

export interface Report {
  games: number
  analyzed: number
  results: { win: number; draw: number; loss: number }
  accuracy: number
  perGame: { blunders: number; mistakes: number; inaccuracies: number }
  phases: Record<'opening' | 'middlegame' | 'endgame', { moves: number; errors: number }>
  hung: Record<PieceSymbol, number>
  tags: [string, number][]
  openings: { name: string; side: 'w' | 'b'; games: number; score: number; accuracy: number }[]
  deviations: { key: string; opening: string; played: string; expected: string[]; count: number; ply: number }[]
  puzzles: MistakePuzzle[]
}

export function buildReport(games: ImportedGame[]): Report {
  const analyzed = games.filter((g) => g.analysis)
  const results = { win: 0, draw: 0, loss: 0 }
  const phases = { opening: { moves: 0, errors: 0 }, middlegame: { moves: 0, errors: 0 }, endgame: { moves: 0, errors: 0 } }
  const hung: Record<PieceSymbol, number> = { q: 0, r: 0, b: 0, n: 0, p: 0, k: 0 }
  const tagCount = new Map<string, number>()
  const openings = new Map<string, { name: string; side: 'w' | 'b'; games: number; points: number; acc: number[] }>()
  const devs = new Map<string, Report['deviations'][number]>()
  const puzzles: MistakePuzzle[] = []
  let blunders = 0
  let mistakes = 0
  let inaccuracies = 0
  const accs: number[] = []

  for (const g of games) {
    const r = g.result === '*' ? null : g.result === '1/2-1/2' ? 'draw' : (g.result === '1-0') === (g.userColor === 'w') ? 'win' : 'loss'
    if (r) results[r]++
    const name = (g.opening ?? 'Unknown').split(':')[0].trim()
    const key = `${name}|${g.userColor}`
    const o = openings.get(key) ?? { name, side: g.userColor, games: 0, points: 0, acc: [] }
    o.games++
    o.points += r === 'win' ? 1 : r === 'draw' ? 0.5 : 0
    if (g.analysis) o.acc.push(g.analysis.accuracy[g.userColor])
    openings.set(key, o)

    const d = repertoireDeviation(g)
    if (d) {
      const k = `${d.openingId}|${d.ply}|${d.played}`
      const e = devs.get(k) ?? { key: k, opening: d.opening, played: d.played, expected: d.expected, count: 0, ply: d.ply }
      e.count++
      devs.set(k, e)
    }

    if (!g.analysis) continue
    accs.push(g.analysis.accuracy[g.userColor])
    const fens = fensOf(g.sans)
    for (const m of g.analysis.moves) {
      const mover = m.ply % 2 === 1 ? 'w' : 'b'
      if (mover !== g.userColor) continue
      const phase = m.tags[0] as keyof typeof phases
      phases[phase].moves++
      if (m.cls === 'blunder') blunders++
      else if (m.cls === 'mistake') mistakes++
      else if (m.cls === 'inaccuracy') inaccuracies++
      if (m.cls !== 'mistake' && m.cls !== 'blunder') continue
      phases[phase].errors++
      for (const t of m.tags.slice(1)) {
        tagCount.set(t, (tagCount.get(t) ?? 0) + 1)
        if (t.startsWith('hung-')) hung[t.slice(5) as PieceSymbol]++
      }
      // a mistake is a good puzzle when the best move was clearly better and you weren't already lost
      if (wp(m.before, mover) >= 0.35 && m.best !== m.uci && m.pv.length) puzzles.push({ id: `${g.id}:${m.ply}`, gameId: g.id, fen: fens[m.ply - 1], lastUci: g.analysis.moves[m.ply - 2]?.uci, best: m.best, pv: m.pv, played: m.san, tags: m.tags.slice(1), ply: m.ply })
    }
  }

  const n = Math.max(1, analyzed.length)
  return {
    games: games.length,
    analyzed: analyzed.length,
    results,
    accuracy: accs.length ? accs.reduce((a, b) => a + b, 0) / accs.length : 0,
    perGame: { blunders: blunders / n, mistakes: mistakes / n, inaccuracies: inaccuracies / n },
    phases,
    hung,
    tags: [...tagCount].sort((a, b) => b[1] - a[1]),
    openings: [...openings.values()]
      .map((o) => ({ name: o.name, side: o.side, games: o.games, score: o.points / o.games, accuracy: o.acc.length ? o.acc.reduce((a, b) => a + b, 0) / o.acc.length : NaN }))
      .sort((a, b) => b.games - a.games),
    deviations: [...devs.values()].sort((a, b) => b.count - a.count),
    puzzles,
  }
}

export const pieceLabel = (p: PieceSymbol) => pieceName(p)
