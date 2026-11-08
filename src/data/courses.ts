// Endgame mini-courses: short chains of related endgames, in teaching order.
export interface Course {
  id: string
  name: string
  blurb: string
  steps: string[] // endgame ids
}

export const COURSES: Course[] = [
  { id: 'mates', name: 'Basic mates', blurb: 'Every mate you must be able to play in your sleep, from the queen to the dreaded bishop + knight.', steps: ['mate-kq', 'mate-kr', 'mate-2r', 'mate-2b', 'mate-bn'] },
  { id: 'pawns', name: 'King & pawn', blurb: 'Key squares, opposition, the rule of the square — the foundation of every endgame.', steps: ['kp-win', 'kp-draw', 'pawn-square', 'pawn-breakthrough', 'pawn-outside'] },
  { id: 'rooks', name: 'Rook endgames', blurb: 'Build a bridge, hold the third rank, check from the side. Half of all endgames are rook endgames.', steps: ['rook-cutoff', 'lucena', 'philidor', 'vancura'] },
  { id: 'fortress', name: 'Fortresses', blurb: 'Down material but not lost: the corners, the wrong bishop and the stalemate tricks that save half-points.', steps: ['rook-vs-bishop', 'rook-vs-knight', 'wrong-bishop', 'opposite-bishops', 'queen-vs-c-pawn'] },
  { id: 'technique', name: 'Winning technique', blurb: 'Convert the extra material: queen vs rook, queen vs pawn and the right bishop.', steps: ['mate-qr', 'queen-vs-pawn', 'right-bishop'] },
]
