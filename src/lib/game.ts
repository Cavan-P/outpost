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
  /** streak freezes in the bank (earned by finishing all daily quests, max 2) */
  freezes: number
  /** today's quest progress and per-source XP (for diminishing returns); reset each day */
  today: { day: string; counts: Record<string, number>; done: string[]; xpBySource: Record<string, number>; quests?: string[] }
  /** highest medal ever reached per opening, so medal XP is paid once */
  medals: Record<string, number>
}

export type GameEvent =
  | { kind: 'xp'; amount: number; label?: string }
  | { kind: 'achievement'; id: string }
  | { kind: 'level'; level: number }
  | { kind: 'quest'; text: string; xp: number }
  | { kind: 'freeze'; text: string }
  | { kind: 'medal'; name: string; opening: string; xp: number }

const KEY = 'ctt.profile.v1'
export const DAILY_GOAL = 120

const empty = (): Profile => ({ xp: 0, daily: {}, streak: 0, lastDay: '', achievements: {}, counters: {}, sets: {}, bests: {}, freezes: 0, today: { day: '', counts: {}, done: [], xpBySource: {} }, medals: {} })

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

export const getProfile = () => profile

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

export const MAX_LEVEL = 100

// 20 titles × 5 steps each ("Club Player III"); level 100 is World Champion.
const TITLES = [
  'Patzer', 'Beginner', 'Novice', 'Casual', 'Hobbyist',
  'Club Player', 'Club Regular', 'Club Champion', 'Tournament Player', 'Rated Player',
  'Class C', 'Class B', 'Class A', 'Expert', 'Candidate Master',
  'FIDE Master', 'International Master', 'Grandmaster', 'Super-GM', 'World Champion',
]
const ROMAN = ['I', 'II', 'III', 'IV', 'V']

/** XP needed to go from `level` to `level + 1` — gently steeper as you climb (≈290k XP to reach 100). */
export const step = (level: number) => Math.round(80 + 25 * Math.pow(level, 1.2))

export function levelInfo(xp: number) {
  let level = 1
  let floor = 0
  while (level < MAX_LEVEL && xp >= floor + step(level)) {
    floor += step(level)
    level++
  }
  const need = level >= MAX_LEVEL ? 1 : step(level)
  return { level, into: level >= MAX_LEVEL ? 1 : xp - floor, need, title: titleFor(level) }
}

export function titleFor(level: number) {
  if (level >= MAX_LEVEL) return TITLES[TITLES.length - 1]
  const tier = Math.floor((level - 1) / 5)
  return `${TITLES[Math.min(tier, TITLES.length - 1)]} ${ROMAN[(level - 1) % 5]}`
}

// ───────────── days & streaks ─────────────

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Whole days between two yyyy-mm-dd keys. */
function daysBetween(a: string, b: string) {
  const [ya, ma, da] = a.split('-').map(Number)
  const [yb, mb, db] = b.split('-').map(Number)
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000)
}

/** Days you missed since you last trained (not counting today). */
const missedDays = (p: Profile) => (p.lastDay ? Math.max(0, daysBetween(p.lastDay, dayKey()) - 1) : 0)

function touchDay() {
  const today = dayKey()
  if (profile.lastDay === today) return
  const missed = missedDays(profile)
  if (!profile.lastDay) profile.streak = 1
  else if (missed === 0) profile.streak += 1
  else if (missed <= profile.freezes) {
    // streak freezes cover the gap
    profile.freezes -= missed
    profile.streak += 1
    emit({ kind: 'freeze', text: `${missed === 1 ? 'A streak freeze' : `${missed} streak freezes`} saved your ${profile.streak - 1}-day streak` })
  } else profile.streak = 1
  profile.lastDay = today
}

/** The streak shown to the user: it survives missed days only while you have freezes to cover them. */
export function liveStreak(p: Profile) {
  if (!p.lastDay) return 0
  return missedDays(p) <= p.freezes ? p.streak : 0
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

/** Today's bucket (quest progress, XP per source), started fresh each day. */
function today() {
  if (profile.today?.day !== dayKey()) profile.today = { day: dayKey(), counts: {}, done: [], xpBySource: {} }
  return profile.today
}

/**
 * Give XP. With a `source` (e.g. "opening:italian", "drill:coords") repeated XP from the same thing on
 * the same day tapers off — after 120 XP it's worth half, after 360 a quarter — so grinding one
 * opening all day is less rewarding than spreading out.
 */
export function award(amount: number, label?: string, source?: string) {
  if (source && amount > 0) {
    const t = today()
    const earned = t.xpBySource[source] ?? 0
    amount = Math.max(1, amount / (1 + earned / 120))
    t.xpBySource = { ...t.xpBySource, [source]: earned + amount }
  }
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
  const t = today()
  t.counts = { ...t.counts, [name]: (t.counts[name] ?? 0) + n }
  checkQuests()
  checkAchievements()
  commit()
}

// ───────────── daily quests ─────────────

export interface Quest {
  id: string
  text: string
  counter: string // a count() name; progress is today's total
  target: number
  xp: number
  available?: () => boolean
}

export const QUESTS: Quest[] = [
  { id: 'due-10', text: 'Answer 10 positions that are due for review', counter: 'dueCorrect', target: 10, xp: 40 },
  { id: 'due-25', text: 'Answer 25 due positions', counter: 'dueCorrect', target: 25, xp: 70 },
  { id: 'learn-1', text: 'Study a line you haven\'t seen before', counter: 'linesLearned', target: 1, xp: 30 },
  { id: 'new-5', text: 'Get 5 brand-new positions right', counter: 'newCorrect', target: 5, xp: 40 },
  { id: 'lines-3', text: 'Complete 3 practice lines', counter: 'lines', target: 3, xp: 30 },
  { id: 'flawless-2', text: 'Finish 2 lines without a mistake', counter: 'flawless', target: 2, xp: 40 },
  { id: 'traps-3', text: 'Solve 3 trap puzzles', counter: 'trapSolves', target: 3, xp: 30 },
  { id: 'endgame-1', text: 'Solve an endgame', counter: 'endgameSolves', target: 1, xp: 40 },
  { id: 'review-1', text: 'Finish the daily review', counter: 'reviews', target: 1, xp: 40, available: () => totals.hasDue() },
  { id: 'mates-2', text: 'Deliver 2 mating patterns', counter: 'mateSolves', target: 2, xp: 25 },
  { id: 'own-2', text: 'Fix 2 mistakes from your own games', counter: 'ownSolves', target: 2, xp: 45, available: () => totals.hasGameAnalysis() },
  { id: 'drill-3', text: 'Play 3 vision drills', counter: 'drills', target: 3, xp: 30 },
  { id: 'blind-1', text: 'Complete a line blindfolded', counter: 'blindLines', target: 1, xp: 50 },
  { id: 'combo-10', text: 'Reach a 10-move combo in Practice', counter: 'combo10', target: 1, xp: 35 },
  { id: 'playout-1', text: 'Get a play-out graded', counter: 'playouts', target: 1, xp: 30 },
]

const hashDay = (d: string) => [...d].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7)

/** Today's three quests — picked once in the morning and kept all day, different tomorrow. */
export function todaysQuests(): Quest[] {
  const t = today()
  if (!t.quests?.length) t.quests = pickQuests().map((q) => q.id)
  return t.quests.map((id) => QUESTS.find((q) => q.id === id)).filter((q): q is Quest => !!q)
}

function pickQuests(): Quest[] {
  const pool = QUESTS.filter((q) => !q.available || q.available())
  let h = Math.abs(hashDay(dayKey()))
  const picked: Quest[] = []
  while (picked.length < 3 && pool.length) {
    const q = pool.splice(h % pool.length, 1)[0]
    // don't pair two quests that count the same thing
    if (!picked.some((x) => x.counter === q.counter)) picked.push(q)
    h = Math.abs((h * 1103515245 + 12345) | 0)
  }
  return picked
}

export function questProgress(p: Profile, q: Quest) {
  const t: { counts: Record<string, number>; done: string[] } = p.today?.day === dayKey() ? p.today : { counts: {}, done: [] }
  return { value: Math.min(q.target, t.counts[q.counter] ?? 0), done: t.done.includes(q.id) }
}

function checkQuests() {
  const t = today()
  const quests = todaysQuests()
  for (const q of quests) {
    if (t.done.includes(q.id) || (t.counts[q.counter] ?? 0) < q.target) continue
    t.done = [...t.done, q.id]
    grant(q.xp)
    emit({ kind: 'quest', text: q.text, xp: q.xp })
    if (quests.every((x) => t.done.includes(x.id))) {
      grant(50)
      if (profile.freezes < 2) {
        profile.freezes += 1
        emit({ kind: 'freeze', text: 'All quests done: +50 XP and a streak freeze' })
      } else emit({ kind: 'freeze', text: 'All quests done: +50 XP' })
      profile.counters = { ...profile.counters, questDays: (profile.counters.questDays ?? 0) + 1 }
    }
  }
}

/** Add XP without the source/label machinery (quests, medals, achievements). */
function grant(xp: number) {
  const before = levelInfo(profile.xp).level
  touchDay()
  profile.xp += xp
  profile.daily = { ...profile.daily, [dayKey()]: (profile.daily[dayKey()] ?? 0) + xp }
  const after = levelInfo(profile.xp).level
  if (after > before) emit({ kind: 'level', level: after })
}

// ───────────── opening medals ─────────────

export const MEDALS = [
  { tier: 1, name: 'Bronze', xp: 60, color: '#c08457' },
  { tier: 2, name: 'Silver', xp: 120, color: '#c7ccd1' },
  { tier: 3, name: 'Gold', xp: 250, color: '#d4b06a' },
  { tier: 4, name: 'Diamond', xp: 500, color: '#9fd8ff' },
]

/** Pays the medal bonus the first time an opening reaches a tier (decaying and re-earning pays nothing). */
export function reachMedal(openingId: string, name: string, tier: number) {
  const prev = profile.medals?.[openingId] ?? 0
  if (tier <= prev) return
  profile.medals = { ...profile.medals, [openingId]: tier }
  for (const m of MEDALS) if (m.tier > prev && m.tier <= tier) {
    grant(m.xp)
    emit({ kind: 'medal', name: m.name, opening: name, xp: m.xp })
  }
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
const totals = { puzzles: Infinity, mates: Infinity, endgames: Infinity, gambits: [] as string[], hasDue: () => true, hasGameAnalysis: () => false }
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
  { id: 'level-50', name: 'Master Class', desc: 'Reach level 50', icon: '🎖️', test: (p) => levelInfo(p.xp).level >= 50 },
  { id: 'level-100', name: 'World Champion', desc: 'Reach level 100', icon: '🏆', test: (p) => levelInfo(p.xp).level >= MAX_LEVEL },
  { id: 'medal-bronze', name: 'On the Podium', desc: 'Earn a Bronze medal in any opening', icon: '🥉', test: (p) => Object.values(p.medals ?? {}).some((t) => t >= 1) },
  { id: 'medal-gold', name: 'Golden Repertoire', desc: 'Earn a Gold medal in any opening', icon: '🥇', test: (p) => Object.values(p.medals ?? {}).some((t) => t >= 3) },
  { id: 'medal-diamond', name: 'Flawless Theory', desc: 'Earn a Diamond medal in any opening', icon: '💠', test: (p) => Object.values(p.medals ?? {}).some((t) => t >= 4) },
  { id: 'medal-5', name: 'Well Prepared', desc: 'Earn medals in 5 different openings', icon: '🏅', test: (p) => Object.values(p.medals ?? {}).filter((t) => t >= 1).length >= 5 },
  { id: 'quests-1', name: 'Quest Giver', desc: 'Finish all three daily quests', icon: '📜', test: (p) => c(p, 'questDays') >= 1 },
  { id: 'quests-14', name: 'Fortnight of Focus', desc: 'Finish all daily quests on 14 days', icon: '🗺️', test: (p) => c(p, 'questDays') >= 14 },
]

function checkAchievements() {
  for (const a of ACHIEVEMENTS) {
    if (profile.achievements[a.id] || !a.test(profile)) continue
    profile.achievements = { ...profile.achievements, [a.id]: Date.now() }
    emit({ kind: 'achievement', id: a.id })
    grant(50) // achievements give a little XP too
  }
}
