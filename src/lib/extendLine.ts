import { Chess } from 'chess.js'
import { formatScore, getBatchEngine } from './engine'
import { addExtension } from './extensions'
import { reviewMove } from './review'
import { pathTo, type TreeNode } from './tree'

// "From this position I sometimes see this move": grade the move, let Stockfish play the best
// continuation for both sides, and save the result as a new line in the opening.

export interface NewLine {
  line: string // ready for the opening data format, with notes
  sans: string[] // full move list from the start
  added: number // how many new moves came from Stockfish
  verdict: string // what Stockfish thinks of the move you've seen
  mistake: boolean // it's an error worth punishing (marked "?", so it trains like a trap)
}

const clean = (s: string) => s.replace(/[{}]/g, '')

/**
 * Build the new line: the path to `node`, then `uci`, then `plies` best moves.
 * `mover` is whose move `uci` is — your own alternative, or the opponent's.
 */
export async function buildSeenLine(node: TreeNode, uci: string, plies: number, yourSide: 'w' | 'b', onProgress?: (done: number, total: number) => void): Promise<NewLine> {
  const path = pathTo(node).filter((n) => n.ply > 0)
  const c = new Chess(node.fen)
  const mover = c.turn()
  const r = await reviewMove(node.fen, uci, undefined, 14)
  const mv = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
  const mistake = r.verdict.loss >= 1
  const whose = mover === yourSide ? 'your' : "the opponent's"
  const firstNote = mistake
    ? `Added by you: ${whose} mistake (${r.verdict.label.toLowerCase()}) — ${r.bestSan} was better.${mover !== yourSide ? ' Punish it.' : ''}`
    : `Added by you: ${r.verdict.label.toLowerCase()} — Stockfish's line follows.`
  const tokens: string[] = path.map((n) => `${n.san}${n.annotation}${n.note ? `{${clean(n.note)}}` : ''}`)
  tokens.push(`${mv.san}${mistake ? '?' : ''}{${clean(firstNote)}}`)

  const engine = getBatchEngine()
  let added = 0
  let lastEval = ''
  for (let i = 0; i < plies; i++) {
    if (c.isGameOver()) break
    const a = await engine.analyze(c.fen(), { depth: 14, multipv: 1 })
    const best = a.lines[0]?.pv[0] ?? a.bestmove
    if (!best || best === '(none)') break
    const m = c.move({ from: best.slice(0, 2), to: best.slice(2, 4), promotion: best[4] })
    tokens.push(m.san)
    lastEval = formatScore(a.lines[0])
    added++
    onProgress?.(i + 1, plies)
  }
  if (added) tokens[tokens.length - 1] += `{Stockfish's line ends here (${lastEval}).}`
  // c started at `node`, so its history is the seen move plus Stockfish's line
  return { line: tokens.join(' '), sans: [...path.map((n) => n.san), ...c.history()], added, verdict: r.verdict.label, mistake }
}

/** Build and save in one go; returns the new line's move list (to jump to it). */
export async function addSeenMove(openingId: string, node: TreeNode, uci: string, plies: number, yourSide: 'w' | 'b', onProgress?: (d: number, t: number) => void) {
  const l = await buildSeenLine(node, uci, plies, yourSide, onProgress)
  addExtension(openingId, l.line)
  return l
}
