// Audits the opening data with Stockfish:
//  - every move annotated ? / ?? should really lose ground (otherwise the "trap" annotation is wrong)
//  - book moves that lose a lot are listed for review (gambits are allowed to be dubious, but not losing outright)
// Usage: npm run audit [-- <opening-id>]   (takes a few minutes for everything)
import { createRequire } from 'node:module'
import { OPENINGS } from '../src/data/openings'
import { ENDGAMES } from '../src/data/endgames'
import { buildTree, isMistake, type TreeNode } from '../src/lib/tree'

const require = createRequire(import.meta.url)
const DEPTH = 14

type Score = number // pawns, White's point of view
let pending: ((s: Score) => void) | null = null
let last: Score = 0
let blackToMove = false
const engine = require('stockfish')('lite-single', (line: string) => {
  const m = line.match(/score (cp|mate) (-?\d+)/)
  if (m && line.includes(' pv ')) {
    const v = m[1] === 'mate' ? Math.sign(Number(m[2]) || -1) * 100 : Number(m[2]) / 100
    last = blackToMove ? -v : v
  }
  if (line.startsWith('bestmove')) {
    const done = pending
    pending = null
    done?.(line.includes('(none)') ? (blackToMove ? 100 : -100) : last) // no legal moves: side to move is mated (stalemate is rare here)
  }
})

const cache = new Map<string, Score>()
function evaluate(fen: string): Promise<Score> {
  const hit = cache.get(fen)
  if (hit !== undefined) return Promise.resolve(hit)
  return new Promise((resolve) => {
    blackToMove = fen.split(' ')[1] === 'b'
    last = 0
    pending = (s) => {
      cache.set(fen, s)
      resolve(s)
    }
    engine.processCommand(`position fen ${fen}`)
    engine.processCommand(`go depth ${DEPTH}`)
  })
}

/** How much worse (in pawns, for the mover) this move is than the position's best play. */
async function loss(node: TreeNode): Promise<number> {
  const parent = node.parent!
  const sign = parent.ply % 2 === 0 ? 1 : -1 // White moved if the parent's ply is even
  return Math.max(0, sign * ((await evaluate(parent.fen)) - (await evaluate(node.fen))))
}

const only = process.argv[2]
const fmt = (n: TreeNode) => n.id.split(' ').map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}.${s}` : s)).join(' ')
let wrongTraps = 0
engine.processCommand('uci')
for (const def of OPENINGS.filter((d) => !only || d.id === only)) {
  const tree = buildTree(def)
  const out: string[] = []
  for (const node of tree.nodes.values()) {
    if (!node.parent) continue
    // after a demonstrated blunder the rest of the line is forced punishment — don't judge it
    let afterBlunder = false
    for (let n = node.parent; n; n = n.parent) if (isMistake(n)) afterBlunder = true
    if (afterBlunder) continue
    const l = await loss(node)
    if (isMistake(node) && l < 0.6) {
      wrongTraps++
      out.push(`  ✗ marked "${node.annotation}" but only loses ${l.toFixed(2)}: ${fmt(node)}`)
    } else if (!isMistake(node) && l >= 2 && node.annotation !== '?!' && node.annotation !== '!?') {
      out.push(`  ⚠ book move loses ${l.toFixed(2)}: ${fmt(node)}`)
    }
  }
  console.log(`${out.length ? '•' : '✓'} ${def.name}`)
  for (const o of out) console.log(o)
}
console.log(`\n${wrongTraps} questionable trap annotation(s).`)

// Endgames: a "win" exercise must really be winning for you, a "draw" exercise must really hold.
if (!only || only === 'endgames') {
  let bad = 0
  for (const eg of ENDGAMES) {
    const white = await evaluate(eg.fen)
    const mine = eg.side === 'w' ? white : -white
    const ok = eg.goal === 'draw' ? mine > -1 : mine >= 1.5
    if (!ok) bad++
    console.log(`${ok ? '✓' : '✗'} endgame ${eg.name}: ${mine.toFixed(2)} for you (goal: ${eg.goal})`)
  }
  console.log(`${bad} endgame(s) whose goal doesn't match the engine.`)
}
engine.terminate?.()
process.exit(0)
