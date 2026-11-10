import { useSyncExternalStore } from 'react'
import { reloadCustom } from './custom'
import { reloadExtensions } from './extensions'
import { onGameEvent, reloadProfile } from './game'
import { reloadGames } from './games'
import { baseOf, emptyBase, merge, type Base, type Snapshot } from './syncMerge'

// Device sync through the Worker's /api/sync. The server only ever sees a gzipped JSON blob
// under a hash of your code. See worker/index.ts and lib/syncMerge.ts.

const KEYS = { progress: 'ctt.progress.v1', profile: 'ctt.profile.v1', custom: 'ctt.custom.v1', games: 'ctt.games.v1', ext: 'ctt.ext.v1' } as const
const CONFIG = 'ctt.sync.v1'
const BASE = 'ctt.sync.base.v1'

export interface SyncState {
  code: string | null
  status: 'off' | 'idle' | 'syncing' | 'error' | 'offline'
  lastSync: number
  error?: string
}

// ───────────── state ─────────────

function loadState(): SyncState {
  try {
    const c = JSON.parse(localStorage.getItem(CONFIG) ?? 'null')
    if (c?.code) return { code: c.code, status: 'idle', lastSync: c.lastSync ?? 0 }
  } catch {
    /* fall through */
  }
  return { code: null, status: 'off', lastSync: 0 }
}

let state = loadState()
const subs = new Set<() => void>()
function set(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  try {
    localStorage.setItem(CONFIG, JSON.stringify({ code: state.code, lastSync: state.lastSync }))
  } catch {
    /* ignore */
  }
  subs.forEach((f) => f())
}

export function useSync(): SyncState {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => void subs.delete(f)
    },
    () => state,
  )
}

export const formatCode = (c: string) => c.replace(/(.{4})(?=.)/g, '$1-')

// ───────────── snapshot ─────────────

const read = <T,>(k: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(k)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function collect(): Snapshot {
  return { v: 1, progress: read(KEYS.progress, {}), profile: read(KEYS.profile, null), custom: read(KEYS.custom, []), games: read(KEYS.games, null), ext: read(KEYS.ext, null) }
}

/** A cheap fingerprint of local data, to notice changes made while a sync was in flight. */
const fingerprint = () => Object.values(KEYS).map((k) => localStorage.getItem(k)?.length ?? 0).join(':') + (localStorage.getItem(KEYS.profile) ?? '').slice(0, 64)

function apply(s: Snapshot) {
  const write = (k: string, v: unknown) => {
    if (v === null || v === undefined) return
    localStorage.setItem(k, JSON.stringify(v))
  }
  write(KEYS.progress, s.progress)
  write(KEYS.profile, s.profile)
  write(KEYS.custom, s.custom)
  write(KEYS.games, s.games)
  write(KEYS.ext, s.ext)
  reloadExtensions()
  reloadProfile()
  reloadGames()
  reloadCustom()
}

const hasProgress = (s: Snapshot) => (s.profile?.xp ?? 0) > 0 || Object.keys(s.progress).length > 0 || s.custom.length > 0 || (s.games?.games.length ?? 0) > 0

const loadBase = (): Base => read(BASE, emptyBase())
const saveBase = (b: Base) => {
  try {
    localStorage.setItem(BASE, JSON.stringify(b))
  } catch {
    /* ignore */
  }
}

// ───────────── transport ─────────────

async function pack(s: Snapshot): Promise<Blob> {
  const stream = new Blob([JSON.stringify(s)]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Response(stream).blob()
}

async function unpack(r: Response): Promise<Snapshot> {
  const text = await new Response(r.body!.pipeThrough(new DecompressionStream('gzip'))).text()
  const s = JSON.parse(text) as Snapshot
  return { v: 1, progress: s.progress ?? {}, profile: s.profile ?? null, custom: s.custom ?? [], games: s.games ?? null, ext: s.ext ?? null }
}

class SyncError extends Error {
  status: number
  constructor(message: string, status = 0) {
    super(message)
    this.status = status
  }
}

async function api(path: string, init?: RequestInit) {
  let r: Response
  try {
    r = await fetch(`${import.meta.env.BASE_URL}api/sync${path}`, init)
  } catch {
    throw new SyncError('offline')
  }
  if (!r.ok && r.status !== 412) {
    let msg = `Server said ${r.status}`
    try {
      msg = (await r.json()).error ?? msg
    } catch {
      /* not json */
    }
    throw new SyncError(msg, r.status)
  }
  return r
}

async function download(code: string) {
  const r = await api(`/${code}`)
  return { etag: r.headers.get('ETag') ?? '', data: await unpack(r) }
}

// ───────────── operations ─────────────

let running: Promise<void> | null = null

/** Pull, merge, push. Safe to call any time; concurrent calls share one run. */
export function syncNow(): Promise<void> {
  if (!state.code) return Promise.resolve()
  return (running ??= run().finally(() => (running = null)))
}

async function run() {
  const code = state.code!
  set({ status: 'syncing', error: undefined })
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { etag, data: remote } = await download(code)
      const before = fingerprint()
      const local = collect()
      const merged = merge(local, remote, loadBase())
      const body = await pack(merged)
      const put = await api(`/${code}`, { method: 'PUT', headers: { 'If-Match': etag }, body })
      if (put.status === 412) continue // another device saved first: download again and re-merge
      // If you earned XP (etc.) while the upload was in flight, keep it: replay those changes on
      // top of the merged copy. They'll go up with the next sync, since the base is the upload.
      const final = fingerprint() === before ? merged : merge(collect(), merged, baseOf(local))
      apply(final)
      saveBase(baseOf(merged))
      if (final !== merged) setTimeout(() => void syncNow(), 5_000)
      set({ status: 'idle', lastSync: Date.now() })
      return
    }
    set({ status: 'error', error: 'Kept colliding with another device — will retry' })
  } catch (e) {
    const err = e as SyncError
    if (err.message === 'offline') set({ status: 'offline' })
    else if (err.status === 404) {
      // the data was deleted (turned off on another device)
      turnOff()
      set({ error: 'Sync was turned off on another device' })
    } else set({ status: 'error', error: err.message })
  }
}

/** Turn sync on with a new code, uploading this device's progress. */
export async function createCode(): Promise<string> {
  const snap = collect()
  const r = await api('', { method: 'POST', body: await pack(snap) })
  const { code } = (await r.json()) as { code: string }
  saveBase(baseOf(snap))
  set({ code, status: 'idle', lastSync: Date.now(), error: undefined })
  return code
}

/** Does this device have progress that joining would need to merge or replace? */
export const localHasProgress = () => hasProgress(collect())

/** Join an existing code. `combine` adds this device's progress to it; otherwise this device takes the synced copy. */
export async function joinCode(raw: string, mode: 'combine' | 'replace') {
  const code = raw.toUpperCase().replace(/[^0-9A-Z]/g, '')
  if (code.length !== 12) throw new Error('A sync code has 12 letters and numbers.')
  const { data } = await download(code)
  if (mode === 'replace') {
    apply(data)
    saveBase(baseOf(data))
  } else saveBase(emptyBase())
  set({ code, status: 'idle', error: undefined })
  if (mode === 'combine') await syncNow()
  else set({ lastSync: Date.now() })
}

/** Stop syncing on this device (the server copy stays for your other devices). */
export function turnOff() {
  try {
    localStorage.removeItem(BASE)
  } catch {
    /* ignore */
  }
  set({ code: null, status: 'off', lastSync: 0 })
}

/** Delete the server copy and stop syncing everywhere. */
export async function deleteEverywhere() {
  if (state.code) await api(`/${state.code}`, { method: 'DELETE' })
  turnOff()
}

// ───────────── schedule ─────────────

let started = false
/** Sync on start, when the tab is hidden, every 5 minutes, and a minute after you earn XP. */
export function startAutoSync() {
  if (started) return
  started = true
  let pending: ReturnType<typeof setTimeout> | null = null
  const soon = (ms: number) => {
    if (!state.code) return
    if (pending) clearTimeout(pending)
    pending = setTimeout(() => {
      pending = null
      void syncNow()
    }, ms)
  }
  soon(1500)
  setInterval(() => document.visibilityState === 'visible' && soon(0), 5 * 60_000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void syncNow()
    else if (Date.now() - state.lastSync > 60_000) soon(500)
  })
  window.addEventListener('online', () => soon(500))
  onGameEvent((e) => {
    if (e.kind === 'xp' || e.kind === 'achievement' || e.kind === 'medal') soon(60_000)
  })
}
