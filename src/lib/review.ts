import { Chess } from 'chess.js'
import { getCheckEngine, uciToSan, type EngineLine } from './engine'
import { explainMove, verdict, type Explanation, type MoveVerdict } from './explain'

export interface MoveReview {
  playedSan: string
  verdict: MoveVerdict
  played: EngineLine | undefined
  best: EngineLine | undefined
  bestSan: string
  bookSan?: string
  bookLine?: EngineLine
  /** what the opponent does against the played move, and why it hurts */
  refutation?: Explanation
  /** why the recommended move works */
  why?: Explanation
}

const after = (fen: string, uci: string) => {
  const c = new Chess(fen)
  c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' })
  return c.fen()
}

/** Line from the position *after* a move, re-expressed as a line starting with that move. */
function lineAfter(lines: EngineLine[], uci: string): EngineLine | undefined {
  const l = lines[0]
  return l && { ...l, pv: [uci, ...l.pv] }
}

/**
 * Judge a move with Stockfish: how much it gives up compared with the best move (and the book move),
 * what the opponent's best answer is, and why the recommended move is better.
 */
export async function reviewMove(fen: string, playedUci: string, bookUci?: string, depth = 14): Promise<MoveReview> {
  const engine = getCheckEngine()
  const mover = new Chess(fen).turn()

  const base = await engine.analyze(fen, { depth, multipv: 1 })
  const best = base.lines[0]
  const bestUci = best?.pv[0] ?? playedUci

  const playedFen = after(fen, playedUci)
  const playedGameOver = new Chess(playedFen).isGameOver()
  const playedA = playedGameOver ? null : await engine.analyze(playedFen, { depth: depth - 2, multipv: 1 })
  const played: EngineLine | undefined = playedGameOver
    ? { multipv: 1, depth: 0, cp: new Chess(playedFen).isCheckmate() ? (mover === 'w' ? 100000 : -100000) : 0, pv: [playedUci] }
    : lineAfter(playedA!.lines, playedUci)

  let bookLine: EngineLine | undefined
  if (bookUci && bookUci !== bestUci) {
    const b = await engine.analyze(after(fen, bookUci), { depth: depth - 2, multipv: 1 })
    bookLine = lineAfter(b.lines, bookUci)
  } else if (bookUci) bookLine = best

  const reference = bookLine ?? best
  const v = verdict(reference ?? { cp: 0 }, played ?? { cp: 0 }, mover)

  let refutation: Explanation | undefined
  const reply = playedA?.lines[0]
  if (reply && v.loss >= 0.5) refutation = explainMove(playedFen, reply.pv[0], reply.pv)

  const recUci = bookUci ?? bestUci
  const recPv = recUci === bestUci ? best?.pv : bookLine?.pv
  const why = recUci !== playedUci ? explainMove(fen, recUci, recPv ?? [recUci]) : undefined

  return {
    playedSan: uciToSan(fen, [playedUci])[0],
    verdict: v,
    played,
    best,
    bestSan: uciToSan(fen, [bestUci])[0] ?? '',
    bookSan: bookUci ? uciToSan(fen, [bookUci])[0] : undefined,
    bookLine,
    refutation,
    why,
  }
}
