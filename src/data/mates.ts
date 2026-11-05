// Classic mating patterns. Every position was checked with Stockfish (mate in `moves` for the side to move).

export interface MatePattern {
  id: string
  name: string
  idea: string
  fen: string
  moves: number // mate in N (your moves)
}

export const MATES: MatePattern[] = [
  { id: 'back-rank', name: 'Back-rank mate', idea: 'The king is trapped behind its own pawns — a rook or queen on the back rank finishes it.', fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', moves: 1 },
  { id: 'back-rank-2', name: 'Back-rank mate (doubled rooks)', idea: 'Doubled rooks overload the single defender of the back rank.', fen: '2r3k1/5ppp/8/8/8/8/2R2PPP/2R3K1 w - - 0 1', moves: 1 },
  { id: 'smothered', name: 'Smothered mate', idea: "The king is boxed in by its own pieces; a knight checks and nothing can move out of the way.", fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', moves: 1 },
  { id: 'philidor', name: "Philidor's legacy", idea: 'Sacrifice the queen on g8 to force the rook into the corner, then a smothered knight mate.', fen: '5r1k/6pp/7N/8/8/1Q6/8/6K1 w - - 0 1', moves: 2 },
  { id: 'arabian', name: 'Arabian mate', idea: 'Rook and knight team up: the knight guards the rook and the escape square in the corner.', fen: '7k/1R6/5N2/8/8/8/8/6K1 w - - 0 1', moves: 1 },
  { id: 'anastasia', name: "Anastasia's mate", idea: 'A knight on e7 takes g6 and g8; the rook mates along the h-file with the g-pawn blocking.', fen: '5r2/4N1pk/8/8/8/R7/8/6K1 w - - 0 1', moves: 1 },
  { id: 'boden', name: "Boden's mate", idea: 'Two bishops on criss-crossing diagonals mate a king castled queenside.', fen: '2kr4/p2p4/2p5/8/5B2/8/8/4KB2 w - - 0 1', moves: 1 },
  { id: 'damiano', name: "Damiano's mate", idea: 'The queen lands next to the king, supported by a pawn wedged on f6.', fen: '6k1/5p1p/5PpQ/8/8/8/8/6K1 w - - 0 1', moves: 1 },
  { id: 'epaulette', name: 'Epaulette mate', idea: "The king's own rooks sit on its shoulders and take away the escape squares.", fen: '3rkr2/8/8/8/8/8/Q7/6K1 w - - 0 1', moves: 1 },
  { id: 'greco', name: "Greco's mate", idea: 'A bishop seals g8 from afar; the queen mates on the open h-file.', fen: '7k/6p1/8/8/2B5/8/8/4Q1K1 w - - 0 1', moves: 1 },
  { id: 'opera', name: 'Opera mate', idea: "A rook mates on the back rank, protected by a bishop that also covers the king's escape square.", fen: '4k3/5p2/8/6B1/8/8/8/3R2K1 w - - 0 1', moves: 1 },
  { id: 'fools', name: "Fool's mate pattern", idea: 'Weakened f- and g-pawns open the e1–h4 / e8–h5 diagonal straight to the king.', fen: 'rnbqkbnr/ppppp2p/5p2/6p1/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3', moves: 1 },
]
