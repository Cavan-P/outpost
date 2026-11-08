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

const WEEK = 7 * DAY

/**
 * The box a decision is effectively in. Knowledge fades: for every full week a decision sits
 * overdue it slips a box (never below 1), so a mastered opening you ignore for a month goes back
 * to "familiar" and has to be re-earned. Older saves only tracked a streak; treat it as partial progress.
 */
export function boxOf(s?: NodeStat, now = Date.now()) {
  if (!s) return 0
  const box = s.box ?? Math.min(s.streak, 2)
  if (box <= 1 || !s.due) return box
  const weeksOverdue = Math.floor((now - s.due) / WEEK)
  return weeksOverdue > 0 ? Math.max(1, box - weeksOverdue) : box
}

/** Whether a decision has slipped since you last reached its box (shown as "fading"). */
export const isFading = (s?: NodeStat, now = Date.now()) => !!s && boxOf(s, now) < (s.box ?? 0)

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
export interface AnswerResult {
  before: Stage
  after: Stage
  promoted: boolean
  /** first time this decision was ever answered */
  fresh: boolean
  /** the box it moved to */
  box: number
}

export function recordAnswer(openingId: string, nodeId: string, outcome: Outcome): AnswerResult {
  let result: AnswerResult = { before: 'new', after: 'new', promoted: false, fresh: false, box: 0 }
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
    result = { before: stageOf(prev), after: stageOf(s), promoted, fresh: !prev || prev.correct + prev.wrong === 0, box }
  })
  return result
}

// ───────────── medals ─────────────

/** 0 none · 1 Bronze · 2 Silver · 3 Gold · 4 Diamond */
export type MedalTier = 0 | 1 | 2 | 3 | 4

/**
 * An opening's medal, from its decisions (the positions where you must find the move):
 * Bronze — every one answered at least once · Silver — half are Familiar or better ·
 * Gold — 90% Familiar+ and half Mastered · Diamond — all Mastered.
 * Because boxes fade when overdue, medals can be lost (and re-earned) — they reflect what you know now.
 */
export function medalOf(decisionIds: string[], p: OpeningProgress, now = Date.now()): MedalTier {
  const n = decisionIds.length
  if (!n) return 0
  let seen = 0
  let familiar = 0
  let mastered = 0
  for (const id of decisionIds) {
    const s = p.nodes[id]
    if (!s || s.correct + s.wrong === 0) continue
    seen++
    const b = boxOf(s, now)
    if (b >= 3) familiar++
    if (b >= MASTERED_BOX) mastered++
  }
  if (mastered === n) return 4
  if (familiar >= 0.9 * n && mastered >= 0.5 * n) return 3
  if (familiar >= 0.5 * n) return 2
  if (seen === n) return 1
  return 0
}

/** What the next medal needs, in words. */
export function nextMedalHint(decisionIds: string[], p: OpeningProgress, now = Date.now()): string {
  const n = decisionIds.length
  const tier = medalOf(decisionIds, p, now)
  const stat = (min: number) => decisionIds.filter((id) => p.nodes[id] && boxOf(p.nodes[id], now) >= min).length
  const seen = decisionIds.filter((id) => p.nodes[id] && p.nodes[id].correct + p.nodes[id].wrong > 0).length
  if (tier === 0) return `Bronze: answer every position once (${seen}/${n})`
  if (tier === 1) return `Silver: half the positions Familiar (${stat(3)}/${Math.ceil(n / 2)})`
  if (tier === 2) return `Gold: 90% Familiar (${stat(3)}/${Math.ceil(0.9 * n)}) and half Mastered (${stat(MASTERED_BOX)}/${Math.ceil(n / 2)})`
  if (tier === 3) return `Diamond: every position Mastered (${stat(MASTERED_BOX)}/${n})`
  return 'Diamond — keep reviewing so it doesn\'t fade'
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
