// Per-opening practice stats in localStorage. Keyed by tree node id (the SAN path).
//
// Each decision (a position where you must find the book move) lives in a spaced-repetition box.
// A correct answer only moves it up a box once the waiting time for its current box has passed,
// so mastery takes several sessions spread over days. Mistakes and hints knock it back down.

export interface NodeStat {
  correct: number
  wrong: number
  streak: number // consecutive correct answers
  last: number // timestamp of the last answer
  box?: number // 0..5 spaced-repetition box
  due?: number // when the next promotion becomes possible
}

export interface OpeningProgress {
  nodes: Record<string, NodeStat>
  learned: string[] // leaf ids walked through in Learn mode
}

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
/** How long to wait after reaching box n before a correct answer can promote again. */
const WAIT = [0, 5 * MIN, HOUR, DAY, 3 * DAY, 7 * DAY]
export const MASTERED_BOX = 4

export type Stage = 'new' | 'learning' | 'familiar' | 'mastered'
export const STAGES: { id: Stage; label: string; color: string }[] = [
  { id: 'mastered', label: 'Mastered', color: 'bg-emerald-500' },
  { id: 'familiar', label: 'Familiar', color: 'bg-sky-500' },
  { id: 'learning', label: 'Learning', color: 'bg-amber-500' },
  { id: 'new', label: 'New', color: 'bg-zinc-700' },
]

/** Older saves only tracked a streak; treat it as partial progress. */
const boxOf = (s?: NodeStat) => (!s ? 0 : (s.box ?? Math.min(s.streak, 2)))

export function stageOf(s?: NodeStat): Stage {
  const b = boxOf(s)
  if (!s) return 'new'
  if (b === 0) return s.correct + s.wrong > 0 ? 'learning' : 'new'
  return b >= MASTERED_BOX ? 'mastered' : b >= 3 ? 'familiar' : 'learning'
}

export const isDue = (s: NodeStat | undefined, now = Date.now()) => !s || now >= (s.due ?? 0)
export const isMastered = (s?: NodeStat) => boxOf(s) >= MASTERED_BOX

/** 0..1 — how far along a decision is (its box out of the mastery box). */
export const progressOf = (s?: NodeStat) => Math.min(boxOf(s), MASTERED_BOX) / MASTERED_BOX

export type Outcome = 'correct' | 'wrong' | 'hinted'

const KEY = 'ctt.progress.v1'

type Store = Record<string, OpeningProgress>

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable — progress just won't persist */
  }
}

export function getProgress(openingId: string): OpeningProgress {
  const p = load<Store>(KEY, {})[openingId]
  return { nodes: p?.nodes ?? {}, learned: p?.learned ?? [] }
}

function update(openingId: string, fn: (p: OpeningProgress) => void) {
  const store = load<Store>(KEY, {})
  const p = { nodes: store[openingId]?.nodes ?? {}, learned: store[openingId]?.learned ?? [] }
  fn(p)
  store[openingId] = p
  save(KEY, store)
}

/** Records an answer and reports the decision's stage before and after. */
export function recordAnswer(openingId: string, nodeId: string, outcome: Outcome): { before: Stage; after: Stage; promoted: boolean } {
  let result = { before: 'new' as Stage, after: 'new' as Stage, promoted: false }
  update(openingId, (p) => {
    const prev = p.nodes[nodeId]
    const now = Date.now()
    const s: NodeStat = { ...(prev ?? { correct: 0, wrong: 0, streak: 0, last: 0 }), box: boxOf(prev) }
    let box = s.box!
    let promoted = false
    if (outcome === 'correct') {
      s.correct++
      s.streak++
      if (isDue(s, now) && box < WAIT.length - 1) {
        box++
        s.due = now + WAIT[box]
        promoted = true
      }
    } else {
      s.wrong++
      s.streak = 0
      // a miss drops a known move back to "learning"; a hint caps it there too
      box = outcome === 'hinted' ? Math.min(box, 1) : Math.max(0, Math.min(box - 2, 1))
      s.due = now
    }
    s.box = box
    s.last = now
    p.nodes[nodeId] = s
    result = { before: stageOf(prev), after: stageOf(s), promoted }
  })
  return result
}

export function markLearned(openingId: string, leafId: string) {
  update(openingId, (p) => {
    if (!p.learned.includes(leafId)) p.learned.push(leafId)
  })
}

export function resetProgress(openingId: string) {
  const store = load<Store>(KEY, {})
  delete store[openingId]
  save(KEY, store)
}

/** Human-friendly "in 4 min" / "in 2 h" / "in 3 days". */
export function untilText(ms: number) {
  if (ms <= 0) return 'now'
  if (ms < HOUR) return `in ${Math.ceil(ms / MIN)} min`
  if (ms < DAY) return `in ${Math.round(ms / HOUR)} h`
  return `in ${Math.round(ms / DAY)} day${ms >= 1.5 * DAY ? 's' : ''}`
}
