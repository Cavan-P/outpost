// Pure merge logic for device sync — no storage, no network, so it can be tested in Node.
//
// Three-way merge: `local` (this device), `remote` (the server copy) and `base` (what this device
// last synced). Running totals (XP, daily XP, counters, freezes) merge as remote + what this device
// earned since the last sync, so training on two devices adds up. Everything else merges as a
// union, a max or "newest wins". The base also lists the ids that existed at the last sync, so a
// game / repertoire / opening deleted on one device stays deleted instead of coming back.

import type { OpeningDef } from '../data/openings'
import type { Profile } from './game'
import type { ImportedGame } from './games'
import type { NodeStat, OpeningProgress } from './progress'
import { mergeExtensions, type ExtStore } from './extensions'

export interface GamesStore {
  username: string
  source: ImportedGame['source']
  games: ImportedGame[]
}

export interface Snapshot {
  v: 1
  progress: Record<string, OpeningProgress>
  profile: Profile | null
  custom: (OpeningDef & { updatedAt?: number })[]
  games: GamesStore | null
  /** your own added lines (optional: older snapshots don't have it) */
  ext?: ExtStore | null
}

/** Just what the three-way merge needs to remember about the last sync. */
export interface Base {
  xp: number
  daily: Record<string, number>
  counters: Record<string, number>
  freezes: number
  openingIds: string[]
  gameIds: string[]
  customIds: string[]
}

export const emptyBase = (): Base => ({ xp: 0, daily: {}, counters: {}, freezes: 0, openingIds: [], gameIds: [], customIds: [] })

export function baseOf(s: Snapshot): Base {
  return {
    xp: s.profile?.xp ?? 0,
    daily: { ...(s.profile?.daily ?? {}) },
    counters: { ...(s.profile?.counters ?? {}) },
    freezes: s.profile?.freezes ?? 0,
    openingIds: Object.keys(s.progress),
    gameIds: (s.games?.games ?? []).map((g) => g.id),
    customIds: s.custom.map((c) => c.id),
  }
}

/** remote + (local − base), never below zero */
const delta = (l: number | undefined, r: number | undefined, b: number | undefined) => Math.max(0, (r ?? 0) + ((l ?? 0) - (b ?? 0)))

function mergeNumbers(l: Record<string, number>, r: Record<string, number>, b: Record<string, number>, keepMax: (k: string) => boolean) {
  const out: Record<string, number> = {}
  for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) out[k] = keepMax(k) ? Math.max(l[k] ?? 0, r[k] ?? 0) : delta(l[k], r[k], b[k])
  return out
}

function maxRecord(a: Record<string, number> = {}, b: Record<string, number> = {}) {
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? -Infinity, v)
  return out
}

/** Union by id, honoring deletions on either side since the last sync. */
function mergeById<T>(local: T[], remote: T[], baseIds: string[], id: (x: T) => string, pick: (l: T, r: T) => T): T[] {
  const base = new Set(baseIds)
  const L = new Map(local.map((x) => [id(x), x]))
  const R = new Map(remote.map((x) => [id(x), x]))
  const out: T[] = []
  for (const k of new Set([...L.keys(), ...R.keys()])) {
    const l = L.get(k)
    const r = R.get(k)
    if (l && r) out.push(pick(l, r))
    else if (l && !(base.has(k) && !r)) out.push(l) // missing remotely: deleted there if it existed at the last sync
    else if (r && !(base.has(k) && !l)) out.push(r) // missing locally: deleted here if it existed at the last sync
  }
  return out
}

export function mergeProfile(l: Profile | null, r: Profile | null, b: Base): Profile | null {
  if (!l || !r) return l ?? r
  const later = (l.lastDay ?? '') >= (r.lastDay ?? '') ? l : r
  const sets: Record<string, string[]> = {}
  for (const k of new Set([...Object.keys(l.sets), ...Object.keys(r.sets)])) sets[k] = [...new Set([...(l.sets[k] ?? []), ...(r.sets[k] ?? [])])]
  const achievements: Record<string, number> = { ...r.achievements }
  for (const [k, t] of Object.entries(l.achievements)) achievements[k] = Math.min(t, achievements[k] ?? Infinity)

  // today's quests: same day → combine progress; otherwise the newer day
  let today = l.today
  if (l.today && r.today) {
    if (l.today.day === r.today.day)
      today = {
        day: l.today.day,
        counts: maxRecord(l.today.counts, r.today.counts),
        done: [...new Set([...l.today.done, ...r.today.done])],
        xpBySource: maxRecord(l.today.xpBySource, r.today.xpBySource),
        quests: l.today.quests?.length ? l.today.quests : r.today.quests,
      }
    else today = l.today.day > r.today.day ? l.today : r.today
  } else today = l.today ?? r.today


  return {
    ...r,
    ...l,
    xp: delta(l.xp, r.xp, b.xp),
    daily: mergeNumbers(l.daily, r.daily, b.daily, () => false),
    counters: mergeNumbers(l.counters, r.counters, b.counters, (k) => k.startsWith('best')),
    freezes: Math.min(3, delta(l.freezes, r.freezes, b.freezes)),
    streak: l.lastDay === r.lastDay ? Math.max(l.streak, r.streak) : later.streak,
    lastDay: later.lastDay,
    achievements,
    sets,
    bests: maxRecord(l.bests, r.bests),
    medals: maxRecord(l.medals, r.medals),
    today,
  }
}

function mergeNode(l: NodeStat, r: NodeStat): NodeStat {
  return (l.last ?? 0) >= (r.last ?? 0) ? l : r
}

export function mergeProgress(l: Record<string, OpeningProgress>, r: Record<string, OpeningProgress>, b: Base) {
  const ids = mergeById(Object.keys(l), Object.keys(r), b.openingIds, (x) => x, (x) => x)
  const out: Record<string, OpeningProgress> = {}
  for (const id of ids) {
    const lp = l[id]
    const rp = r[id]
    if (!lp || !rp) {
      out[id] = lp ?? rp
      continue
    }
    const nodes: Record<string, NodeStat> = { ...rp.nodes }
    for (const [k, s] of Object.entries(lp.nodes)) nodes[k] = nodes[k] ? mergeNode(s, nodes[k]) : s
    out[id] = { nodes, learned: [...new Set([...(rp.learned ?? []), ...(lp.learned ?? [])])] }
  }
  return out
}

const analysisRank = (g: ImportedGame) => (g.analysis ? g.analysis.depth * 10 + (g.analysis.version ?? 0) : -1)

export function mergeGames(l: GamesStore | null, r: GamesStore | null, b: Base): GamesStore | null {
  if (!l || !r) return l ?? r
  const games = mergeById(l.games, r.games, b.gameIds, (g) => g.id, (lg, rg) => (analysisRank(rg) > analysisRank(lg) ? { ...rg, notMine: lg.notMine ?? rg.notMine } : lg))
  return { username: l.username || r.username, source: l.username ? l.source : r.source, games: games.sort((x, y) => y.date - x.date) }
}

export function mergeCustom(l: Snapshot['custom'], r: Snapshot['custom'], b: Base) {
  return mergeById(l, r, b.customIds, (c) => c.id, (lc, rc) => ((rc.updatedAt ?? 0) > (lc.updatedAt ?? 0) ? rc : lc))
}

export function merge(local: Snapshot, remote: Snapshot, base: Base): Snapshot {
  return {
    v: 1,
    progress: mergeProgress(local.progress, remote.progress, base),
    profile: mergeProfile(local.profile, remote.profile, base),
    custom: mergeCustom(local.custom, remote.custom, base),
    games: mergeGames(local.games, remote.games, base),
    ext: mergeExtensions(local.ext ?? null, remote.ext ?? null),
  }
}
