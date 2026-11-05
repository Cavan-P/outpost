import { useSyncExternalStore } from 'react'
import { OPENINGS, type OpeningDef } from '../data/openings'
import { buildTree, invalidateTree } from './tree'

// Your own repertoires, built on the board or imported from PGN. Stored in localStorage and
// treated exactly like the built-in openings everywhere (Learn, Practice, Face it, Review…).

const KEY = 'ctt.custom.v1'
let custom: OpeningDef[] = load()
const subs = new Set<() => void>()

function load(): OpeningDef[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

function commit() {
  custom = [...custom]
  try {
    localStorage.setItem(KEY, JSON.stringify(custom))
  } catch {
    /* quota — keep in memory */
  }
  subs.forEach((f) => f())
}

export function useCustomOpenings(): OpeningDef[] {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => void subs.delete(f)
    },
    () => custom,
  )
}

export const getCustomOpenings = () => custom

/** Built-in plus custom openings. */
export const allOpenings = (): OpeningDef[] => [...OPENINGS, ...custom]

export const newCustomId = () => `custom-${Date.now().toString(36)}`

/** Validates (every move must be legal) and saves. Throws with a readable message on an illegal line. */
export function saveCustomOpening(def: OpeningDef) {
  const clean: OpeningDef = { ...def, tags: [...new Set(['custom', ...def.tags])], lines: def.lines.map((l) => l.trim()).filter(Boolean), ideas: def.ideas.map((x) => x.trim()).filter(Boolean) }
  buildTree(clean) // throws on illegal moves
  invalidateTree(clean.id)
  const i = custom.findIndex((d) => d.id === clean.id)
  if (i >= 0) custom[i] = clean
  else custom.push(clean)
  commit()
}

export function deleteCustomOpening(id: string) {
  custom = custom.filter((d) => d.id !== id)
  invalidateTree(id)
  commit()
}
