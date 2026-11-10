import { dayKeyOf, levelInfo, liveStreak, type Profile } from './game'
import { BOARDS, type BoardId } from './settings'
import { weekBounds } from './weekly'

// Weekly XP for the leaderboards, collectible boards and the year-in-review card.

// ───────────── weekly XP (for the real leaderboards) ─────────────

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
  { id: 'tournament', how: 'Defeat 10 bosses', test: (p) => (p.sets.bosses ?? []).length >= 10 },
  { id: 'royal', how: 'Earn a Diamond medal in any opening', test: (p) => Object.values(p.medals ?? {}).some((t) => t >= 4) },
]

export const isCollectible = (b: BoardId) => COLLECTIBLES.some((c) => c.id === b)
export const isUnlocked = (p: Profile, b: BoardId) => {
  const c = COLLECTIBLES.find((x) => x.id === b)
  return !c || (p.sets.unlocked ?? []).includes(b) || !!c.test?.(p)
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
  }
}
void BOARDS
