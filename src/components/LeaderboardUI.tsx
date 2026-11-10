import { useEffect, useState } from 'react'
import { allOpenings } from '../lib/custom'
import { useProfile } from '../lib/game'
import { fetchBoard, join, leave, link, post, setFriends, useBoard, type BoardKind, type BoardResult } from '../lib/leaderboard'

const TABS: { id: BoardKind; label: string; unit: string }[] = [
  { id: 'week', label: 'This week', unit: 'XP' },
  { id: 'xp', label: 'All time', unit: 'XP' },
  { id: 'bosses', label: 'Bosses', unit: 'defeated' },
  { id: 'streak', label: 'Streaks', unit: 'days' },
  { id: 'gauntlet', label: 'Gauntlet', unit: 'pts' },
]

/** Join form: pick a nickname, or link an existing player key. */
function JoinForm() {
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [mode, setMode] = useState<'new' | 'link'>('new')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function go() {
    setBusy(true)
    setErr('')
    try {
      if (mode === 'new') await join(name)
      else await link(key)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500">Pick a nickname to appear on the public boards. Only your nickname, level and a few scores are shared — never your games or progress.</p>
      <div className="flex flex-wrap gap-2">
        {mode === 'new' ? (
          <input className="input w-48" placeholder="Nickname" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
        ) : (
          <input className="input w-full font-mono text-xs sm:w-72" placeholder="Player key from your other device" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} />
        )}
        <button className="btn-primary" disabled={busy || (mode === 'new' ? name.trim().length < 3 : !key.includes('.'))} onClick={go}>
          {busy ? '…' : mode === 'new' ? 'Join' : 'Link'}
        </button>
        <button className="text-xs text-zinc-500 hover:text-zinc-300" onClick={() => setMode(mode === 'new' ? 'link' : 'new')}>
          {mode === 'new' ? 'I already have a nickname' : 'Pick a new nickname'}
        </button>
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}
    </div>
  )
}

/** Profile → Leaderboards: real players, opt-in. */
export function LeaderboardCard() {
  const b = useBoard()
  useProfile() // re-render as XP changes
  const [tab, setTab] = useState<BoardKind>('week')
  const [friends, setFriendsOnly] = useState(false)
  const openings = allOpenings()
  const [opening, setOpening] = useState(openings[0]?.id ?? '')
  const [data, setData] = useState<BoardResult | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [friendText, setFriendText] = useState('')

  useEffect(() => {
    let live = true
    setLoading(true)
    setErr('')
    ;(async () => {
      if (b.key) await post()
      return fetchBoard(tab, { opening: tab === 'gauntlet' ? opening : undefined, friends })
    })()
      .then((d) => live && setData(d))
      .catch((e) => live && setErr((e as Error).message))
      .finally(() => live && setLoading(false))
    return () => void (live = false)
  }, [tab, opening, friends, b.key, b.friends.length])

  const unit = TABS.find((t) => t.id === tab)!.unit
  return (
    <section className="rounded-xl bg-zinc-900/80 p-4 ring-1 ring-white/5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">🌍 Leaderboards</h2>
        {b.name && <span className="text-xs text-zinc-500">you are <b className="text-zinc-300">{b.name}</b></span>}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-zinc-400">
          <input type="checkbox" checked={friends} onChange={(e) => setFriendsOnly(e.target.checked)} /> friends only
        </label>
      </div>
      <div className="mb-3 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`chip !px-2.5 !py-0.5 text-xs ${tab === t.id ? 'chip-active' : ''}`}>
            {t.label}
          </button>
        ))}
        {tab === 'gauntlet' && (
          <select className="input !py-0.5 text-xs" value={opening} onChange={(e) => setOpening(e.target.value)}>
            {openings.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {!b.key && (
        <div className="mb-3 rounded-lg bg-brand-500/10 p-3 ring-1 ring-brand-500/40">
          <p className="mb-1 text-sm font-semibold text-zinc-100">You're not on the leaderboards yet</p>
          <p className="mb-2 text-xs text-zinc-400">They're opt-in: nothing about you is posted until you choose a nickname. Your XP from before you join counts too.</p>
          <JoinForm />
        </div>
      )}
      {err ? (
        <p className="text-sm text-zinc-500">{err}</p>
      ) : loading && !data ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : data && data.list.length ? (
        <>
          <ol className="space-y-0.5 text-sm">
            {data.list.map((r) => (
              <li key={r.name} className={`flex items-center gap-3 rounded px-2 py-1 ${r.you ? 'bg-brand-500/15 ring-1 ring-brand-500/30' : ''}`}>
                <span className={`w-6 text-right tabular-nums ${r.rank <= 3 ? 'text-amber-300' : 'text-zinc-500'}`}>{r.rank}</span>
                <span className={`flex-1 truncate ${r.you ? 'font-semibold text-zinc-50' : 'text-zinc-300'}`}>{r.name}</span>
                <span className="text-xs text-zinc-500">Lv {r.level}</span>
                <span className="w-24 text-right tabular-nums text-zinc-300">
                  {r.score.toLocaleString()} <span className="text-xs text-zinc-500">{unit}</span>
                </span>
              </li>
            ))}
          </ol>
          {data.you && (
            <p className="mt-2 px-2 text-xs text-zinc-400">
              You: #{data.you.rank} of {data.total} · {data.you.score.toLocaleString()} {unit}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-zinc-500">
          {friends ? 'No scores from your friends yet — add their nicknames below.' : !b.key ? 'Nobody has joined yet — pick a nickname above to be the first.' : tab === 'gauntlet' ? 'No Gauntlet scores for this opening yet — run it in the Arena.' : 'Nobody on this board yet.'}
        </p>
      )}
      {friends && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input className="input w-48 text-sm" placeholder="Friend's nickname" value={friendText} onChange={(e) => setFriendText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (setFriends([...b.friends, friendText]), setFriendText(''))} />
          <button className="btn-secondary" onClick={() => (setFriends([...b.friends, friendText]), setFriendText(''))}>
            Add
          </button>
          {b.friends.map((f) => (
            <button key={f} className="chip !px-2 !py-0.5 text-xs" title="Remove" onClick={() => setFriends(b.friends.filter((x) => x !== f))}>
              {f} ✕
            </button>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-zinc-600">Weekly board resets on Monday (UTC). Scores are posted from your browser, so they're on the honor system.</p>
    </section>
  )
}

/** Settings → Leaderboards: your nickname, your player key, leave. */
export function LeaderboardSettings() {
  const b = useBoard()
  const [show, setShow] = useState(false)
  if (!b.key) return <JoinForm />
  return (
    <div className="space-y-2 text-sm">
      <p className="text-zinc-300">
        On the leaderboards as <b>{b.name}</b>.
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button className="text-brand-400 hover:underline" onClick={() => setShow((s) => !s)}>
          {show ? 'hide' : 'show'} player key
        </button>
        <span className="text-zinc-600">— paste it on another device to use the same nickname. Keep it private.</span>
      </div>
      {show && (
        <div className="flex items-center gap-2">
          <code className="break-all rounded bg-zinc-950 px-2 py-1 text-[11px] text-zinc-300">{b.key}</code>
          <button className="text-xs text-brand-400 hover:underline" onClick={() => void navigator.clipboard?.writeText(b.key!)}>
            copy
          </button>
        </div>
      )}
      {b.error && <p className="text-xs text-amber-300">{b.error}</p>}
      <button
        className="text-xs text-zinc-600 hover:text-red-400"
        onClick={() => {
          if (confirm('Leave the leaderboards? Your nickname and scores are deleted from the server.')) void leave()
        }}
      >
        Leave leaderboards
      </button>
    </div>
  )
}
