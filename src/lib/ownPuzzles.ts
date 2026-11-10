import { addToSet, getProfile, notify } from './game'
import { MASTERED_BOX, getProgress, isDue, recordAnswer, untilText } from './progress'

// Puzzles from your own games use the same spaced repetition as opening positions: solve one and it
// comes back after 5 minutes, then an hour, a day, three days… Solve it on enough separate occasions
// and it retires — it stops appearing in training and the daily review, but stays in the "Retired"
// list for practice. The stats live in the progress store under a reserved key, so they sync.

const KEY = '#own-mistakes'

export const puzzleStat = (id: string) => getProgress(KEY).nodes[id]
export const isRetired = (id: string) => (getProfile().sets.ownRetired ?? []).includes(id)
export const isDuePuzzle = (id: string) => isDue(puzzleStat(id))

/** 0..1 — how close a puzzle is to retiring. */
export const retireProgress = (id: string) => Math.min(1, (puzzleStat(id)?.box ?? 0) / MASTERED_BOX)

/** Record an attempt. Returns true if this solve retired the puzzle. */
export function recordPuzzle(id: string, solved: boolean): boolean {
  if (isRetired(id)) return false // practicing a retired puzzle doesn't change anything
  const r = recordAnswer(KEY, id, solved ? 'correct' : 'wrong')
  if (solved && r.box >= MASTERED_BOX && addToSet('ownRetired', id)) {
    notify('🎓 Mistake retired — you\'ve fixed that one for good')
    return true
  }
  return false
}

/** When the next active puzzle comes due ("in 3 h"), or null if one is due now / none are left. */
export function nextDueText(ids: string[]): string | null {
  const now = Date.now()
  const dues = ids.filter((id) => !isRetired(id)).map((id) => puzzleStat(id)?.due ?? 0)
  if (!dues.length || dues.some((d) => d <= now)) return null
  return untilText(Math.min(...dues) - now)
}
