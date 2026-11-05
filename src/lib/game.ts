import { useSyncExternalStore } from 'react'

// Gamification: XP, levels, daily streaks, counters and achievements, persisted in localStorage.
// Modes call award()/count()/addToSet()/best(); the header and toasts subscribe via useProfile()/onGameEvent().

export interface Profile {
  xp: number
  daily: Record<string, number> // yyyy-mm-dd -> xp earned that day
  streak: number
  lastDay: string
  achievements: Record<string, number> // id -> unlocked timestamp
  counters: Record<string, number>
  sets: Record<string, string[]>
  bests: Record<string, number>
}

export type GameEvent = { kind: 'xp'; amount: number; label?: string } | { kind: 'achievement'; id: string } | { kind: 'level'; level: number }

const KEY = 'ctt.profile.v1'
export const DAILY_GOAL = 150

const empty = (): Profile => ({ xp: 0, daily: {}, streak: 0, lastDay: '', achievements: {}, counters: {}, sets: {}, bests: {} })

function load(): Profile {
  try {
    return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return empty()
  }
}

let profile = load()
const subs = new Set<() => void>()
const eventSubs = new Set<(e: GameEvent) => void>()

function commit() {
  profile = { ...profile }
  try {
    localStorage.setItem(KEY, JSON.stringify(profile))
  } catch {
    /* storage unavailable — progress lives for this tab only */
  }
  subs.forEach((f) => f())
}

function emit(e: GameEvent) {
  eventSubs.forEach((f) => f(e))
}

export function onGameEvent(f: (e: GameEvent) => void) {
  eventSubs.add(f)
  return () => void eventSubs.delete(f)
}

export function useProfile(): Profile {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => void subs.delete(f)
    },
    () => profile,
  )
}

// ───────────── levels ─────────────

const TITLES = ['Patzer', 'Beginner', 'Novice', 'Club Player', 'Tournament Player', 'Expert', 'Candidate Master', 'FIDE Master', 'International Master', 'Grandmaster', 'Super-GM', 'World Champion']

/** XP needed to go from `level` to `level + 1`. */
const step = (level: number) => 100 + (level - 1) * 60

export function levelInfo(xp: number) {
  let level = 1
  let floor = 0
  while (xp >= floor + step(level)) {
    floor += step(level)
    level++
  }
  const need = step(level)
  return { level, into: xp - floor, need, title: titleFor(level) }
}

export const titleFor = (level: number) => TITLES[Math.min(TITLES.length - 1, Math.floor((level - 1) / 3))]

// ───────────── days & streaks ─────────────

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function touchDay() {
  const today = dayKey()
  if (profile.lastDay === today) return
  const y = new Date()
  y.setDate(y.getDate() - 1)
  profile.streak = profile.lastDay === dayKey(y) ? profile.streak + 1 : 1
  profile.lastDay = today
}

/** The streak shown to the user: it lapses if yesterday and today were both missed. */
export function liveStreak(p: Profile) {
  const y = new Date()
  y.setDate(y.getDate() - 1)
  return p.lastDay === dayKey() || p.lastDay === dayKey(y) ? p.streak : 0
}

export const todayXp = (p: Profile) => p.daily[dayKey()] ?? 0

export function lastDays(p: Profile, n: number) {
  const out: { day: string; xp: number }[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    out.push({ day: dayKey(d), xp: p.daily[dayKey(d)] ?? 0 })
  }
  return out
}

// ───────────── mutations ─────────────

export function award(amount: number, label?: string) {
  amount = Math.round(amount)
  if (amount <= 0) return
  const before = levelInfo(profile.xp).level
  touchDay()
  profile.xp += amount
  profile.daily = { ...profile.daily, [dayKey()]: (profile.daily[dayKey()] ?? 0) + amount }
  emit({ kind: 'xp', amount, label })
  const after = levelInfo(profile.xp).level
  if (after > before) emit({ kind: 'level', level: after })
  checkAchievements()
  commit()
}

export function count(name: string, n = 1) {
  profile.counters = { ...profile.counters, [name]: (profile.counters[name] ?? 0) + n }
  checkAchievements()
  commit()
}

/** Keep the maximum value seen for a counter (e.g. best combo). */
export function record(name: string, value: number) {
  if (value <= (profile.counters[name] ?? 0)) return
  profile.counters = { ...profile.counters, [name]: value }
  checkAchievements()
  commit()
}

export function addToSet(name: string, id: string) {
  const cur = profile.sets[name] ?? []
  if (cur.includes(id)) return false
  profile.sets = { ...profile.sets, [name]: [...cur, id] }
  checkAchievements()
  commit()
  return true
}

/** Store a personal best; returns true if it's a new best. */
export function best(name: string, score: number) {
  if (score <= (profile.bests[name] ?? 0)) return false
  profile.bests = { ...profile.bests, [name]: score }
  checkAchievements()
  commit()
  return true
}

export function resetProfile() {
  profile = empty()
  commit()
}

// ───────────── achievements ─────────────

/** Content sizes the achievements compare against; set once at startup from the data files. */
const totals = { puzzles: Infinity, mates: Infinity, endgames: Infinity, gambits: [] as string[] }
export function configureTotals(t: Partial<typeof totals>) {
  Object.assign(totals, t)
}

export interface Achievement {
  id: string
  name: string
  desc: string
  icon: string
  test: (p: Profile) => boolean
}

const c = (p: Profile, k: string) => p.counters[k] ?? 0
const s = (p: Profile, k: string) => (p.sets[k] ?? []).length

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-line', name: 'First Blood', desc: 'Complete a practice line', icon: '🩸', test: (p) => c(p, 'lines') >= 1 },
  { id: 'lines-25', name: 'Theory Nerd', desc: 'Complete 25 practice lines', icon: '📚', test: (p) => c(p, 'lines') >= 25 },
  { id: 'lines-100', name: 'Walking Encyclopedia', desc: 'Complete 100 practice lines', icon: '🧠', test: (p) => c(p, 'lines') >= 100 },
  { id: 'flawless-10', name: 'Flawless', desc: 'Finish 10 lines without a single mistake', icon: '💎', test: (p) => c(p, 'flawless') >= 10 },
  { id: 'combo-10', name: 'On Fire', desc: 'Reach a 10-move combo', icon: '🔥', test: (p) => c(p, 'bestCombo') >= 10 },
  { id: 'combo-30', name: 'Unstoppable', desc: 'Reach a 30-move combo', icon: '⚡', test: (p) => c(p, 'bestCombo') >= 30 },
  { id: 'explorer', name: 'Explorer', desc: 'Study lines in 10 different openings', icon: '🧭', test: (p) => s(p, 'openingsStudied') >= 10 },
  { id: 'master-1', name: 'Specialist', desc: 'Master every decision in an opening', icon: '🎓', test: (p) => s(p, 'openingsMastered') >= 1 },
  { id: 'gambiteer', name: 'Gambiteer', desc: 'Master 3 gambits', icon: '♞', test: (p) => (p.sets.openingsMastered ?? []).filter((id) => totals.gambits.includes(id)).length >= 3 },
  { id: 'both-sides', name: 'Know Thy Enemy', desc: 'Complete a line from the "Face it" side', icon: '🪞', test: (p) => c(p, 'flippedLines') >= 1 },
  { id: 'trap-1', name: 'Trapper', desc: 'Solve a trap puzzle', icon: '🪤', test: (p) => s(p, 'puzzles') >= 1 },
  { id: 'trap-all', name: 'Trap Master', desc: 'Solve every trap puzzle', icon: '🏴‍☠️', test: (p) => s(p, 'puzzles') >= totals.puzzles },
  { id: 'endgame-1', name: 'Endgame Apprentice', desc: 'Solve an endgame', icon: '♔', test: (p) => s(p, 'endgames') >= 1 },
  { id: 'mates', name: 'Mate Artist', desc: 'Solve every checkmate endgame', icon: '#️⃣', test: (p) => (p.sets.endgames ?? []).filter((id) => id.startsWith('mate-')).length >= totals.mates },
  { id: 'defender', name: 'Fortress Builder', desc: 'Hold 3 defensive endgames', icon: '🏰', test: (p) => c(p, 'drawsHeld') >= 3 },
  { id: 'endgame-all', name: 'Endgame Virtuoso', desc: 'Solve every endgame', icon: '👑', test: (p) => s(p, 'endgames') >= totals.endgames },
  { id: 'coords-20', name: 'Board Sense', desc: 'Score 20+ in the coordinates drill', icon: '🎯', test: (p) => (p.bests.coords ?? 0) >= 20 },
  { id: 'coords-35', name: 'Sniper', desc: 'Score 35+ in the coordinates drill', icon: '🏹', test: (p) => (p.bests.coords ?? 0) >= 35 },
  { id: 'knight-10', name: 'Knight Rider', desc: 'Find 10 optimal knight routes in one run', icon: '🐴', test: (p) => (p.bests.knight ?? 0) >= 10 },
  { id: 'vision-15', name: 'Eagle Eye', desc: 'Score 15+ in the counting drill', icon: '🦅', test: (p) => (p.bests.count ?? 0) >= 15 },
  { id: 'blind-line', name: 'Blindfold Master', desc: 'Complete a practice line blindfolded', icon: '🙈', test: (p) => c(p, 'blindLines') >= 1 },
  { id: 'blind-endgame', name: 'Koltanowski', desc: 'Solve an endgame blindfolded', icon: '🕶️', test: (p) => c(p, 'blindEndgames') >= 1 },
  { id: 'review-1', name: 'Daily Grind', desc: 'Finish a daily review', icon: '↻', test: (p) => c(p, 'reviews') >= 1 },
  { id: 'review-10', name: 'Spaced Out', desc: 'Finish 10 daily reviews', icon: '🧘', test: (p) => c(p, 'reviews') >= 10 },
  { id: 'own-10', name: 'Learning From Myself', desc: 'Fix 10 mistakes from your own games', icon: '🔁', test: (p) => s(p, 'ownPuzzles') >= 10 },
  { id: 'mates-6', name: 'Pattern Recognition', desc: 'Learn 6 mating patterns', icon: '♚', test: (p) => s(p, 'mates') >= 6 },
  { id: 'calc-15', name: 'Calculator', desc: 'Score 15+ in Calculate it', icon: '🧠', test: (p) => (p.bests.calc ?? 0) >= 15 },
  { id: 'notation-20', name: 'Fluent', desc: 'Name 20 moves in a minute', icon: '✍️', test: (p) => (p.bests.notation ?? 0) >= 20 },
  { id: 'streak-3', name: 'Habit Forming', desc: 'Train 3 days in a row', icon: '📅', test: (p) => p.streak >= 3 },
  { id: 'streak-7', name: 'Week Warrior', desc: 'Train 7 days in a row', icon: '🗓️', test: (p) => p.streak >= 7 },
  { id: 'streak-30', name: 'Iron Will', desc: 'Train 30 days in a row', icon: '🏆', test: (p) => p.streak >= 30 },
  { id: 'goal-1', name: 'Goal Getter', desc: `Hit the daily goal (${DAILY_GOAL} XP)`, icon: '✅', test: (p) => Object.values(p.daily).some((x) => x >= DAILY_GOAL) },
  { id: 'level-10', name: 'Rising Star', desc: 'Reach level 10', icon: '⭐', test: (p) => levelInfo(p.xp).level >= 10 },
  { id: 'level-25', name: 'Titled Player', desc: 'Reach level 25', icon: '🌟', test: (p) => levelInfo(p.xp).level >= 25 },
]

function checkAchievements() {
  for (const a of ACHIEVEMENTS) {
    if (profile.achievements[a.id] || !a.test(profile)) continue
    profile.achievements = { ...profile.achievements, [a.id]: Date.now() }
    emit({ kind: 'achievement', id: a.id })
    // achievements give a little XP too (without recursing through award)
    profile.xp += 50
    profile.daily = { ...profile.daily, [dayKey()]: (profile.daily[dayKey()] ?? 0) + 50 }
  }
}
