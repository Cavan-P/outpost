// Tests for the sync merge: two devices training between syncs, deletions, offline weeks.
import { baseOf, emptyBase, merge, type Snapshot } from '../src/lib/syncMerge'
import type { Profile } from '../src/lib/game'

let fails = 0
const check = (name: string, ok: boolean, info = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${info ? `  (${info})` : ''}`)
  if (!ok) fails++
}
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

const profile = (over: Partial<Profile> = {}): Profile => ({
  xp: 1000, daily: { '2026-11-07': 200 }, streak: 5, lastDay: '2026-11-07', achievements: { 'first-line': 100 }, counters: { lines: 10, bestCombo: 12 },
  sets: { puzzles: ['a'] }, bests: { coords: 20 }, freezes: 1, today: { day: '2026-11-07', counts: {}, done: [], xpBySource: {} }, medals: { italian: 1 }, ...over,
})
const snap = (p: Profile): Snapshot => ({
  v: 1,
  progress: { italian: { nodes: { 'e4': { correct: 1, wrong: 0, streak: 1, last: 1000, box: 1 } }, learned: ['l1'] } },
  profile: p,
  custom: [{ id: 'custom-1', name: 'Mine', eco: '', side: 'w', tags: ['custom'], summary: '', ideas: [], lines: ['e4 e5'], updatedAt: 1 }],
  games: { username: 'me', source: 'lichess', games: [{ id: 'g1', source: 'lichess', white: 'me', black: 'x', userColor: 'w', result: '1-0', date: 1, sans: ['e4'] }] },
})

// Both devices start from the same synced state
const synced = snap(profile())
const base = baseOf(synced)

// Device A (local) trains: +150 XP today, 3 lines, new best combo 15, learns a node
const local = clone(synced)
local.profile!.xp += 150
local.profile!.daily['2026-11-08'] = 150
local.profile!.counters.lines = 13
local.profile!.counters.bestCombo = 15
local.profile!.lastDay = '2026-11-08'
local.profile!.streak = 6
local.progress.italian.nodes['e4'] = { correct: 2, wrong: 0, streak: 2, last: 3000, box: 2 }
local.profile!.sets.puzzles.push('b')

// Device B (remote, already synced) trained too: +100 XP today, 2 lines, combo 13, a different puzzle
const remote = clone(synced)
remote.profile!.xp += 100
remote.profile!.daily['2026-11-08'] = 100
remote.profile!.counters.lines = 12
remote.profile!.counters.bestCombo = 13
remote.profile!.lastDay = '2026-11-08'
remote.profile!.streak = 6
remote.progress.italian.nodes['e4'] = { correct: 2, wrong: 1, streak: 0, last: 2000, box: 0 }
remote.progress.italian.nodes['e4 e5 Nf3'] = { correct: 1, wrong: 0, streak: 1, last: 2500, box: 1 }
remote.profile!.sets.puzzles.push('c')

const m = merge(local, remote, base)
check('XP from both devices adds up', m.profile!.xp === 1250, `${m.profile!.xp}`)
check("today's XP adds up", m.profile!.daily['2026-11-08'] === 250, `${m.profile!.daily['2026-11-08']}`)
check('older days are untouched', m.profile!.daily['2026-11-07'] === 200)
check('counters add up', m.profile!.counters.lines === 15, `${m.profile!.counters.lines}`)
check('best-of counters keep the max', m.profile!.counters.bestCombo === 15)
check('streak does not double count the same day', m.profile!.streak === 6)
check('sets are combined', ['a', 'b', 'c'].every((x) => m.profile!.sets.puzzles.includes(x)))
check('newest answer wins per position', m.progress.italian.nodes['e4'].last === 3000)
check('positions only one device saw are kept', !!m.progress.italian.nodes['e4 e5 Nf3'])

// Deletions
const delLocal = clone(synced)
delLocal.games!.games = []
delLocal.custom = []
const dm = merge(delLocal, clone(synced), base)
check('a game deleted on this device stays deleted', dm.games!.games.length === 0)
check('a repertoire deleted on this device stays deleted', dm.custom.length === 0)
const delRemote = clone(synced)
delete (delRemote.progress as Record<string, unknown>).italian
const dm2 = merge(clone(synced), delRemote, base)
check('progress reset on the other device stays reset', !dm2.progress.italian)

// New things on each side survive
const addL = clone(synced)
addL.games!.games.push({ ...addL.games!.games[0], id: 'g2' })
const addR = clone(synced)
addR.custom.push({ ...addR.custom[0], id: 'custom-2' })
const am = merge(addL, addR, base)
check('new game from this device kept', am.games!.games.some((g) => g.id === 'g2'))
check('new repertoire from the other device kept', am.custom.some((c) => c.id === 'custom-2'))

// Same repertoire edited on both: newest wins
const eL = clone(synced)
eL.custom[0] = { ...eL.custom[0], lines: ['d4'], updatedAt: 5 }
const eR = clone(synced)
eR.custom[0] = { ...eR.custom[0], lines: ['c4'], updatedAt: 9 }
check('newest repertoire edit wins', merge(eL, eR, base).custom[0].lines[0] === 'c4')

// Deeper analysis wins, "not my game" flag survives
const gL = clone(synced)
gL.games!.games[0].notMine = true
const gR = clone(synced)
gR.games!.games[0].analysis = { depth: 15, version: 4, moves: [], accuracy: { w: 90, b: 80 } }
const gm = merge(gL, gR, base).games!.games[0]
check('deeper analysis kept', gm.analysis?.depth === 15)
check('"not my game" flag kept', gm.notMine === true)

// Joining with "combine" (empty base): both histories add up
const j = merge(snap(profile({ xp: 300, daily: { '2026-11-01': 300 } })), snap(profile({ xp: 500, daily: { '2026-11-01': 100 } })), emptyBase())
check('combining two devices on first join adds XP', j.profile!.xp === 800)

// Offline for a week: only this device trained, remote unchanged
const off = clone(synced)
off.profile!.xp += 700
check('offline training is all kept', merge(off, clone(synced), base).profile!.xp === 1700)

// XP earned while an upload is in flight is replayed on top and pushed next time, never doubled
const M = merge(local, remote, base) // what got uploaded (1250 XP)
const during = clone(local)
during.profile!.xp += 50 // earned mid-upload
const final = merge(during, M, baseOf(local))
check('mid-upload XP kept on this device', final.profile!.xp === 1300, `${final.profile!.xp}`)
const next = merge(final, M, baseOf(M)) // next sync: server still has M
check('next sync uploads it exactly once', next.profile!.xp === 1300, `${next.profile!.xp}`)

console.log(fails ? `\n${fails} failed` : '\nall passed')
process.exit(fails ? 1 : 0)
