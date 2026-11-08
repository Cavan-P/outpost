import { useSyncExternalStore } from 'react'
import { analyzeGame } from './gameAnalysis'
import { getGames, saveAnalysis } from './games'

// Analyzes imported games one after another in the background; keeps running while you use other pages.

export interface RunnerState {
  running: boolean
  gameId: string | null
  gamesDone: number
  gamesTotal: number
  positions: [number, number]
  depth: number
}

let state: RunnerState = { running: false, gameId: null, gamesDone: 0, gamesTotal: 0, positions: [0, 0], depth: 12 }
let stopRequested = false
const subs = new Set<() => void>()
const set = (patch: Partial<RunnerState>) => {
  state = { ...state, ...patch }
  subs.forEach((f) => f())
}

export function useRunner() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => void subs.delete(f)
    },
    () => state,
  )
}

/** Analyze every game that isn't analyzed yet (or was analyzed shallower than `depth`). */
export async function runAnalysis(depth: number) {
  if (state.running) return
  stopRequested = false
  const queue = getGames().games.filter((g) => !g.analysis || g.analysis.depth < depth)
  set({ running: true, gamesDone: 0, gamesTotal: queue.length, depth })
  for (const g of queue) {
    if (stopRequested) break
    set({ gameId: g.id, positions: [0, g.sans.length + 1] })
    const a = await analyzeGame(g, depth, (d, t) => set({ positions: [d, t] }), () => stopRequested)
    if (a) saveAnalysis(g.id, a)
    set({ gamesDone: state.gamesDone + 1 })
  }
  set({ running: false, gameId: null })
}

export function stopAnalysis() {
  stopRequested = true
}
