// Sanity checks for the XP economy: grinding pays little, learning pays, levels/medals/quests/freezes work.
import './mock-storage'
import { award, count, getProfile, levelInfo, liveStreak, MAX_LEVEL, step, titleFor, todaysQuests } from '../src/lib/game'
import { claimSeason, seasonKey, settleLeague, standings } from '../src/lib/meta'
import { openingOfWeek, weekKey } from '../src/lib/weekly'
import { boxOf, medalOf, recordAnswer, getProgress, type NodeStat } from '../src/lib/progress'

let fails = 0
const check = (name: string, ok: boolean, info = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${info ? `  (${info})` : ''}`)
  if (!ok) fails++
}

// level curve
let total = 0
for (let l = 1; l < MAX_LEVEL; l++) total += step(l)
check('reaching level 100 takes 150k–400k XP', total > 150_000 && total < 400_000, `${total.toLocaleString()}`)
check('level 10 needs a couple of thousand XP', levelInfo(2500).level >= 8 && levelInfo(2500).level <= 14, `2500 XP → lv ${levelInfo(2500).level}`)
check('titles have roman sublevels', titleFor(1) === 'Patzer I' && titleFor(7) === 'Beginner II' && titleFor(100) === 'World Champion', `${titleFor(1)}, ${titleFor(7)}, ${titleFor(100)}`)
check('level caps at 100', levelInfo(10_000_000).level === 100)

// diminishing returns: 200 awards of 10 XP from one source vs spread across 10 sources
const xp0 = getProfile().xp
for (let i = 0; i < 200; i++) award(10, undefined, 'opening:grind')
const ground = getProfile().xp - xp0
const xp1 = getProfile().xp
for (let i = 0; i < 200; i++) award(10, undefined, `opening:o${i % 10}`)
const spread = getProfile().xp - xp1
check('grinding one source pays far less than spreading out', ground < spread * 0.5, `one source ${ground} XP vs ten sources ${spread} XP for the same 2000 raw`)

// spaced repetition: repeat answers don't promote
const r1 = recordAnswer('t', 'n1', 'correct')
const r2 = recordAnswer('t', 'n1', 'correct')
check('first answer is fresh and promotes', r1.fresh && r1.promoted && r1.box === 1)
check('immediate repeat neither fresh nor promoted', !r2.fresh && !r2.promoted)

// decay
const now = Date.now()
const DAY = 86_400_000
const mastered: NodeStat = { correct: 5, wrong: 0, streak: 5, last: now - 40 * DAY, box: 5, due: now - 30 * DAY }
check('a box-5 position 30 days overdue fades 4 boxes', boxOf(mastered, now) === 1, `box ${boxOf(mastered, now)}`)
check('not overdue → no fade', boxOf({ ...mastered, due: now + DAY }, now) === 5)

// medals
const ids = ['a', 'b', 'c', 'd']
const mk = (box: number): NodeStat => ({ correct: 1, wrong: 0, streak: 1, last: now, box, due: now + DAY })
const prog = (boxes: number[]) => ({ learned: [], nodes: Object.fromEntries(boxes.map((b, i) => [ids[i], mk(b)])) })
check('no medal until every position seen', medalOf(ids, prog([1, 1, 1]), now) === 0)
check('bronze when all seen', medalOf(ids, prog([1, 1, 1, 1]), now) === 1)
check('silver at half familiar', medalOf(ids, prog([3, 3, 1, 1]), now) === 2)
check('gold at 90% familiar + half mastered', medalOf(ids, prog([4, 4, 3, 3]), now) === 3)
check('diamond when all mastered', medalOf(ids, prog([4, 5, 4, 4]), now) === 4)
void getProgress

// quests: three distinct, stable through the day, completing all gives a freeze
const q = todaysQuests()
check('three quests with different counters', q.length === 3 && new Set(q.map((x) => x.counter)).size === 3, q.map((x) => x.id).join(', '))
check('quests stable within the day', todaysQuests().map((x) => x.id).join() === q.map((x) => x.id).join())
const fz = getProfile().freezes
for (const x of q) count(x.counter, x.target)
check('finishing all quests banks a freeze', getProfile().freezes === fz + 1, `freezes ${getProfile().freezes}`)

// streak freeze covers a missed day
const p = getProfile()
const d = new Date()
d.setDate(d.getDate() - 2)
const key = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
Object.assign(p, { lastDay: key(d), streak: 9, freezes: 1 })
check('streak shown alive with a freeze banked', liveStreak(p) === 9)
award(5)
check('training after a missed day uses the freeze', getProfile().streak === 10 && getProfile().freezes === 0, `streak ${getProfile().streak}, freezes ${getProfile().freezes}`)

// leagues
const table = standings(getProfile(), 0)
check('league table has you plus 9 rivals', table.length === 10 && table.filter((x) => x.you).length === 1)
settleLeague()
check('first visit starts you in Bronze this week', getProfile().league?.tier === 0 && getProfile().league?.week === weekKey())
// pretend last week you crushed it: lots of XP last week, league week = last week
const lw = new Date()
lw.setDate(lw.getDate() - 7)
Object.assign(getProfile().daily, { [key(lw)]: 50_000 })
getProfile().league = { tier: 0, week: weekKey(lw), history: [] }
settleLeague()
check('winning last week promotes you', getProfile().league?.tier === 1 && getProfile().league?.history.at(-1)?.moved === 1, `tier ${getProfile().league?.tier}`)

// season pass: this month's XP pays the reward track once
const xpBefore = getProfile().xp
claimSeason()
const claimed = getProfile().season?.claimed ?? []
check('season rewards claimed for this month', getProfile().season?.key === seasonKey() && claimed.length > 0, `tiers ${claimed.join(',')}`)
const xpMid = getProfile().xp
claimSeason()
check('season rewards are not paid twice', getProfile().xp === xpMid && xpMid >= xpBefore)
check('opening of the week is stable', openingOfWeek().id === openingOfWeek().id, openingOfWeek().name)

console.log(fails ? `\n${fails} failed` : '\nall passed')
process.exit(fails ? 1 : 0)
