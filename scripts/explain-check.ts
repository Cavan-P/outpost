// Sanity checks for the move-explanation heuristics.
import { explainMove } from '../src/lib/explain'
const cases: [string, string, string, string[]][] = [
  ['quiet gambit grab later regained (should NOT claim material)', 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1', 'g8f6', ['g8f6', 'c2c4', 'e7e6', 'g1f3', 'd7d5', 'b1c3', 'd5c4', 'e2e4', 'f8b4', 'f1c4']],
  ['Stafford trap Nxe4', 'r1bqk2r/ppp2ppp/2p2n2/2b3B1/4P3/3P4/PPP2PPP/RN1QKB1R b KQkq - 2 6', 'f6e4', ['f6e4', 'g5d8', 'c5f2', 'e1e2', 'c8g4']],
  ['Fried liver Nxf7 fork', 'r1bqkb1r/ppp2ppp/2n5/3np1N1/2B5/8/PPPP1PPP/RNBQK2R w KQkq - 0 6', 'g5f7', ['g5f7', 'e8f7', 'd1f3', 'f7e6', 'b1c3']],
  ['simple free piece', '4k3/8/8/3n4/8/8/8/3QK3 w - - 0 1', 'd1d5', ['d1d5']],
  ['castling', 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', 'e1g1', ['e1g1']],
]
for (const [name, fen, uci, pv] of cases) {
  const e = explainMove(fen, uci, pv)
  console.log(`\n# ${name}: ${e.san}\n - ${e.reasons.join('\n - ')}`)
}
