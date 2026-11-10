// Checks the game → opening matching used by "Openings in your games" and the opening finder.
import './mock-storage'
import { bookOf, openingUsage, openingsAt } from '../src/lib/openingIndex'
import type { ImportedGame } from '../src/lib/games'
import { Chess } from 'chess.js'

let fails = 0
const check = (name: string, ok: boolean, info = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${info ? `  (${info})` : ''}`)
  if (!ok) fails++
}
const game = (id: string, userColor: 'w' | 'b', moves: string, opening: string, result: ImportedGame['result'] = '1-0'): ImportedGame => ({ id, source: 'pgn', white: 'a', black: 'b', userColor, result, date: 1, opening, sans: moves.split(' ') })

// You played the Budapest as Black and followed the main line for a while
const g1 = game('1', 'b', 'd4 Nf6 c4 e5 dxe5 Ng4 Bf4 Nc6 Nf3 Bb4+ Nbd2 Qe7 e3 Ngxe5 h3', 'Budapest Defense', '0-1')
const b1 = bookOf(g1)!
check('Budapest game matches the Budapest Gambit', b1.tree.def.id === 'budapest', b1.tree.def.id)
check('followed 14 plies of book', b1.depth === 14, `${b1.depth}`)
check('the opponent left book first', b1.leftBy === 'opponent', b1.leftBy)

// You were White facing the Budapest: should match the "Face it" copy
const g2 = game('2', 'w', 'd4 Nf6 c4 e5 dxe5 Ng4 Bf4 Nc6 a3', 'Budapest Defense')
const b2 = bookOf(g2)!
check('facing an opening matches its flipped copy', !!b2.tree.def.flipped && b2.tree.def.id.startsWith('budapest'), b2.tree.def.id)
check('you left book with a3', b2.leftBy === 'you', `${b2.leftBy} at depth ${b2.depth}`)

// An opening Outpost doesn't have
const g3 = game('3', 'w', 'a3 e5 h3 d5 b3 Nf6', "Anderssen's Opening")
check('unknown opening has no deep match', !bookOf(g3) || bookOf(g3)!.depth < 4)

const usage = openingUsage([g1, g2, g3, { ...g1, id: '4' }])
const bud = usage.find((u) => u.family === 'Budapest Defense' && u.side === 'b')!
check('games grouped by opening and side', bud.games.length === 2 && usage.length === 3, usage.map((u) => `${u.side}:${u.family}×${u.games.length}`).join(', '))
check('score computed from your side', bud.score === 1)

// finder: transpositions are found by position
const c = new Chess()
for (const m of 'Nf3 d5 d4 Nf6 c4'.split(' ')) c.move(m)
const hits = openingsAt(c.fen()).map((h) => h.def.name)
check('a transposed move order still finds openings', hits.length > 0, hits.slice(0, 3).join(', '))

console.log(fails ? `\n${fails} failed` : '\nall passed')
process.exit(fails ? 1 : 0)
