import { Chess } from 'chess.js'
import type { OpeningDef } from '../data/openings'
import { allOpenings } from './custom'
import { getExtensions } from './extensions'
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
  const ext = getExtensions().lines
  const sig = defs.map((d) => d.id + d.lines.length + ':' + (ext[d.id]?.length ?? 0)).join('|')
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
  /** the game got through the opening's defining moves (it IS this opening, just maybe not your line) */
  identified: boolean
  /** the move the game left the book with (null when the book line simply ran out) */
  deviation: { san: string; uci: string } | null
}

const trunks = new WeakMap<OpeningTree, number>()
/** How many plies every line of an opening shares — its defining moves (1.d4 e5 for the Englund). */
function trunkOf(tree: OpeningTree) {
  let t = trunks.get(tree)
  if (t === undefined) {
    const paths = tree.leaves.map((l) => l.id.split(' '))
    t = 0
    while (paths.length && paths.every((p) => p.length > t! && p[t!] === paths[0][t!])) t++
    trunks.set(tree, t)
  }
  return t
}

const treePositions = new WeakMap<OpeningTree, Map<string, TreeNode>>()
function positionsOf(tree: OpeningTree) {
  let m = treePositions.get(tree)
  if (!m) {
    m = new Map()
    for (const n of tree.nodes.values()) if (!m.has(posKey(n.fen))) m.set(posKey(n.fen), n)
    treePositions.set(tree, m)
  }
  return m
}

const gamePositions = new WeakMap<ImportedGame, string[]>()
function positionsOfGame(g: ImportedGame) {
  let p = gamePositions.get(g)
  if (!p) {
    p = []
    const c = new Chess()
    for (const san of g.sans) {
      try {
        c.move(san)
      } catch {
        break
      }
      p.push(posKey(c.fen()))
    }
    gamePositions.set(g, p)
  }
  return p
}

/**
 * The Outpost opening this game followed furthest, from the user's side. Matching is by position,
 * so other move orders count (a London with Nf3 before e3 is still a London): the game can drift
 * out of book for a few moves and come back.
 */
export function bookOf(game: ImportedGame): GameBook | null {
  if (game.startFen) return null
  const pos = positionsOfGame(game)
  let best: GameBook | null = null
  for (const def of allOpenings()) {
    const tree = getTree(def.side === game.userColor ? def : flipOpening(def))
    const map = positionsOf(tree)
    let depth = 0
    let node: TreeNode = tree.root
    for (let i = 0; i < pos.length; i++) {
      const n = map.get(pos[i])
      if (n) {
        depth = i + 1
        node = n
      } else if (i + 1 - depth > 6) break
    }
    if (depth < 2) continue
    // 1.d4 e5 is enough to call it an Englund; a 1-move trunk (the London is just "1.d4") needs a bit more
    const trunk = trunkOf(tree)
    const identified = trunk >= 2 ? depth >= trunk : depth >= 3
    // an opening the game really is (defining moves reached) beats one that just shares a few moves
    if (best && (Number(best.identified) * 1000 + best.depth >= Number(identified) * 1000 + depth)) continue
    const mover = depth % 2 === 0 ? 'w' : 'b' // who moved next, out of book
    const leftBy: GameBook['leftBy'] = !node.children.length || depth >= game.sans.length ? 'end' : mover === game.userColor ? 'you' : 'opponent'
    let deviation: GameBook['deviation'] = null
    if (leftBy !== 'end') {
      try {
        const m = new Chess(node.fen).move(game.sans[depth])
        deviation = { san: m.san, uci: m.from + m.to + (m.promotion ?? '') }
      } catch {
        /* the game's move doesn't fit the book position (a transposition mismatch) */
      }
    }
    best = { tree, depth, node, leftBy, practiced: false, identified, deviation }
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
  /** moves that took these games out of book, most frequent first (not yet in the book) */
  deviations: Deviation[]
}

export interface Deviation {
  tree: OpeningTree
  node: TreeNode // the last book position
  san: string
  uci: string
  by: 'you' | 'opponent'
  count: number
}

const family = (name?: string) => (name ?? 'Unknown opening').split(':')[0].split(',')[0].trim()

/** Group your games by opening (and side), with how well Outpost covers each. */
export function openingUsage(games: ImportedGame[]): OpeningUsage[] {
  const groups = new Map<string, OpeningUsage>()
  for (const g of games) {
    if (g.startFen || g.sans.length < 4) continue
    const key = `${g.userColor}|${family(g.opening)}`
    const u = groups.get(key) ?? { family: family(g.opening), side: g.userColor, games: [], score: 0, book: null, avgDepth: 0, youLeft: 0, deviations: [] }
    u.games.push(g)
    groups.set(key, u)
  }
  for (const u of groups.values()) {
    let depthSum = 0
    let points = 0
    const devs = new Map<string, Deviation>()
    for (const g of u.games) {
      const b = bookOf(g)
      depthSum += b?.depth ?? 0
      if (b?.leftBy === 'you') u.youLeft++
      if (b && (!u.book || b.depth > u.book.depth)) u.book = b
      if (b?.deviation && b.leftBy !== 'end' && (b.identified || b.depth >= 4) && !b.node.children.some((c) => c.san === b.deviation!.san)) {
        const key = `${b.tree.def.id}|${b.node.id}|${b.deviation.san}`
        const d = devs.get(key)
        if (d) d.count++
        else devs.set(key, { tree: b.tree, node: b.node, san: b.deviation.san, uci: b.deviation.uci, by: b.leftBy as 'you' | 'opponent', count: 1 })
      }
      const won = g.result === '1/2-1/2' ? 0.5 : g.result === '*' ? 0.5 : (g.result === '1-0') === (g.userColor === 'w') ? 1 : 0
      points += won
    }
    u.avgDepth = depthSum / u.games.length
    u.deviations = [...devs.values()].sort((a, b) => b.count - a.count || a.node.ply - b.node.ply)
    u.score = points / u.games.length
  }
  return [...groups.values()].sort((a, b) => b.games.length - a.games.length)
}
