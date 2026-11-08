import { Chess } from 'chess.js'
import { getBatchEngine, scoreValue, uciToSan } from './engine'
import { sideToMove, type OpeningTree, type TreeNode } from './tree'

export interface Gap {
  node: TreeNode // position where the opponent is to move
  uci: string
  san: string
  /** how much worse than the opponent's best move it is, in pawns (0 = the best move) */
  behind: number
}

/**
 * Holes in a repertoire: positions inside your book where the opponent has a good move
 * (one of Stockfish's top three, within ~0.6 of the best) that your lines don't answer.
 * Ends of lines are skipped — theory has to stop somewhere.
 */
export async function findGaps(tree: OpeningTree, onProgress?: (done: number, total: number) => void, shouldStop?: () => boolean): Promise<Gap[]> {
  const side = tree.def.side
  // Skip the opening's defining moves (the part every line shares): before 1.d4 d5 2.c4 e5 there's
  // no Albin yet, and "White could play 1.e4" isn't a hole in it.
  const paths = tree.leaves.map((l) => l.id.split(' '))
  let trunk = 0
  while (paths.length && paths.every((p) => p.length > trunk && p[trunk] === paths[0][trunk])) trunk++
  const nodes = [...tree.nodes.values()].filter((n) => n.children.length > 0 && sideToMove(n) !== side && n.ply >= trunk && n.ply < 24)
  const engine = getBatchEngine()
  const gaps: Gap[] = []
  for (let i = 0; i < nodes.length; i++) {
    if (shouldStop?.()) break
    const n = nodes[i]
    if (new Chess(n.fen).isGameOver()) continue
    const a = await engine.analyze(n.fen, { depth: 12, multipv: 3 })
    const sign = sideToMove(n) === 'w' ? 1 : -1
    const best = a.lines[0] ? sign * scoreValue(a.lines[0]) : 0
    const covered = new Set(n.children.map((c) => c.uci))
    for (const l of a.lines) {
      const u = l.pv[0]
      if (!u || covered.has(u) || covered.has(u.slice(0, 4))) continue
      const behind = best - sign * scoreValue(l)
      if (behind > 0.6) continue
      gaps.push({ node: n, uci: u, san: uciToSan(n.fen, [u])[0], behind })
    }
    onProgress?.(i + 1, nodes.length)
  }
  return gaps.sort((x, y) => x.node.ply - y.node.ply || x.behind - y.behind)
}
