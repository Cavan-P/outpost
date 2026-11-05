// Runs a PGN through Outpost's own move classification (same engine, same depth) and prints
// every move with its evaluation and label — handy for checking "why wasn't this flagged?".
// Usage: npm run analyze-pgn -- path/to/game.pgn [depth]
import './mock-storage'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Chess } from 'chess.js'
import { classifyMove, fensOf } from '../src/lib/gameAnalysis'
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

let resolveEval: ((s: { score: Score; best: string }) => void) | null = null
let last: { score: Score; best: string } = { score: { cp: 0 }, best: '' }
let blackToMove = false
const engine = require('stockfish')('lite-single', (line: string) => {
  const m = line.match(/score (cp|mate) (-?\d+).* pv (\S+)/)
  if (m) {
    const v = Number(m[2]) * (blackToMove ? -1 : 1) // to White's point of view, like the app
    last = { score: m[1] === 'mate' ? { mate: v } : { cp: v }, best: m[3] }
  }
  if (line.startsWith('bestmove')) resolveEval?.(last)
})

async function evaluate(fen: string) {
  const c = new Chess(fen)
  if (c.isCheckmate()) return { score: { cp: c.turn() === 'w' ? -100000 : 100000 }, best: '' }
  if (c.isGameOver()) return { score: { cp: 0 }, best: '' }
  blackToMove = c.turn() === 'b'
  return new Promise<{ score: Score; best: string }>((r) => {
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
  const cls = classifyMove(evals[i].score, evals[i + 1].score, mover, uci === evals[i].best)
  const label = `${Math.floor(i / 2) + 1}${mover === 'w' ? '.' : '...'}${sans[i]}`
  const flag = cls === 'blunder' || cls === 'mistake' || cls === 'inaccuracy' ? `  <- ${cls.toUpperCase()}` : ''
  console.log(`${label.padEnd(14)} ${formatScore(evals[i].score).padStart(7)} → ${formatScore(evals[i + 1].score).padStart(7)}  ${cls}${flag}`)
}
engine.terminate?.()
process.exit(0)
