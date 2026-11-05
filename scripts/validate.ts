// Validates every opening line is legal, every endgame start position is legal, and reports tree stats.
import { Chess } from 'chess.js'
import { OPENINGS } from '../src/data/openings'
import { ENDGAMES } from '../src/data/endgames'
import { MATES } from '../src/data/mates'
import { bookMoves, buildTree, userDecisionNodes } from '../src/lib/tree'

let ok = true
const ids = new Set<string>()
for (const def of OPENINGS) {
  if (ids.has(def.id)) {
    ok = false
    console.log(`✗ duplicate opening id ${def.id}`)
  }
  ids.add(def.id)
  try {
    const t = buildTree(def)
    const mates = [...t.nodes.values()].filter((n) => new Chess(n.fen).isCheckmate()).length
    const notes = [...t.nodes.values()].filter((n) => n.note).length
    const multi = userDecisionNodes(t).filter((n) => bookMoves(n).length > 1).map((n) => `${n.id} -> ${bookMoves(n).map((c) => c.san).join('/')}`)
    console.log(`✓ ${def.name}: ${t.nodes.size - 1} moves, ${t.leaves.length} lines, ${notes} notes${mates ? `, mates: ${mates}` : ''}`)
    for (const m of multi) console.log(`   ⚠ multiple book moves for trainee: ${m}`)
  } catch (e) {
    ok = false
    console.log(`✗ ${(e as Error).message}`)
  }
}

// chess.js accepts positions where the side NOT to move is in check (king capturable) — reject those.
for (const eg of ENDGAMES) {
  const parts = eg.fen.split(' ')
  parts[1] = parts[1] === 'w' ? 'b' : 'w'
  parts[3] = '-'
  let illegal = false
  try {
    illegal = new Chess(parts.join(' ')).inCheck()
  } catch {
    illegal = true
  }
  if (illegal) {
    ok = false
    console.log(`✗ endgame ${eg.id}: the side not to move is in check`)
  } else console.log(`✓ endgame ${eg.name}`)
}
for (const m of MATES) {
  const parts = m.fen.split(' ')
  parts[1] = parts[1] === 'w' ? 'b' : 'w'
  parts[3] = '-'
  if (new Chess(parts.join(' '), { skipValidation: true }).inCheck()) {
    ok = false
    console.log(`✗ mate pattern ${m.id}: the side not to move is in check`)
  }
}
console.log(`\n${OPENINGS.length} openings, ${ENDGAMES.length} endgames, ${MATES.length} mating patterns`)
process.exit(ok ? 0 : 1)
