import { useSyncExternalStore } from 'react'

// Your own additions to any opening (built-in or custom): extra lines in the same SAN-with-notes
// format as the opening data, merged into the opening's tree everywhere (Learn, Practice, Review,
// the Arena…). Stored per opening id; synced between devices.

const KEY = 'ctt.ext.v1'

export interface ExtStore {
  lines: Record<string, string[]> // base opening id → added lines
  removed: string[] // "id|line" tombstones, so a line deleted on one device stays deleted after sync
}

function load(): ExtStore {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return { lines: s.lines ?? {}, removed: s.removed ?? [] }
  } catch {
    return { lines: {}, removed: [] }
  }
}

let store = load()
let version = 0
const subs = new Set<() => void>()
const changeHooks = new Set<() => void>()

function commit() {
  version++
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    /* storage full — keep in memory */
  }
  changeHooks.forEach((f) => f())
  subs.forEach((f) => f())
}

export const baseId = (id: string) => id.replace(/~flip$/, '')
export const extensionLines = (id: string) => store.lines[baseId(id)] ?? []
export const getExtensions = () => store

/** Re-render on change; the number changes every time anything is added or removed. */
export function useExtensionsVersion() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => void subs.delete(f)
    },
    () => version,
  )
}

/** For the tree cache: called whenever additions change. */
export function onExtensionsChange(f: () => void) {
  changeHooks.add(f)
}

export function addExtension(id: string, line: string) {
  const b = baseId(id)
  const cur = store.lines[b] ?? []
  if (cur.includes(line)) return
  store = { lines: { ...store.lines, [b]: [...cur, line] }, removed: store.removed.filter((r) => r !== `${b}|${line}`) }
  commit()
}

export function removeExtension(id: string, line: string) {
  const b = baseId(id)
  store = { lines: { ...store.lines, [b]: (store.lines[b] ?? []).filter((l) => l !== line) }, removed: [...new Set([...store.removed, `${b}|${line}`])] }
  commit()
}

/** After a sync wrote a merged copy. */
export function reloadExtensions() {
  store = load()
  commit()
}

/** Union of both devices' additions, minus anything either side deleted. */
export function mergeExtensions(a: ExtStore | null, b: ExtStore | null): ExtStore | null {
  if (!a || !b) return a ?? b
  const removed = [...new Set([...a.removed, ...b.removed])]
  const gone = new Set(removed)
  const lines: Record<string, string[]> = {}
  for (const id of new Set([...Object.keys(a.lines), ...Object.keys(b.lines)])) {
    const merged = [...new Set([...(a.lines[id] ?? []), ...(b.lines[id] ?? [])])].filter((l) => !gone.has(`${id}|${l}`))
    if (merged.length) lines[id] = merged
  }
  return { lines, removed }
}
