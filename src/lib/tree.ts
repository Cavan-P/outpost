import { Chess } from 'chess.js'
import type { OpeningDef, Side } from '../data/openings'
import { extensionLines, onExtensionsChange } from './extensions'

export interface TreeNode {
  id: string // space-joined SAN path from the start, '' for the root
  san: string
  uci: string
  annotation: string // '!', '?', '??', '!?' ...
  note: string
  fen: string // position after this move
  ply: number // 0 for root, 1 after White's first move...
  parent: TreeNode | null
  children: TreeNode[]
}

export interface OpeningTree {
  def: OpeningDef
  root: TreeNode
  nodes: Map<string, TreeNode>
  leaves: TreeNode[]
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const TOKEN = /([^\s{}]+)\s*(?:\{([^}]*)\})?/g

export function parseLine(line: string): { san: string; annotation: string; note: string }[] {
  const out: { san: string; annotation: string; note: string }[] = []
  for (const m of line.matchAll(TOKEN)) {
    const raw = m[1]
    const ann = raw.match(/[!?]+$/)?.[0] ?? ''
    out.push({ san: raw.slice(0, raw.length - ann.length), annotation: ann, note: (m[2] ?? '').trim() })
  }
  return out
}

export function buildTree(def: OpeningDef): OpeningTree {
  const root: TreeNode = { id: '', san: '', uci: '', annotation: '', note: def.summary, fen: START_FEN, ply: 0, parent: null, children: [] }
  const nodes = new Map<string, TreeNode>([['', root]])

  for (const line of def.lines) {
    const chess = new Chess()
    let node = root
    for (const tok of parseLine(line)) {
      let move
      try {
        move = chess.move(tok.san)
      } catch {
        throw new Error(`[${def.id}] illegal move "${tok.san}" after "${node.id}"`)
      }
      const id = node.id ? `${node.id} ${move.san}` : move.san
      let child = nodes.get(id)
      if (!child) {
        child = {
          id,
          san: move.san,
          uci: move.from + move.to + (move.promotion ?? ''),
          annotation: tok.annotation,
          note: tok.note,
          fen: chess.fen(),
          ply: node.ply + 1,
          parent: node,
          children: [],
        }
        nodes.set(id, child)
        node.children.push(child)
      } else {
        if (!child.note && tok.note) child.note = tok.note
        if (!child.annotation && tok.annotation) child.annotation = tok.annotation
      }
      node = child
    }
  }

  const leaves = [...nodes.values()].filter((n) => n.children.length === 0)
  return { def, root, nodes, leaves }
}

/** Whose move it is at this node (the side to play the *next* move). */
export function sideToMove(node: TreeNode): Side {
  return node.ply % 2 === 0 ? 'w' : 'b'
}

export function pathTo(node: TreeNode): TreeNode[] {
  const path: TreeNode[] = []
  for (let n: TreeNode | null = node; n && n.parent; n = n.parent) path.unshift(n)
  return path
}

/** Leaves reachable from a node. */
export function leavesUnder(node: TreeNode): TreeNode[] {
  if (node.children.length === 0) return [node]
  return node.children.flatMap(leavesUnder)
}

/** A move annotated `?` or `??` — kept in the tree to demonstrate a trap, never as a move to learn. */
export const isMistake = (n: TreeNode) => n.annotation === '?' || n.annotation === '??'

/** Moves the trainee should play here (mistakes are excluded; may be empty if theory only shows a blunder). */
export function bookMoves(node: TreeNode): TreeNode[] {
  return node.children.filter((c) => !isMistake(c))
}

/** Nodes where the trainee must find a move (their side to move and theory continues). */
export function userDecisionNodes(tree: OpeningTree): TreeNode[] {
  return [...tree.nodes.values()].filter((n) => sideToMove(n) === tree.def.side && bookMoves(n).length > 0)
}

/** The same repertoire trained from the other side ("how do I face this?"). */
export function flipOpening(def: OpeningDef): OpeningDef {
  return { ...def, id: `${def.id}~flip`, side: def.side === 'w' ? 'b' : 'w', flipped: true }
}

export function moveLabel(node: TreeNode): string {
  const num = Math.ceil(node.ply / 2)
  return node.ply % 2 === 1 ? `${num}.${node.san}${node.annotation}` : `${num}…${node.san}${node.annotation}`
}

const treeCache = new Map<string, OpeningTree>()

/** Forget a cached tree (and its flipped twin) after an opening is edited. */
export function invalidateTree(id: string) {
  treeCache.delete(id)
  treeCache.delete(`${id}~flip`)
}
// your own added lines change trees, so drop the cache when they change
onExtensionsChange(() => treeCache.clear())

export function getTree(def: OpeningDef): OpeningTree {
  let t = treeCache.get(def.id)
  if (!t) {
    const extra = extensionLines(def.id)
    try {
      t = buildTree(extra.length ? { ...def, lines: [...def.lines, ...extra] } : def)
    } catch {
      t = buildTree(def) // a broken addition never breaks the opening itself
    }
    treeCache.set(def.id, t)
  }
  return t
}
