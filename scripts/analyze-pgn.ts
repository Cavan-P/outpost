// Runs a PGN through Outpost's own move classification (same engine, same depth) and prints
// every move with its evaluation and label — handy for checking "why wasn't this flagged?".
// Usage: npm run analyze-pgn -- path/to/game.pgn [depth]
import './mock-storage'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Chess } from 'chess.js'
import { fensOf, labelMove } from '../src/lib/gameAnalysis'
import { uciToSan } from '../src/lib/engine'
import { formatScore } from '../src/lib/engine'
import type { Score } from '../src/lib/games'

const require = createRequire(import.meta.url)
const [file, depthArg] = process.argv.slice(2)
if (!file) {
  console.log('usage: npm run analyze-pgn -- game.pgn [depth]')
  process.exit(1)
}
const depth = Number(depthArg ?? 12)
const game = new Chess()
game.loadPgn(readFileSync(file, 'utf8'))
const sans = game.history()
const fens = fensOf(sans)

type Ev = { score: Score; best: string; pv: string[] }
let resolveEval: ((s: Ev) => void) | null = null
let last: Ev = { score: { cp: 0 }, best: '', pv: [] }
let blackToMove = false
const engine = require('stockfish')('lite-single', (line: string) => {
  const m = line.match(/score (cp|mate) (-?\d+).* pv (.+)$/)
  if (m) {
    const v = Number(m[2]) * (blackToMove ? -1 : 1) // to White's point of view, like the app
    const pv = m[3].trim().split(/\s+/)
    last = { score: m[1] === 'mate' ? { mate: v } : { cp: v }, best: pv[0], pv }
  }
  if (line.startsWith('bestmove')) resolveEval?.(last)
})

async function evaluate(fen: string) {
  const c = new Chess(fen)
  if (c.isCheckmate()) return { score: { cp: c.turn() === 'w' ? -100000 : 100000 }, best: '', pv: [] }
  if (c.isGameOver()) return { score: { cp: 0 }, best: '', pv: [] }
  blackToMove = c.turn() === 'b'
  return new Promise<Ev>((r) => {
    resolveEval = r
    engine.processCommand(`position fen ${fen}`)
    engine.processCommand(`go depth ${depth}`)
  })
}

engine.processCommand('uci')
const evals = []
for (const f of fens) evals.push(await evaluate(f))
for (let i = 0; i < sans.length; i++) {
  const mover = i % 2 === 0 ? 'w' : 'b'
  const mv = new Chess(fens[i]).move(sans[i])
  const uci = mv.from + mv.to + (mv.promotion ?? '')
  const { cls, tags } = labelMove(fens[i], fens[i + 1], { ply: i + 1, san: sans[i], uci, before: evals[i].score, after: evals[i + 1].score, best: evals[i].best, bestSan: evals[i].best ? uciToSan(fens[i], [evals[i].best])[0] : '', pv: evals[i].pv, reply: evals[i + 1].pv, loss: 0 }, mover)
  const label = `${Math.floor(i / 2) + 1}${mover === 'w' ? '.' : '...'}${sans[i]}`
  const flag = cls === 'blunder' || cls === 'mistake' || cls === 'inaccuracy' ? `  <- ${cls.toUpperCase()}` : ''
  console.log(`${label.padEnd(14)} ${formatScore(evals[i].score).padStart(7)} → ${formatScore(evals[i + 1].score).padStart(7)}  ${cls}${flag}${tags.length ? ` [${tags.join(', ')}]` : ''}`)
}
engine.terminate?.()
process.exit(0)
