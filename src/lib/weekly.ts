import { OPENINGS, type OpeningDef } from '../data/openings'

/** Monday-based week number since 1970, stable for a whole week in local time. */
export function weekIndex(d = new Date()) {
  const local = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  // 1 Jan 1970 was a Thursday; shift so weeks start on Monday
  return Math.floor((local / 86_400_000 + 3) / 7)
}

/** "2026-W45"-style key for this week. */
export const weekKey = (d = new Date()) => `w${weekIndex(d)}`

/** Start (Monday 00:00) and end of the current week, local time. */
export function weekBounds(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return { start, end }
}

/** Fraction of the week gone, 0..1. */
export function weekProgress(d = new Date()) {
  const { start, end } = weekBounds(d)
  return Math.min(1, Math.max(0, (d.getTime() - start.getTime()) / (end.getTime() - start.getTime())))
}

const hash = (n: number) => {
  let x = (n * 2654435761) >>> 0
  x ^= x >>> 13
  return x >>> 0
}

/** The featured opening this week: gambits and aggressive lines get picked twice as often. */
export function openingOfWeek(d = new Date()): OpeningDef {
  const pool = OPENINGS.flatMap((o) => (o.tags.includes('gambit') || o.tags.includes('aggressive') ? [o, o] : [o]))
  return pool[hash(weekIndex(d)) % pool.length]
}

/** Practice XP multiplier for an opening (its flipped "face it" copy counts too). */
export const weekBonus = (openingId: string) => (openingId.replace(/~flip$/, '') === openingOfWeek().id ? 1.5 : 1)
