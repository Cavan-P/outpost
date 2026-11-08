import { useState } from 'react'
import { createCode, deleteEverywhere, formatCode, joinCode, localHasProgress, syncNow, turnOff, useSync, type SyncState } from '../lib/sync'

export function syncLabel(s: SyncState) {
  if (s.status === 'off') return ''
  if (s.status === 'syncing') return 'Syncing…'
  if (s.status === 'offline') return 'Offline — will sync later'
  if (s.status === 'error') return `Sync problem: ${s.error ?? 'unknown'}`
  if (!s.lastSync) return 'Sync on'
  const mins = Math.round((Date.now() - s.lastSync) / 60_000)
  return `Synced ${mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} h ago`}`
}

/** Settings → Sync: create a code, join one, sync now, turn off. */
export function SyncPanel() {
  const s = useSync()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [joining, setJoining] = useState(false)
  const [code, setCode] = useState('')
  const [ask, setAsk] = useState(false) // this device has progress: combine or replace?
  const [copied, setCopied] = useState(false)

  async function run(f: () => Promise<unknown>, ok?: string) {
    setBusy(true)
    setMsg(null)
    try {
      await f()
      if (ok) setMsg({ ok: true, text: ok })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message === 'offline' ? "Couldn't reach the server — check your connection." : (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  function join(mode: 'combine' | 'replace') {
    setAsk(false)
    void run(async () => {
      await joinCode(code, mode)
      setJoining(false)
      setCode('')
    }, mode === 'combine' ? "Joined — this device's progress was added to the synced copy." : 'Joined — this device now has your synced progress.')
  }

  if (s.code)
    return (
      <div className="space-y-3">
        <div className="rounded-lg bg-zinc-950/60 p-3 ring-1 ring-white/10">
          <p className="text-xs text-zinc-500">Your sync code — enter it on your other devices</p>
          <div className="mt-1 flex items-center gap-3">
            <span className="font-mono text-xl tracking-wider text-zinc-50">{formatCode(s.code)}</span>
            <button
              className="text-xs text-brand-400 hover:underline"
              onClick={() => {
                void navigator.clipboard?.writeText(formatCode(s.code!))
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              {copied ? 'copied' : 'copy'}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">Anyone with this code can see and change your progress — keep it to yourself.</p>
        </div>
        <p className={`text-xs ${s.status === 'error' ? 'text-red-400' : 'text-zinc-400'}`}>{syncLabel(s)}</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={busy || s.status === 'syncing'} onClick={() => void run(syncNow)}>
            Sync now
          </button>
          <button className="btn-secondary" disabled={busy} onClick={() => turnOff()} title="Stop syncing this device. Your other devices and the synced copy are untouched.">
            Turn off here
          </button>
          <button
            className="text-xs text-zinc-600 hover:text-red-400"
            disabled={busy}
            onClick={() => {
              if (confirm('Delete your synced copy from the server? Every device stops syncing; progress already on each device stays there.')) void run(deleteEverywhere, 'Deleted from the server.')
            }}
          >
            Delete synced copy
          </button>
        </div>
        {msg && <p className={`text-xs ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>}
      </div>
    )

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">Keep progress in step across your phone and computer. No account: you get a code to type on your other devices.</p>
      {s.error && <p className="text-xs text-amber-300">{s.error}</p>}
      {!joining ? (
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy} onClick={() => void run(createCode, 'Sync is on. Enter the code on your other devices.')}>
            {busy ? 'Setting up…' : 'Turn on sync'}
          </button>
          <button className="btn-secondary" disabled={busy} onClick={() => setJoining(true)}>
            I have a code
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <input className="input w-56 font-mono uppercase tracking-wider" placeholder="XXXX-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value)} autoFocus autoComplete="off" spellCheck={false} />
            <button className="btn-primary" disabled={busy || code.replace(/[^0-9a-z]/gi, '').length !== 12} onClick={() => (localHasProgress() ? setAsk(true) : join('replace'))}>
              Join
            </button>
            <button className="btn-secondary" onClick={() => setJoining(false)}>
              Cancel
            </button>
          </div>
          {ask && (
            <div className="space-y-2 rounded-lg bg-zinc-950/60 p-3 text-sm ring-1 ring-white/10">
              <p className="text-zinc-300">This device already has progress. What should happen to it?</p>
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" onClick={() => join('combine')}>
                  Combine both
                </button>
                <button className="btn-secondary" onClick={() => join('replace')}>
                  Replace with synced copy
                </button>
              </div>
              <p className="text-[11px] text-zinc-500">Combine adds this device's XP and progress to the synced copy. Replace throws away what's on this device.</p>
            </div>
          )}
        </div>
      )}
      {msg && <p className={`text-xs ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>}
    </div>
  )
}

/** Tiny status line for the sidebar. */
export function SyncStatus() {
  const s = useSync()
  if (s.status === 'off') return null
  return <span className={`block text-[11px] ${s.status === 'error' ? 'text-red-400' : 'text-zinc-600'}`}>☁ {syncLabel(s)}</span>
}
