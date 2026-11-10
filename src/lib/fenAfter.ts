import { Chess } from 'chess.js'

/** The position after a UCI move (or the same position if the move doesn't fit). */
export function fenAfter(fen: string, uci: string) {
  try {
    const c = new Chess(fen)
    c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    return c.fen()
  } catch {
    return fen
  }
}
