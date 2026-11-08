import { dayKeyOf, getProfile, levelInfo, liveStreak, notify, patchProfile, type Profile } from './game'
import { BOARDS, type BoardId } from './settings'
import { weekBounds, weekIndex, weekKey, weekProgress } from './weekly'

// Weekly leagues, the monthly season pass and collectible boards — all offline. League rivals are
// "ghosts": simulated players whose pace is based on how much you usually train, so the league
// stays competitive whether you play ten minutes a week or two hours a day.

// ───────────── leagues ─────────────

export const LEAGUES = ['Bronze', 'Silver', 'Gold', 'Sapphire', 'Ruby', 'Emerald', 'Amethyst', 'Pearl', 'Obsidian', 'Diamond']
export const LEAGUE_COLORS = ['#c08457', '#c7ccd1', '#d4b06a', '#4f7dd9', '#d94f6a', '#3fae7a', '#9a6ad9', '#e6dccb', '#6b6b78', '#9fd8ff']
const PROMOTE = 3 // top 3 go up
const DEMOTE = 3 // bottom 3 go down
const GHOSTS = [
  'Morphy’s Ghost', 'Knightmare', 'Pawnstar', 'Castle Rock', 'Zugzwang Zoe', 'Fianchetto Fred', 'The Isolani', 'Rookie Rex', 'En Passant Pat', 'Bishop Bash',
  'Gambit Gary', 'Sac Attack', 'Opposition Olga', 'Tempo Tom', 'Outpost Owl', 'Lucena Lou', 'Philidor Phil', 'Smothered Sam', 'Backrank Bea', 'Patzer Pete',
]

const rand = (seed: number) => {
  let x = (seed * 2654435761) >>> 0
  x ^= x >>> 15
  x = Math.imul(x, 2246822519) >>> 0
  x ^= x >>> 13
  return (x >>> 0) / 4294967296
}

/** XP earned in the week that contains `d`. */
export function weekXp(p: Profile, d = new Date()) {
  const { start } = weekBounds(d)
  let sum = 0
  for (let i = 0; i < 7; i++) {
    const x = new Date(start)
    x.setDate(x.getDate() + i)
    sum += p.daily[dayKeyOf(x)] ?? 0
  }
  return sum
}

/** Your typical week: the average of the last four (ignoring empty ones), at least 300. */
function baseline(p: Profile, d: Date) {
  const weeks: number[] = []
  for (let i = 1; i <= 4; i++) {
    const x = new Date(d)
    x.setDate(x.getDate() - 7 * i)
    const w = weekXp(p, x)
    if (w > 0) weeks.push(w)
  }
  return Math.max(300, weeks.length ? weeks.reduce((a, b) => a + b, 0) / weeks.length : 0)
}

export interface Standing {
  name: string
  xp: number
  you?: boolean
}

/** The league table for the week containing `d` (at `progress` through it; 1 = final). */
export function standings(p: Profile, tier: number, d = new Date(), progress = weekProgress(d)): Standing[] {
  const w = weekIndex(d)
  const base = baseline(p, d)
  const ghosts: Standing[] = []
  // a fresh set of nine rival names each week
  const names = GHOSTS.map((n, k) => [rand(w * 131 + k), n] as const).sort((a, b) => a[0] - b[0]).map(([, n]) => n)
  for (let i = 0; i < 9; i++) {
    const r = rand(w * 97 + i * 13 + tier * 7)
    // spread from ~0.45× to ~1.6× your usual week, a bit tougher in higher leagues
    const target = base * (0.45 + (i / 8) * 1.15 + (r - 0.5) * 0.3) * (1 + tier * 0.06)
    // ghosts train in bursts, not linearly
    const pace = Math.min(1, Math.pow(progress, 0.85 + rand(w + i) * 0.4) + (rand(w * 3 + i + Math.floor(progress * 14)) - 0.5) * 0.06)
    ghosts.push({ name: names[i], xp: Math.max(0, Math.round(target * Math.max(0, pace))) })
  }
  return [...ghosts, { name: 'You', xp: weekXp(p, d), you: true }].sort((a, b) => b.xp - a.xp)
}

export const promoteZone = (rank: number) => rank <= PROMOTE
export const demoteZone = (rank: number) => rank > 10 - DEMOTE

/** Settle finished weeks: promote / demote and pay the promotion bonus. Call on app start. */
export function settleLeague() {
  const p = getProfile()
  const now = weekKey()
  if (!p.league) {
    patchProfile((q) => void (q.league = { tier: 0, week: now, history: [] }))
    return
  }
  if (p.league.week === now) return
  // settle the week we were in (only the most recent one — weeks skipped entirely count as a demotion)
  const last = new Date()
  last.setDate(last.getDate() - 7)
  const lastKey = weekKey(last)
  const tier = p.league.tier
  let moved: -1 | 0 | 1 = 0
  let rank = 10
  if (p.league.week === lastKey) {
    const table = standings(p, tier, last, 1)
    rank = table.findIndex((s) => s.you) + 1
    const played = weekXp(p, last) > 0
    moved = played && promoteZone(rank) && tier < LEAGUES.length - 1 ? 1 : (!played || demoteZone(rank)) && tier > 0 ? -1 : 0
  } else moved = tier > 0 ? -1 : 0
  const newTier = tier + moved
  patchProfile(
    (q) => {
      q.league = { tier: newTier, week: now, history: [...(q.league?.history ?? []), { week: p.league!.week, tier, rank, moved }].slice(-20) }
      if (moved === 1) q.counters = { ...q.counters, promotions: (q.counters.promotions ?? 0) + 1 }
    },
    moved === 1 ? 100 + 20 * newTier : 0,
  )
  if (moved === 1) notify(`📈 Promoted to the ${LEAGUES[newTier]} league! (+${100 + 20 * newTier} XP)`)
  else if (moved === -1) notify(`📉 Dropped to the ${LEAGUES[newTier]} league — win it back this week`)
  else notify(`League week over: you finished #${rank} in ${LEAGUES[tier]}`)
}

// ───────────── collectibles ─────────────

export interface Collectible {
  id: Exclude<BoardId, 'theme'>
  how: string
  /** unlocked by play; season-only boards have no test and are granted by the pass */
  test?: (p: Profile) => boolean
}

export const COLLECTIBLES: Collectible[] = [
  { id: 'walnut', how: 'Reach level 10', test: (p) => levelInfo(p.xp).level >= 10 },
  { id: 'marble', how: 'Earn a Gold medal in any opening', test: (p) => Object.values(p.medals ?? {}).some((t) => t >= 3) },
  { id: 'ocean', how: 'Defeat 3 bosses', test: (p) => (p.sets.bosses ?? []).length >= 3 },
  { id: 'rose', how: 'Keep a 14-day streak', test: (p) => liveStreak(p) >= 14 || (p.counters.bestStreak ?? 0) >= 14 },
  { id: 'emerald', how: 'Complete an endgame course', test: (p) => (p.sets.courses ?? []).length >= 1 },
  { id: 'champion', how: 'Reach level 50', test: (p) => levelInfo(p.xp).level >= 50 },
  { id: 'tournament', how: 'Season pass reward (tier 10)' },
  { id: 'royal', how: 'Season pass reward (tier 20)' },
]

export const isCollectible = (b: BoardId) => COLLECTIBLES.some((c) => c.id === b)
export const isUnlocked = (p: Profile, b: BoardId) => {
  const c = COLLECTIBLES.find((x) => x.id === b)
  return !c || (p.sets.unlocked ?? []).includes(b) || !!c.test?.(p)
}

// ───────────── season pass ─────────────

export const SEASON_TIERS = 30
export const XP_PER_TIER = 150
export const seasonKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const seasonName = (d = new Date()) => `${MONTHS[d.getMonth()]} season`

export interface SeasonReward {
  tier: number
  label: string
  icon: string
}
export const SEASON_REWARDS: SeasonReward[] = [
  { tier: 3, label: '+50 XP', icon: '✨' },
  { tier: 5, label: 'Streak freeze', icon: '❄️' },
  { tier: 8, label: '+100 XP', icon: '✨' },
  { tier: 10, label: 'Tournament board', icon: '♟' },
  { tier: 13, label: '+150 XP', icon: '✨' },
  { tier: 15, label: 'Streak freeze', icon: '❄️' },
  { tier: 18, label: '+200 XP', icon: '✨' },
  { tier: 20, label: 'Royal board', icon: '👑' },
  { tier: 25, label: 'Streak freeze', icon: '❄️' },
  { tier: 30, label: 'Season trophy + 300 XP', icon: '🏆' },
]

export function seasonXp(p: Profile, d = new Date()) {
  const k = seasonKey(d)
  return Object.entries(p.daily).reduce((s, [day, xp]) => (day.startsWith(k) ? s + xp : s), 0)
}
export const seasonTier = (xp: number) => Math.min(SEASON_TIERS, Math.floor(xp / XP_PER_TIER))

/** Pay out any season rewards you've reached. Safe to call often. */
export function claimSeason() {
  const p = getProfile()
  const key = seasonKey()
  const claimed = p.season?.key === key ? p.season.claimed : []
  const tier = seasonTier(seasonXp(p))
  const due = SEASON_REWARDS.filter((r) => r.tier <= tier && !claimed.includes(r.tier))
  if (!due.length) {
    if (p.season?.key !== key) patchProfile((q) => void (q.season = { key, claimed: [] }))
    return
  }
  let xp = 0
  patchProfile((q) => {
    for (const r of due) {
      if (r.label.startsWith('+')) xp += Number(r.label.match(/\d+/)![0])
      if (r.label === 'Streak freeze') q.freezes = Math.min(3, (q.freezes ?? 0) + 1)
      if (r.tier === 10) q.sets = { ...q.sets, unlocked: [...new Set([...(q.sets.unlocked ?? []), 'tournament'])] }
      if (r.tier === 20) q.sets = { ...q.sets, unlocked: [...new Set([...(q.sets.unlocked ?? []), 'royal'])] }
      if (r.tier === 30) {
        xp += 300
        q.sets = { ...q.sets, seasons: [...new Set([...(q.sets.seasons ?? []), key])] }
      }
    }
    q.season = { key, claimed: [...claimed, ...due.map((r) => r.tier)] }
  })
  if (xp) patchProfile(() => {}, xp)
  for (const r of due) notify(`🎟️ Season tier ${r.tier}: ${r.label}`)
}

// ───────────── year in review ─────────────

export function yearStats(p: Profile, year = new Date().getFullYear()) {
  const days = Object.entries(p.daily)
    .filter(([d, xp]) => d.startsWith(String(year)) && xp > 0)
    .map(([d]) => d)
    .sort()
  let longest = 0
  let run = 0
  let prev: number | null = null
  for (const d of days) {
    const t = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
    run = prev !== null && t - prev === 86_400_000 ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = t
  }
  const xp = days.reduce((s, d) => s + (p.daily[d] ?? 0), 0)
  const bestDay = days.reduce((b, d) => ((p.daily[d] ?? 0) > (p.daily[b] ?? 0) ? d : b), days[0] ?? '')
  const achievements = Object.values(p.achievements).filter((t) => new Date(t).getFullYear() === year).length
  return {
    year,
    xp,
    days: days.length,
    longest,
    bestDay,
    bestDayXp: bestDay ? p.daily[bestDay] : 0,
    achievements,
    medals: Object.values(p.medals ?? {}).filter((t) => t > 0).length,
    golds: Object.values(p.medals ?? {}).filter((t) => t >= 3).length,
    bosses: (p.sets.bosses ?? []).length,
    puzzles: (p.sets.puzzles ?? []).length + (p.sets.ownPuzzles ?? []).length + (p.sets.defended ?? []).length,
    endgames: (p.sets.endgames ?? []).length,
    lines: p.counters.lines ?? 0,
    bestCombo: p.counters.bestCombo ?? 0,
    level: levelInfo(p.xp),
    league: LEAGUES[p.league?.tier ?? 0],
  }
}
void BOARDS
