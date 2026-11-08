import { useSyncExternalStore } from 'react'
import { getProfile, liveStreak, onGameEvent } from './game'
import { weekXp } from './meta'

// Opt-in leaderboards (worker/board.ts). You pick a nickname and get a secret player key; the app
// posts a few numbers now and then. Nothing is shared until you join.

const KEY = 'ctt.board.v1'

export interface BoardState {
  id: string | null
  name: string | null
  key: string | null
  friends: string[]
  lastPost: number
  error?: string
}

function load(): BoardState {
  try {
    return { id: null, name: null, key: null, friends: [], lastPost: 0, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return { id: null, name: null, key: null, friends: [], lastPost: 0 }
  }
}
let state = load()
const subs = new Set<() => void>()
function set(patch: Partial<BoardState>) {
  state = { ...state, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify({ id: state.id, name: state.name, key: state.key, friends: state.friends, lastPost: state.lastPost }))
  } catch {
    /* ignore */
  }
  subs.forEach((f) => f())
}
export function useBoard(): BoardState {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => void subs.delete(f)
    },
    () => state,
  )
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let r: Response
  try {
    r = await fetch(`${import.meta.env.BASE_URL}api/board${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(state.key ? { Authorization: `Bearer ${state.key}` } : {}), ...(init.headers ?? {}) },
    })
  } catch {
    throw new Error("Couldn't reach the server — check your connection.")
  }
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `Server said ${r.status}`)
  return body as T
}

export async function join(name: string) {
  const r = await call<{ id: string; name: string; key: string }>('/join', { method: 'POST', body: JSON.stringify({ name: name.trim() }) })
  set({ id: r.id, name: r.name, key: r.key, error: undefined })
  await post(true)
}

/** Use your nickname on another device by pasting the player key from the first one. */
export async function link(key: string) {
  const k = key.trim()
  const prev = state.key
  state.key = k
  try {
    const r = await call<{ id: string; name: string }>('/me')
    set({ id: r.id, name: r.name, key: k, error: undefined })
    await post(true)
  } catch (e) {
    state.key = prev
    throw e
  }
}

export async function leave() {
  if (state.key) await call('/me', { method: 'DELETE' }).catch(() => {})
  set({ id: null, name: null, key: null, lastPost: 0 })
}

export function setFriends(friends: string[]) {
  set({ friends: [...new Set(friends.map((f) => f.trim()).filter((f) => /^[A-Za-z0-9_-]{3,20}$/.test(f)))].slice(0, 50) })
}

/** Post your numbers (throttled to once every 2 minutes unless forced). */
export async function post(force = false) {
  if (!state.key) return
  if (!force && Date.now() - state.lastPost < 120_000) return
  const p = getProfile()
  const gauntlet = Object.fromEntries(Object.entries(p.bests).filter(([k]) => k.startsWith('gauntlet:')).map(([k, v]) => [k.slice(9), v]))
  try {
    await call('/scores', {
      method: 'POST',
      body: JSON.stringify({ weekXp: weekXp(p), xp: p.xp, bosses: (p.sets.bosses ?? []).length, medals: Object.values(p.medals ?? {}).filter((t) => t > 0).length, streak: liveStreak(p), gauntlet }),
    })
    set({ lastPost: Date.now(), error: undefined })
  } catch (e) {
    const msg = (e as Error).message
    if (msg === 'Unknown player key') set({ id: null, name: null, key: null, error: 'Your leaderboard nickname was removed' })
    else set({ error: msg })
  }
}

export type BoardKind = 'week' | 'xp' | 'bosses' | 'streak' | 'gauntlet'
export interface BoardRow {
  rank: number
  name: string
  level: number
  score: number
  you: boolean
}
export interface BoardResult {
  kind: string
  total: number
  list: BoardRow[]
  you: { rank: number; score: number } | null
}

export function fetchBoard(kind: BoardKind, opts: { opening?: string; friends?: boolean } = {}) {
  const q = new URLSearchParams({ kind })
  if (opts.opening) q.set('opening', opts.opening)
  if (opts.friends) q.set('names', [...state.friends, ...(state.name ? [state.name] : [])].join(','))
  if (state.id) q.set('me', state.id)
  return call<BoardResult>(`?${q}`)
}

let started = false
/** Post on start, a couple of minutes after you earn XP, and when the tab is hidden. */
export function startBoardPosting() {
  if (started) return
  started = true
  let t: ReturnType<typeof setTimeout> | null = null
  const soon = (ms: number) => {
    if (!state.key) return
    if (t) clearTimeout(t)
    t = setTimeout(() => void post(), ms)
  }
  soon(3000)
  onGameEvent((e) => {
    if (e.kind === 'xp' || e.kind === 'achievement') soon(120_000)
  })
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void post())
}
