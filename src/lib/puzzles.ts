import { OPENINGS } from '../data/openings'
import { getTree, isMistake, moveLabel, sideToMove, type TreeNode } from './tree'

// Trap puzzles are generated from the opening data: every move annotated ? or ?? that the book
// goes on to punish becomes "find the punishment" from the position right after the blunder.

export interface Puzzle {
  id: string
  openingId: string
  opening: string
  blunder: string // e.g. "6.Bc3??"
  fen: string
  /** the blunder itself, for highlighting */
  lastUci: string
  solver: 'w' | 'b'
  /** the punishing line in UCI, alternating solver / opponent moves, starting with the solver */
  line: TreeNode[]
}

export const PUZZLES: Puzzle[] = (() => {
  const out: Puzzle[] = []
  const seen = new Set<string>()
  for (const def of OPENINGS) {
    for (const n of getTree(def).nodes.values()) {
      if (!isMistake(n) || !n.children.length || seen.has(n.fen)) continue
      const line: TreeNode[] = []
      for (let c: TreeNode | undefined = n.children[0]; c; c = c.children[0]) line.push(c)
      while (line.length && line.length % 2 === 0) line.pop() // end on the solver's move
      if (!line.length) continue
      seen.add(n.fen)
      out.push({ id: `${def.id}:${n.id}`, openingId: def.id, opening: def.name, blunder: moveLabel(n), fen: n.fen, lastUci: n.uci, solver: sideToMove(n), line })
    }
  }
  return out
})()
