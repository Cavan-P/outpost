// Checks the daily review only serves material you've already practised (uses an in-memory localStorage).
import { mem } from './mock-storage'
import { buildSession, type Item } from '../src/lib/reviewSession'
const describe = (items: Item[]) => items.map((i) => (i.kind === 'book' ? `book:${i.def.id}` : i.kind === 'trap' ? `trap:${i.puzzle.openingId}` : i.kind === 'endgame' ? `endgame:${i.endgame.id}` : i.kind === 'mate' ? `mate:${i.pattern.id}` : `own:${i.puzzle.id}`))

let fail = false
const expect = (name: string, ok: boolean, got: unknown) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)}`}`)
  if (!ok) fail = true
}

// 1. fresh user: nothing at all
let s = describe(buildSession({}))
expect('fresh profile → empty review', s.length === 0, s)

// 2. practised the Italian (one due position) and solved one endgame + one mate pattern
mem['ctt.progress.v1'] = JSON.stringify({ italian: { nodes: { 'e4 e5': { correct: 1, wrong: 0, streak: 1, last: 1, box: 1, due: 0 } }, learned: [] } })
for (let k = 0; k < 20; k++) {
  s = describe(buildSession({ endgames: ['mate-kq'], mates: ['back-rank'] }))
  const foreign = s.filter((x) => !/^(book|trap):italian$|^endgame:mate-kq$|^mate:back-rank$/.test(x))
  if (foreign.length) {
    expect('only Italian / solved endgame / learned mate', false, foreign)
    break
  }
}
expect('due Italian position included', s.includes('book:italian'), s)
expect('Italian trap included', s.includes('trap:italian'), s)
expect('solved endgame included', s.includes('endgame:mate-kq'), s)
expect('learned mate pattern included', s.includes('mate:back-rank'), s)
expect('London never appears', !s.some((x) => x.includes('london')), s)

// 3. a trap you attempted in Training comes back even without studying its opening
s = describe(buildSession({ puzzlesSeen: ['london:d4 d5 Bf4 c5 e3 Qb6 Nc3 Qxb2'] }))
expect('attempted London trap returns', s.includes('trap:london'), s)
process.exit(fail ? 1 : 0)
