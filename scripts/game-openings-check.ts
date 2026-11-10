// Checks the game → opening matching used by "Openings in your games" and the opening finder.
import './mock-storage'
import { bookOf, openingUsage, openingsAt } from '../src/lib/openingIndex'
import type { ImportedGame } from '../src/lib/games'
import { Chess } from 'chess.js'
import { mem } from './mock-storage'
import { coverage } from '../src/lib/coverage'
import { addGames, getGames, parsePgnText } from '../src/lib/games'

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

// A London reached by a different move order (Nf3 before e3) still matches
const g5 = game('5', 'w', 'd4 d5 Bf4 Nf6 Nf3 c5 c3 e6 e3 Nc6 Nbd2 Bd6 Bg3', 'London System')
const b5 = bookOf(g5)!
check('transposed London still matches the London', b5.tree.def.id === 'london' && b5.depth >= 12, `${b5.tree.def.id} depth ${b5.depth}`)

const usage = openingUsage([g1, g2, g3, { ...g1, id: '4' }])
const bud = usage.find((u) => u.family === 'Budapest Defense' && u.side === 'b')!
check('games grouped by opening and side', bud.games.length === 2 && usage.length === 3, usage.map((u) => `${u.side}:${u.family}×${u.games.length}`).join(', '))
check('score computed from your side', bud.score === 1)
check("the opponent's deviation is collected (with how often)", bud.deviations[0]?.san === 'h3' && bud.deviations[0].by === 'opponent' && bud.deviations[0].count === 2, bud.deviations.map((d) => `${d.san}×${d.count}`).join(', '))
check('the deviation is recorded on the game too', b1.deviation?.san === 'h3' && b1.deviation.uci === 'h2h3')

// finder: transpositions are found by position
const c = new Chess()
for (const m of 'Nf3 d5 d4 Nf6 c4'.split(' ')) c.move(m)
const hits = openingsAt(c.fen()).map((h) => h.def.name)
check('a transposed move order still finds openings', hits.length > 0, hits.slice(0, 3).join(', '))

// White facing the Englund with an uncovered 2nd move: identified as the Englund, not "not in Outpost"
const g6 = game('6', 'w', 'd4 e5 Bf4 exd4 Qxd4 Nc6 Qd2 d6', 'Englund Gambit')
const b6 = bookOf(g6)!
check('an uncovered Englund line is still identified as the Englund', b6.tree.def.id.startsWith('englund') && b6.identified, `${b6.tree.def.id} depth ${b6.depth}`)

// coverage: pretend you've studied the Budapest (Black) and the King's Gambit (White)
const seen = { correct: 1, wrong: 0, streak: 1, last: Date.now(), box: 1, due: Date.now() }
mem['ctt.progress.v1'] = JSON.stringify({ budapest: { nodes: { 'd4 Nf6 c4': seen }, learned: [] }, 'kings-gambit': { nodes: { '': seen }, learned: [] } })
const cov = coverage()
const vs = (m: string) => cov.black.find((g) => g.moves[0] === m)!
check('Budapest answers 1.d4', vs('d4').covered.some((d) => d.id === 'budapest'))
check('1.e4 is a gap as Black', !vs('e4').covered.length && vs('e4').suggest.length > 0, vs('e4').suggest.map((d) => d.name).join(', '))
check('1.Nc3 is flagged with a suggestion or a build-it note', !vs('Nc3').covered.length, vs('Nc3').suggest.map((d) => d.name).join(', ') || 'none in Outpost')
const e4 = cov.white.find((w) => w.first === 'e4')
check("King's Gambit gives you 1.e4 as White", !!e4)
const c5 = e4?.replies.find((r) => r.moves[1] === 'c5')
check('1.e4 c5 is uncovered by the King\'s Gambit, with suggestions', !!c5 && !c5.covered.length && c5.suggest.length > 0, c5?.suggest.map((d) => d.name).join(', '))
const e5 = e4?.replies.find((r) => r.moves[1] === 'e5')
check('1.e4 e5 is covered', !!e5 && e5.covered.length > 0)

// importing: nothing is added twice
const pgnA = '[White "Me"]\n[Black "Opp"]\n[Result "1-0"]\n[Date "2026.11.01"]\n\n1. e4 e5 2. Nf3 Nc6 1-0'
const pgnB = '[White "Opp"]\n[Black "Me"]\n[Result "0-1"]\n[Date "2026.11.02"]\n\n1. d4 d5 2. c4 e6 0-1'
check('first import adds both games', addGames('Me', 'pgn', parsePgnText(pgnA + '\n\n' + pgnB, 'Me')) === 2)
check('pasting the same games again adds nothing', addGames('Me', 'pgn', parsePgnText(pgnB + '\n\n' + pgnA, 'Me')) === 0, 'reordered paste')
const fromLichess = { ...parsePgnText(pgnA, 'Me')[0], id: 'li:abc123', source: 'lichess' as const }
check('the same game from Lichess is recognized as a duplicate', addGames('Me', 'lichess', [fromLichess]) === 0)
const newGame = { ...fromLichess, id: 'li:new1', sans: ['e4', 'c5'] }
check('a genuinely new game is still added', addGames('Me', 'lichess', [newGame]) === 1, `${getGames().games.length} games stored`)
check('re-importing your last N Lichess games only adds the new ones', addGames('Me', 'lichess', [newGame, { ...newGame, id: 'li:new2', sans: ['e4', 'e6'] }]) === 1, `${getGames().games.length} games stored`)

console.log(fails ? `\n${fails} failed` : '\nall passed')
process.exit(fails ? 1 : 0)
