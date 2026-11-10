import { Chess } from 'chess.js'

// Perfect play from the Lichess endgame tablebase (positions with ≤7 pieces). Used for endgame hints,
// for the defending side, and for the "Learn it" walkthroughs. Answers are cached for the session.

export interface TbMove {
  uci: string
  san: string
  /** from the OPPONENT's point of view after this move: "loss" means the mover is winning */
  category: string
  dtz: number | null
  dtm: number | null
}
export interface TbResult {
  category: string // from the side to move: win / draw / loss …
  dtm: number | null // plies to mate (signed), when known
  dtz: number | null
  moves: TbMove[]
}

const cache = new Map<string, Promise<TbResult | null>>()
const key = (fen: string) => fen.split(' ').slice(0, 4).join(' ')
export const inTablebase = (fen: string) => fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').length <= 7

/** The tablebase rate-limits bursts (429): wait and retry a few times instead of giving up. */
async function fetchWithRetry(url: string, tries = 4): Promise<TbResult | null> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url)
      if (r.ok) return (await r.json()) as TbResult
      if (r.status !== 429 && r.status < 500) return null
    } catch {
      /* network blip: retry */
    }
    await new Promise((res) => setTimeout(res, 700 * 2 ** i))
  }
  return null
}

export function probe(fen: string): Promise<TbResult | null> {
  if (!inTablebase(fen)) return Promise.resolve(null)
  const k = key(fen)
  let p = cache.get(k)
  if (!p) {
    p = fetchWithRetry(`https://tablebase.lichess.ovh/standard?fen=${encodeURIComponent(fen)}`)
    p.then((r) => r === null && cache.delete(k))
    cache.set(k, p)
  }
  return p
}

// How good a move is for the player making it (higher is better).
const RANK: Record<string, number> = { loss: 5, 'maybe-loss': 4, 'blessed-loss': 3, draw: 2, 'cursed-win': 1, 'maybe-win': 0, win: -1, unknown: -2 }
const dist = (m: TbMove) => Math.abs(m.dtm ?? m.dtz ?? 0)

/**
 * The perfect move: the fastest mate when winning, the longest resistance when losing, and a move
 * that keeps the draw otherwise.
 */
export function perfectMove(tb: TbResult): TbMove | null {
  if (!tb.moves.length) return null
  const sorted = [...tb.moves].sort((a, b) => {
    const r = (RANK[b.category] ?? -2) - (RANK[a.category] ?? -2)
    if (r) return r
    const cat = a.category
    if (cat === 'loss' || cat === 'maybe-loss' || cat === 'blessed-loss') return dist(a) - dist(b) // win fast
    if (cat === 'win' || cat === 'maybe-win' || cat === 'cursed-win') return dist(b) - dist(a) // resist long
    return 0
  })
  return sorted[0]
}

export interface PerfectLine {
  fens: string[] // positions, starting with the start
  moves: { uci: string; san: string }[]
  dtm: (number | null)[] // plies to mate from each position (side to move's view), when known
}

/** Play the position out with perfect moves on both sides (up to `maxPlies`). */
export async function perfectLine(fen: string, maxPlies = 120, onProgress?: (n: number) => void): Promise<PerfectLine | null> {
  const c = new Chess(fen)
  const out: PerfectLine = { fens: [c.fen()], moves: [], dtm: [] }
  for (let i = 0; i < maxPlies; i++) {
    if (c.isGameOver()) break
    const tb = await probe(c.fen())
    if (!tb) return out.moves.length ? out : null
    out.dtm.push(tb.dtm)
    const m = perfectMove(tb)
    if (!m) break
    c.move({ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), promotion: m.uci[4] })
    out.moves.push({ uci: m.uci, san: m.san })
    out.fens.push(c.fen())
    onProgress?.(i + 1)
    // stop once a pawn has promoted in a "promote" study, or the position is a dead draw
    if (tb.category === 'draw' && i >= 40) break
  }
  out.dtm.push(c.isCheckmate() ? 0 : null)
  return out
}
