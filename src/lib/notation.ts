import { Chess, type Color, type Move, type PieceSymbol } from 'chess.js'

// Turning moves into words ("Knight to b4, check") and words back into moves ("knight takes e5").

const PIECE_WORD: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }
export const pieceWord = (p: PieceSymbol) => PIECE_WORD[p]
export const colorWord = (c: Color) => (c === 'w' ? 'White' : 'Black')

/** "Knight to b4", "e-pawn takes d5", "Bishop takes e2, check", "Castles kingside", "Pawn to e8, promotes to a queen" */
export function moveToWords(m: Move): string {
  let s: string
  if (m.isKingsideCastle()) s = 'Castles kingside'
  else if (m.isQueensideCastle()) s = 'Castles queenside'
  else if (m.piece === 'p') s = m.captured ? `${m.from[0]}-pawn takes ${m.to}` : `Pawn to ${m.to}`
  else {
    const word = PIECE_WORD[m.piece]
    s = `${word[0].toUpperCase()}${word.slice(1)} ${m.captured ? 'takes' : 'to'} ${m.to}`
  }
  if (m.promotion) s += `, promotes to a ${PIECE_WORD[m.promotion]}`
  if (m.san.includes('#')) s += ', checkmate'
  else if (m.san.includes('+')) s += ', check'
  return s
}

const WORDS: [RegExp, string][] = [
  [/\bknight\b/g, 'N'],
  [/\bbishop\b/g, 'B'],
  [/\brook\b/g, 'R'],
  [/\bqueen\b/g, 'Q'],
  [/\bking\b/g, 'K'],
  [/\bpawn\b/g, ''],
  [/\b(takes|captures|x)\b/g, 'x'],
  [/\b(check)\b/g, '+'],
  [/\b(mate|checkmate)\b/g, '#'],
  [/\bto\b/g, ''],
]

/**
 * Parse a typed move in SAN, UCI, or words ("knight b4", "bishop takes e2 check", "castles kingside").
 * Returns the matching legal move or null.
 */
export function parseTypedMove(fen: string, text: string): Move | null {
  const raw = text.trim()
  if (!raw) return null
  const c = new Chess(fen)
  const tryMove = (t: string) => {
    try {
      return new Chess(fen).move(t)
    } catch {
      return null
    }
  }
  // exact SAN (case-sensitive first, then with capitalised piece letter)
  const direct = tryMove(raw) ?? tryMove(raw.replace(/^[nbrqk]/, (x) => x.toUpperCase()))
  if (direct) return direct
  if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(raw)) {
    try {
      return c.move({ from: raw.slice(0, 2).toLowerCase(), to: raw.slice(2, 4).toLowerCase(), promotion: raw[4]?.toLowerCase() })
    } catch {
      return null
    }
  }
  let t = raw.toLowerCase()
  if (/castles?\s*(king|short)|o-o$|0-0$/.test(t) && !/queen|long|o-o-o|0-0-0/.test(t)) return tryMove('O-O')
  if (/castles?\s*(queen|long)|o-o-o|0-0-0/.test(t)) return tryMove('O-O-O')
  for (const [re, rep] of WORDS) t = t.replace(re, rep)
  t = t.replace(/[\s,.!]/g, '')
  // match against legal moves ignoring check symbols and disambiguation the user may leave out
  const strip = (s: string) => s.replace(/[+#]/g, '')
  const want = strip(t)
  const legal = c.moves({ verbose: true })
  const exact = legal.find((m) => strip(m.san) === want || strip(m.san).toLowerCase() === want.toLowerCase())
  if (exact) return exact
  // "Nxe5" when SAN is "Nfxe5": same piece type and destination, unique
  const piece = /^[NBRQK]/.test(want) ? want[0].toLowerCase() : 'p'
  const dest = want.match(/[a-h][1-8]/g)?.pop()
  const cands = legal.filter((m) => m.piece === piece && m.to === dest)
  return cands.length === 1 ? cands[0] : null
}

/** Speak text with the browser's speech synthesis, if available. */
export function speak(text: string) {
  try {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 0.95
    window.speechSynthesis.speak(u)
  } catch {
    /* speech not available */
  }
}
