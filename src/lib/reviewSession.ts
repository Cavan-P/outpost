import type { EndgameDef } from '../data/endgames'
import { ENDGAMES } from '../data/endgames'
import type { MatePattern } from '../data/mates'
import { MATES } from '../data/mates'
import type { OpeningDef } from '../data/openings'
import { allOpenings } from './custom'
import { buildReport, type MistakePuzzle } from './gameAnalysis'
import { getGames, myGames } from './games'
import { getProgress, isDue, progressOf, type NodeStat } from './progress'
import { PUZZLES, type Puzzle } from './puzzles'
import { flipOpening, getTree, userDecisionNodes, type TreeNode } from './tree'

// A daily mixed session made only of things you've already practised:
// due repertoire positions (both sides), traps from openings you've studied or puzzles you've tried,
// puzzles from your own games you've attempted, and endgames / mating patterns you've solved.

export type Item =
  | { kind: 'book'; def: OpeningDef; node: TreeNode; stat?: NodeStat }
  | { kind: 'trap'; puzzle: Puzzle }
  | { kind: 'own'; puzzle: MistakePuzzle }
  | { kind: 'endgame'; endgame: EndgameDef }
  | { kind: 'mate'; pattern: MatePattern }

const BOOK_ITEMS = 15

export function dueItems(): { def: OpeningDef; node: TreeNode; stat?: NodeStat }[] {
  const now = Date.now()
  const out: { def: OpeningDef; node: TreeNode; stat?: NodeStat }[] = []
  for (const base of allOpenings()) {
    for (const def of [base, flipOpening(base)]) {
      const p = getProgress(def.id)
      if (!Object.keys(p.nodes).length) continue // only openings you've practised
      for (const node of userDecisionNodes(getTree(def))) {
        const stat = p.nodes[node.id]
        if (stat && isDue(stat, now)) out.push({ def, node, stat }) // only positions you've answered before
      }
    }
  }
  return out.sort((a, b) => progressOf(a.stat) - progressOf(b.stat) || (a.stat?.last ?? 0) - (b.stat?.last ?? 0))
}

/** An opening counts as studied if you've practised it (either side) or walked a line in Learn. */
function studied(openingId: string) {
  return [openingId, `${openingId}~flip`].some((id) => {
    const p = getProgress(id)
    return Object.keys(p.nodes).length > 0 || p.learned.length > 0
  })
}

const pick = <T,>(xs: T[], n: number) => [...xs].sort(() => Math.random() - 0.5).slice(0, n)

export function buildSession(sets: Record<string, string[]>): Item[] {
  const has = (set: string, id: string) => (sets[set] ?? []).includes(id)
  const book: Item[] = dueItems()
    .slice(0, BOOK_ITEMS)
    .map((x) => ({ kind: 'book', ...x }))
  // traps you've attempted, or that belong to an opening you've studied — ones you haven't solved come first
  const trapPool = PUZZLES.filter((p) => has('puzzlesSeen', p.id) || has('puzzles', p.id) || studied(p.openingId))
  const traps: Item[] = [...pick(trapPool.filter((p) => !has('puzzles', p.id)), 2), ...pick(trapPool.filter((p) => has('puzzles', p.id)), 2)]
    .slice(0, 2)
    .map((puzzle) => ({ kind: 'trap', puzzle }))
  // mistakes from your own games that you've already had a go at
  const ownPool = buildReport(myGames(getGames().games)).puzzles.filter((p) => has('ownPuzzlesSeen', p.id) || has('ownPuzzles', p.id))
  const own: Item[] = [...pick(ownPool.filter((p) => !has('ownPuzzles', p.id)), 3), ...pick(ownPool, 3)]
    .filter((p, i, a) => a.indexOf(p) === i)
    .slice(0, 3)
    .map((puzzle) => ({ kind: 'own', puzzle }))
  // one solved endgame and one learned mating pattern, to keep the technique fresh
  const endgames: Item[] = pick(ENDGAMES.filter((e) => has('endgames', e.id)), 1).map((endgame) => ({ kind: 'endgame', endgame }))
  const mates: Item[] = pick(MATES.filter((m) => has('mates', m.id)), 1).map((pattern) => ({ kind: 'mate', pattern }))
  // interleave so it doesn't feel like separate quizzes
  const items = [...book]
  ;[...traps, ...own, ...endgames, ...mates].forEach((x, i) => items.splice(Math.min(items.length, 3 + i * 4), 0, x))
  return items
}
