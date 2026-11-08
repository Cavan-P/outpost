import { Chess } from 'chess.js'
import { useSyncExternalStore } from 'react'

// Your own games: imported from Lichess / chess.com (public APIs, no login) or pasted PGN,
// stored in localStorage together with their engine analysis.

export type Score = { cp?: number; mate?: number } // White's point of view

export interface MoveAnalysis {
  ply: number // 1-based
  san: string
  uci: string
  before: Score // eval of the position before this move
  after: Score // eval after it
  best: string // engine's best move (UCI) in the position before
  bestSan: string
  pv: string[] // engine line from the position before (UCI)
  reply: string[] // engine line from the position after (the opponent's best answer)
  loss: number // winning chances lost by the mover, 0..1
  cls: 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'
  tags: string[]
}

export interface GameAnalysis {
  /** labelling rules version; older analyses are relabelled from their stored evals */
  version?: number
  depth: number
  moves: MoveAnalysis[]
  accuracy: { w: number; b: number }
}

export interface ImportedGame {
  id: string
  source: 'lichess' | 'chess.com' | 'pgn'
  url?: string
  white: string
  black: string
  userColor: 'w' | 'b'
  result: '1-0' | '0-1' | '1/2-1/2' | '*'
  date: number
  speed?: string
  opening?: string
  eco?: string
  sans: string[]
  /** set for positions that didn't start from the initial position (graded play-outs) */
  startFen?: string
  analysis?: GameAnalysis
  /** someone else's game, imported just to look at: kept out of your report, puzzles and review */
  notMine?: boolean
}

/** The games that are really yours — the only ones that feed the report, mistake puzzles and daily review. */
export const myGames = (games: ImportedGame[]) => games.filter((g) => !g.notMine)

interface Store {
  username: string
  source: ImportedGame['source']
  games: ImportedGame[]
}

const KEY = 'ctt.games.v1'
let store: Store = load()
const subs = new Set<() => void>()

function load(): Store {
  try {
    return { username: '', source: 'lichess', games: [], ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return { username: '', source: 'lichess', games: [] }
  }
}

function commit() {
  store = { ...store }
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    /* quota exceeded — keep in memory */
  }
  subs.forEach((f) => f())
}

export function useGames(): Store {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => void subs.delete(f)
    },
    () => store,
  )
}

export const getGames = () => store

/** Re-read from storage (after a sync) and re-render. */
export function reloadGames() {
  store = load()
  subs.forEach((f) => f())
}

export function addGames(username: string, source: Store['source'], games: ImportedGame[], notMine = false) {
  const known = new Set(store.games.map((g) => g.id))
  // importing someone else's games shouldn't overwrite the username you use for your own
  if (!notMine) {
    store.username = username
    store.source = source
  }
  store.games = [...store.games, ...games.filter((g) => !known.has(g.id)).map((g) => (notMine ? { ...g, notMine: true } : g))].sort((a, b) => b.date - a.date)
  commit()
  return games.filter((g) => !known.has(g.id)).length
}

export function saveAnalysis(id: string, analysis: GameAnalysis) {
  store.games = store.games.map((g) => (g.id === id ? { ...g, analysis } : g))
  commit()
}

export function setNotMine(id: string, notMine: boolean) {
  store.games = store.games.map((g) => (g.id === id ? { ...g, notMine } : g))
  commit()
}

export function clearGames() {
  store = { ...store, games: [] }
  commit()
}

export function removeGame(id: string) {
  store.games = store.games.filter((g) => g.id !== id)
  commit()
}

// ───────────── importers ─────────────

const norm = (s: string) => s.trim().toLowerCase()

/** Only plain web links survive — a PGN header could otherwise smuggle in a `javascript:` URL. */
export function safeUrl(u: string | undefined): string | undefined {
  if (!u) return undefined
  try {
    const url = new URL(u)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
  } catch {
    return undefined
  }
}

export async function fetchLichess(username: string, max: number): Promise<ImportedGame[]> {
  const res = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=${max}&opening=true&moves=true&perfType=ultraBullet,bullet,blitz,rapid,classical,correspondence`, {
    headers: { Accept: 'application/x-ndjson' },
  })
  if (res.status === 404) throw new Error(`No Lichess user called "${username}".`)
  if (!res.ok) throw new Error(`Lichess said ${res.status}. Try again in a minute.`)
  const text = await res.text()
  const out: ImportedGame[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const g = JSON.parse(line)
    if (g.variant !== 'standard' || g.initialFen || !g.moves) continue
    const white = g.players?.white?.user?.name ?? 'Anonymous'
    const black = g.players?.black?.user?.name ?? 'Anonymous'
    out.push({
      id: `li:${g.id}`,
      source: 'lichess',
      url: `https://lichess.org/${g.id}`,
      white,
      black,
      userColor: norm(black) === norm(username) ? 'b' : 'w',
      result: g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : g.status === 'started' ? '*' : '1/2-1/2',
      date: g.createdAt,
      speed: g.speed,
      opening: g.opening?.name,
      eco: g.opening?.eco,
      sans: String(g.moves).split(' ').filter(Boolean),
    })
  }
  return out
}

export async function fetchChessCom(username: string, max: number): Promise<ImportedGame[]> {
  const user = norm(username)
  const arch = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/archives`)
  if (arch.status === 404) throw new Error(`No chess.com user called "${username}".`)
  if (!arch.ok) throw new Error(`chess.com said ${arch.status}. Try again in a minute.`)
  const { archives } = (await arch.json()) as { archives: string[] }
  const out: ImportedGame[] = []
  for (const url of [...archives].reverse()) {
    if (out.length >= max) break
    if (!url.startsWith('https://api.chess.com/')) continue // only follow chess.com's own archive links
    const month = await fetch(url)
    if (!month.ok) continue
    const { games } = (await month.json()) as { games: Record<string, any>[] }
    for (const g of [...games].reverse()) {
      if (out.length >= max) break
      if (g.rules !== 'chess' || !g.pgn) continue
      const parsed = parsePgnGame(g.pgn, user)
      if (!parsed) continue
      out.push({ ...parsed, id: `cc:${g.uuid ?? g.url}`, source: 'chess.com', url: g.url, speed: g.time_class, date: (g.end_time ?? 0) * 1000 })
    }
  }
  return out
}

/** Parse one PGN game; `username` decides which side is "you" (falls back to White). */
export function parsePgnGame(pgn: string, username?: string): Omit<ImportedGame, 'id' | 'source'> | null {
  const c = new Chess()
  try {
    c.loadPgn(pgn)
  } catch {
    return null
  }
  const h = c.getHeaders()
  if (h.SetUp === '1' || (h.Variant && h.Variant !== 'Standard')) return null
  const white = h.White ?? 'White'
  const black = h.Black ?? 'Black'
  const date = Date.parse((h.UTCDate ?? h.Date ?? '').replace(/\./g, '-')) || 0
  const result = (['1-0', '0-1', '1/2-1/2'].includes(h.Result ?? '') ? h.Result : '*') as ImportedGame['result']
  const opening = h.Opening ?? (h.ECOUrl ? decodeURIComponent(h.ECOUrl.split('/').pop() ?? '').replace(/-/g, ' ') : undefined)
  return {
    white,
    black,
    userColor: username && norm(black) === norm(username) ? 'b' : 'w',
    result,
    date,
    opening,
    eco: h.ECO,
    url: safeUrl(h.Link) ?? safeUrl(h.Site),
    sans: c.history(),
  }
}

/** Split pasted text into PGN games and parse them; the most frequent player name is assumed to be you. */
export function parsePgnText(text: string, username?: string): ImportedGame[] {
  const chunks = text
    .split(/\n\s*\n(?=\[Event )/)
    .map((t) => t.trim())
    .filter(Boolean)
  let me = username?.trim()
  if (!me) {
    const counts = new Map<string, number>()
    for (const ch of chunks) for (const m of ch.matchAll(/\[(White|Black) "([^"]+)"\]/g)) counts.set(m[2], (counts.get(m[2]) ?? 0) + 1)
    me = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
  }
  const out: ImportedGame[] = []
  chunks.forEach((ch, i) => {
    const g = parsePgnGame(ch, me)
    if (g && g.sans.length) out.push({ ...g, id: `pgn:${hash(ch)}:${i}`, source: 'pgn' })
  })
  return out
}

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

export const userResult = (g: ImportedGame): 'win' | 'loss' | 'draw' | '?' =>
  g.result === '*' ? '?' : g.result === '1/2-1/2' ? 'draw' : (g.result === '1-0') === (g.userColor === 'w') ? 'win' : 'loss'
