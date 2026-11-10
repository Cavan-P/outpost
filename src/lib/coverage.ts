import type { OpeningDef } from '../data/openings'
import { allOpenings } from './custom'
import { practiced } from './openingIndex'
import { bookMoves, flipOpening, getTree, type OpeningTree, type TreeNode } from './tree'

// "Do I have an answer to 1.Nc3?" — repertoire coverage of first moves.

/** Roughly how often each first move turns up in club games (percent). */
const WHITE_FIRST: [string, number][] = [
  ['e4', 46], ['d4', 33], ['Nf3', 8], ['c4', 6], ['g3', 1.5], ['b3', 1], ['f4', 1], ['Nc3', 1], ['e3', 1], ['b4', 0.5], ['d3', 0.5], ['c3', 0.3],
]
/** Common replies to White's main first moves. */
const BLACK_REPLY: Record<string, [string, number][]> = {
  e4: [['c5', 30], ['e5', 28], ['e6', 11], ['c6', 9], ['d5', 6], ['d6', 4], ['Nf6', 3], ['g6', 3], ['Nc6', 2]],
  d4: [['d5', 40], ['Nf6', 40], ['e6', 5], ['f5', 3], ['d6', 3], ['c5', 3], ['g6', 3]],
  c4: [['e5', 30], ['Nf6', 28], ['c5', 15], ['e6', 10], ['c6', 6], ['g6', 5]],
  Nf3: [['d5', 35], ['Nf6', 35], ['c5', 10], ['g6', 7], ['f5', 3]],
  g3: [['d5', 30], ['e5', 25], ['Nf6', 25], ['g6', 10], ['c5', 10]],
  f4: [['d5', 40], ['Nf6', 20], ['e5', 15], ['g6', 10], ['c5', 10]],
  b3: [['e5', 40], ['d5', 25], ['Nf6', 20], ['c5', 10]],
}

/** Every tree in both orientations: your side is `side`. */
function treesFor(side: 'w' | 'b') {
  return allOpenings().map((d) => getTree(d.side === side ? d : flipOpening(d)))
}

const childOf = (n: TreeNode, san: string) => n.children.find((c) => c.san === san)

export interface Gap {
  moves: string[] // e.g. ["Nc3"] or ["e4", "c6"]
  share: number // rough % of games
  covered: OpeningDef[] // studied openings that answer it
  suggest: OpeningDef[] // openings in Outpost that would
}

/** Does this tree give you a move after `moves`? */
function answers(tree: OpeningTree, moves: string[]) {
  let n: TreeNode | undefined = tree.root
  for (const m of moves) n = n && childOf(n, m)
  return !!n && bookMoves(n).length > 0
}

const rank = (d: OpeningDef) => (d.tags.includes('dubious') || d.tags.includes('meme') ? 2 : d.tags.includes('solid') || d.tags.includes('classical') ? 0 : 1)

function check(trees: OpeningTree[], studied: Set<OpeningTree>, moves: string[], share: number): Gap {
  const aimed = (d: OpeningDef) => moves.length === 1 && d.tags.includes(`vs-${moves[0].toLowerCase()}`)
  const hits = trees.filter((t) => answers(t, moves))
  const covered = hits.filter((t) => studied.has(t)).map((t) => t.def)
  // suggest openings that were written for this side first (not "Face it" copies), sound ones first
  // breadth: how many different opponent replies the opening prepares you for right after your answer
  // (the Marshall answers 1.e4 with 1…e5 but only covers 2.Nf3; the Caro-Kann covers 2.d4, 2.Nc3, 2.c4…)
  const breadth = (t: OpeningTree) => {
    let n: TreeNode | undefined = t.root
    for (const m of moves) n = n && childOf(n, m)
    return n ? bookMoves(n).reduce((sum, b) => sum + b.children.length, 0) : 0
  }
  const suggest = hits
    .filter((t) => !studied.has(t))
    // prefer real defenses to this move (tagged vs-e4 etc.) over openings that only cover one line of it
    .sort((a, b) => Number(!!a.def.flipped) - Number(!!b.def.flipped) || Number(!aimed(a.def)) - Number(!aimed(b.def)) || Math.min(breadth(b), 4) - Math.min(breadth(a), 4) || rank(a.def) - rank(b.def) || breadth(b) - breadth(a))
    .map((t) => t.def)
    .slice(0, 3)
  return { moves, share, covered, suggest }
}

export interface Coverage {
  black: Gap[] // your answers to White's first moves
  white: { first: string; replies: Gap[] }[] // for each first move you play, Black's main replies
  whiteSuggest: OpeningDef[] // if you have no White repertoire yet
}

export function coverage(): Coverage {
  const blackTrees = treesFor('b')
  const whiteTrees = treesFor('w')
  const studiedB = new Set(blackTrees.filter(practiced))
  const studiedW = new Set(whiteTrees.filter(practiced))

  const black = WHITE_FIRST.map(([m, share]) => check(blackTrees, studiedB, [m], share))

  // White: the first moves your studied White openings start with
  const firsts = new Map<string, number>()
  for (const t of studiedW) for (const c of t.root.children) if (!c.annotation.includes('?')) firsts.set(c.san, (firsts.get(c.san) ?? 0) + 1)
  const white = [...firsts.keys()]
    .sort((a, b) => (WHITE_FIRST.find((x) => x[0] === b)?.[1] ?? 0) - (WHITE_FIRST.find((x) => x[0] === a)?.[1] ?? 0))
    .map((first) => ({ first, replies: (BLACK_REPLY[first] ?? []).map(([r, share]) => check(whiteTrees, studiedW, [first, r], share)) }))
  const whiteSuggest = studiedW.size ? [] : whiteTrees.filter((t) => !t.def.flipped && (t.root.children[0]?.san === 'e4' || t.root.children[0]?.san === 'd4')).sort((a, b) => rank(a.def) - rank(b.def)).map((t) => t.def).slice(0, 4)
  return { black, white, whiteSuggest }
}

export const label = (moves: string[]) => (moves.length === 1 ? `1.${moves[0]}` : `1.${moves[0]} ${moves[1]}`)
