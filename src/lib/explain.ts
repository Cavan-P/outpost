import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'
import { formatPv, formatScore, scoreValue, type EngineLine } from './engine'

// Plain-language reasons for a move, derived from the position itself plus the engine's line.
// Not as deep as a human coach, but it catches the concrete stuff: material, threats, forks,
// rescues, development, and what the engine's main line is driving at.

export const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }
const NAME: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }
const SQUARES = 'abcdefgh'.split('').flatMap((f) => '12345678'.split('').map((r) => (f + r) as Square))

export const pieceName = (p: PieceSymbol) => NAME[p]
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w')
const sideName = (c: Color) => (c === 'w' ? 'White' : 'Black')

export function material(chess: Chess, color: Color) {
  let sum = 0
  for (const sq of SQUARES) {
    const p = chess.get(sq)
    if (p && p.color === color && p.type !== 'k') sum += VALUE[p.type]
  }
  return sum
}

/** Pieces of `color` that are attacked and either undefended or attacked by something cheaper. */
export function enPrise(chess: Chess, color: Color): Map<Square, PieceSymbol> {
  const out = new Map<Square, PieceSymbol>()
  for (const sq of SQUARES) {
    const p = chess.get(sq)
    if (!p || p.color !== color || p.type === 'k') continue
    const attackers = chess.attackers(sq, other(color))
    if (!attackers.length) continue
    const defended = chess.attackers(sq, color).length > 0
    const cheapest = Math.min(...attackers.map((a) => VALUE[chess.get(a)!.type]))
    if (!defended || cheapest < VALUE[p.type]) out.set(sq, p.type)
  }
  return out
}

function play(chess: Chess, uci: string) {
  return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' })
}

export interface Explanation {
  san: string
  reasons: string[]
}

/** Why a move is good (or what it does), from the mover's perspective. `pv` is the engine line starting with this move. */
export function explainMove(fen: string, uci: string, pv: string[] = []): Explanation {
  const before = new Chess(fen)
  const us = before.turn()
  const them = other(us)
  const after = new Chess(fen)
  const mv = play(after, uci)
  const reasons: string[] = []
  const mover = mv.piece

  if (after.isCheckmate()) return { san: mv.san, reasons: ['Checkmate!'] }

  // Castling
  if (mv.isKingsideCastle() || mv.isQueensideCastle()) reasons.push('Castles — the king gets safe and the rooks connect.')

  // Captures
  if (mv.captured) {
    const recapturable = after.attackers(mv.to, them).length > 0
    const gain = VALUE[mv.captured] - VALUE[mover]
    if (!recapturable) reasons.push(`Wins a free ${NAME[mv.captured]} — nothing can recapture on ${mv.to}.`)
    else if (gain > 0) reasons.push(`Wins material: gives a ${NAME[mover]} for a ${NAME[mv.captured]}.`)
    else if (gain === 0) reasons.push(`Trades ${NAME[mover]} for ${NAME[mv.captured]}.`)
    else reasons.push(`Gives up the ${NAME[mover]} for a ${NAME[mv.captured]} — a sacrifice with a point.`)
  }

  if (mv.promotion) reasons.push(`Promotes to a ${NAME[mv.promotion]}.`)
  if (after.isCheck()) reasons.push('Gives check, so the opponent has no time for their own plans.')

  // New threats (including forks and discovered attacks)
  const threatsBefore = enPrise(before, them)
  const threatsAfter = enPrise(after, them)
  const fresh = [...threatsAfter].filter(([sq]) => !threatsBefore.has(sq))
  const fromMover = fresh.filter(([sq]) => after.attackers(sq, us).includes(mv.to))
  const discovered = fresh.filter(([sq]) => !after.attackers(sq, us).includes(mv.to))
  const list = (xs: [Square, PieceSymbol][]) => xs.map(([sq, p]) => `${NAME[p]} on ${sq}`).join(' and ')
  if (fromMover.length >= 2 || (fromMover.length === 1 && after.isCheck()))
    reasons.push(`Fork! The ${NAME[mover]} hits ${after.isCheck() ? 'the king and ' : ''}the ${list(fromMover)}.`)
  else if (fromMover.length === 1) reasons.push(`Threatens the ${list(fromMover)}.`)
  if (discovered.length) reasons.push(`Discovered attack: moving the ${NAME[mover]} opens a line onto the ${list(discovered)}.`)

  // Rescues
  const hangingBefore = enPrise(before, us)
  const hangingAfter = enPrise(after, us)
  const saved = [...hangingBefore].filter(([sq]) => (sq === mv.from ? !hangingAfter.has(mv.to) : !hangingAfter.has(sq)))
  if (saved.length && !mv.captured) reasons.push(`Takes care of the threatened ${saved.map(([sq, p]) => `${NAME[p]} on ${sq}`).join(' and ')}.`)
  if (hangingAfter.has(mv.to) && !after.isCheck() && !mv.captured) reasons.push(`Note: the ${NAME[mover]} on ${mv.to} can be taken — the engine judges that acceptable.`)

  // Opening principles
  const moveNo = Number(fen.split(' ')[5])
  const backRank = us === 'w' ? '1' : '8'
  if (moveNo <= 15) {
    if ((mover === 'n' || mover === 'b') && mv.from[1] === backRank) reasons.push(`Develops the ${NAME[mover]} toward the action.`)
    if (mover === 'p' && ['d4', 'e4', 'd5', 'e5', 'c4', 'c5', 'f4', 'f5'].includes(mv.to) && !mv.captured) reasons.push('Fights for the center.')
    if (mover === 'q' && moveNo <= 6 && !mv.captured && !after.isCheck()) reasons.push('Early queen move — fine here, but watch for tempo-gaining attacks on it.')
  }
  if (mover === 'r') {
    const file = mv.to[0]
    const pawns = SQUARES.filter((s) => s[0] === file && after.get(s)?.type === 'p')
    if (!pawns.length) reasons.push(`Puts the rook on the open ${file}-file.`)
    else if (!pawns.some((s) => after.get(s)?.color === us)) reasons.push(`Puts the rook on the half-open ${file}-file.`)
  }

  // What the engine line achieves materially
  const point = pvPoint(fen, pv)
  if (point) reasons.push(point)

  if (!reasons.length) reasons.push('A quiet, improving move — it keeps everything in order without allowing counterplay.')
  return { san: mv.san, reasons }
}

/** Follows the engine line until captures stop, and reports the material result if it changed. */
function pvPoint(fen: string, pv: string[]): string | null {
  if (pv.length < 2) return null
  const chess = new Chess(fen)
  const us = chess.turn()
  const start = material(chess, us) - material(chess, other(us))
  let settled = start
  let plies = 0
  let firstChange = 0
  let lastCapture = 0
  for (const u of pv.slice(0, 12)) {
    let m
    try {
      m = play(chess, u)
    } catch {
      break
    }
    plies++
    if (chess.isCheckmate()) return `The engine line ends in checkmate: ${formatPv(fen, pv.slice(0, plies))}.`
    const now = material(chess, us) - material(chess, other(us))
    if (!firstChange && now !== start) firstChange = plies
    if (m.captured || m.promotion) lastCapture = plies
    // only count positions where the capture sequence has finished
    else settled = now
  }
  // Only claim concrete tactics: material must change right away and the result must hold to the end of the line.
  // (Pawn grabs that get won back later — e.g. ...dxc4 in Queen's Gambit lines — are ignored.)
  if (!firstChange || firstChange > 4 || plies - lastCapture < 2) return null
  const diff = settled - start
  if (Math.abs(diff) < 1) return null
  const shown = formatPv(fen, pv.slice(0, Math.min(Math.max(lastCapture, 2), 8)))
  return diff > 0
    ? `The point: after ${shown}, ${sideName(us)} comes out about ${diff} point${diff > 1 ? 's' : ''} of material ahead.`
    : `It gives up about ${-diff} point${diff < -1 ? 's' : ''} of material (${shown}) — the engine judges the resulting position worth it.`
}

export interface MoveVerdict {
  label: 'Best' | 'Excellent' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder'
  loss: number // pawns lost vs the best move, from the mover's view
}

/** Classify a move by how much evaluation it gives up relative to the best line. */
export function verdict(best: Pick<EngineLine, 'cp' | 'mate'>, played: Pick<EngineLine, 'cp' | 'mate'>, mover: Color): MoveVerdict {
  const sign = mover === 'w' ? 1 : -1
  const loss = Math.max(0, sign * (scoreValue(best) - scoreValue(played)))
  const label = loss < 0.05 ? 'Best' : loss < 0.2 ? 'Excellent' : loss < 0.5 ? 'Good' : loss < 1 ? 'Inaccuracy' : loss < 2.5 ? 'Mistake' : 'Blunder'
  return { label, loss }
}

export function describeEval(line?: Pick<EngineLine, 'cp' | 'mate'>): string {
  if (!line) return ''
  if (line.mate !== undefined) return line.mate > 0 ? `White mates in ${line.mate}` : `Black mates in ${-line.mate}`
  const v = (line.cp ?? 0) / 100
  const a = Math.abs(v)
  const who = v > 0 ? 'White' : 'Black'
  if (a < 0.3) return `Equal (${formatScore(line)})`
  if (a < 0.8) return `${who} is slightly better (${formatScore(line)})`
  if (a < 2) return `${who} is clearly better (${formatScore(line)})`
  return `${who} is winning (${formatScore(line)})`
}
