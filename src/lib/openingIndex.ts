import type { OpeningDef } from '../data/openings'
import { allOpenings } from './custom'
import { getProgress, medalOf } from './progress'
import { flipOpening, getTree, userDecisionNodes, type OpeningTree, type TreeNode } from './tree'
import type { ImportedGame } from './games'

// Which Outpost openings contain a position, and how far an imported game followed one.

/** Position key without move counters, so transpositions match. */
export const posKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ')

export interface PosHit {
  def: OpeningDef
  node: TreeNode
}

let index: Map<string, PosHit[]> | null = null
let indexedFor = ''

/** Every position in every opening (built once, rebuilt when custom repertoires change). */
export function positionIndex(): Map<string, PosHit[]> {
  const defs = allOpenings()
  const sig = defs.map((d) => d.id + d.lines.length).join('|')
  if (index && indexedFor === sig) return index
  index = new Map()
  for (const def of defs)
    for (const node of getTree(def).nodes.values()) {
      const k = posKey(node.fen)
      const list = index.get(k) ?? []
      if (!list.some((h) => h.def.id === def.id)) list.push({ def, node })
      index.set(k, list)
    }
  indexedFor = sig
  return index
}

export const openingsAt = (fen: string) => positionIndex().get(posKey(fen)) ?? []

/** Has the trainee worked on this tree at all? */
export function practiced(tree: OpeningTree) {
  const p = getProgress(tree.def.id)
  return Object.keys(p.nodes).length > 0 || p.learned.length > 0
}

export function medalFor(tree: OpeningTree) {
  return medalOf(userDecisionNodes(tree).map((n) => n.id), getProgress(tree.def.id))
}

export interface GameBook {
  tree: OpeningTree // oriented so the user plays its side (a "Face it" copy when you were facing it)
  depth: number // plies the game followed the book
  node: TreeNode // the last book position
  leftBy: 'you' | 'opponent' | 'end' // who left the book first ("end" = the line ran out)
  practiced: boolean
}

/** The Outpost opening this game followed furthest, from the user's side. */
export function bookOf(game: ImportedGame): GameBook | null {
  if (game.startFen) return null
  let best: GameBook | null = null
  for (const def of allOpenings()) {
    const tree = getTree(def.side === game.userColor ? def : flipOpening(def))
    let node = tree.root
    let depth = 0
    for (const san of game.sans) {
      const next = node.children.find((c) => c.san === san)
      if (!next) break
      node = next
      depth++
    }
    if (depth < 2 || (best && depth <= best.depth)) continue
    const mover = depth % 2 === 0 ? 'w' : 'b' // who was to move after the last book ply
    const leftBy: GameBook['leftBy'] = !node.children.length ? 'end' : depth >= game.sans.length ? 'end' : mover === game.userColor ? 'you' : 'opponent'
    best = { tree, depth, node, leftBy, practiced: false }
  }
  if (best) best.practiced = practiced(best.tree)
  return best
}

export interface OpeningUsage {
  family: string // from the game header, e.g. "Sicilian Defense"
  side: 'w' | 'b'
  games: ImportedGame[]
  score: number // points per game, 0..1
  book: GameBook | null // the deepest Outpost match among these games
  avgDepth: number // average plies in Outpost book
  youLeft: number // games where you were the one who left book
}

const family = (name?: string) => (name ?? 'Unknown opening').split(':')[0].split(',')[0].trim()

/** Group your games by opening (and side), with how well Outpost covers each. */
export function openingUsage(games: ImportedGame[]): OpeningUsage[] {
  const groups = new Map<string, OpeningUsage>()
  for (const g of games) {
    if (g.startFen || g.sans.length < 4) continue
    const key = `${g.userColor}|${family(g.opening)}`
    const u = groups.get(key) ?? { family: family(g.opening), side: g.userColor, games: [], score: 0, book: null, avgDepth: 0, youLeft: 0 }
    u.games.push(g)
    groups.set(key, u)
  }
  for (const u of groups.values()) {
    let depthSum = 0
    let points = 0
    for (const g of u.games) {
      const b = bookOf(g)
      depthSum += b?.depth ?? 0
      if (b?.leftBy === 'you') u.youLeft++
      if (b && (!u.book || b.depth > u.book.depth)) u.book = b
      const won = g.result === '1/2-1/2' ? 0.5 : g.result === '*' ? 0.5 : (g.result === '1-0') === (g.userColor === 'w') ? 1 : 0
      points += won
    }
    u.avgDepth = depthSum / u.games.length
    u.score = points / u.games.length
  }
  return [...groups.values()].sort((a, b) => b.games.length - a.games.length)
}
