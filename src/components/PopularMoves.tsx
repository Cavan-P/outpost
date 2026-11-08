import { useEffect, useState } from 'react'
import { games, getExplorer, type ExplorerData } from '../lib/explorer'
import type { TreeNode } from '../lib/tree'

/** "What people actually play here" — Lichess club-level games (or masters), with your book moves ticked. */
export function PopularMoves({ node }: { node: TreeNode }) {
  const [db, setDb] = useState<'lichess' | 'masters'>('lichess')
  const [data, setData] = useState<ExplorerData | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    setData(undefined)
    void getExplorer(node.fen, db).then((d) => live && setData(d))
    return () => void (live = false)
  }, [node.fen, db])
  if (data === null) return null // explorer not available on this server
  const book = new Set(node.children.map((c) => c.uci))
  const total = data?.total ?? 0
  return (
    <section className="space-y-2 rounded-xl bg-zinc-900/80 p-4 text-sm ring-1 ring-white/5">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">What people play</h3>
        <div className="ml-auto flex gap-1 text-[11px]">
          {(['lichess', 'masters'] as const).map((d) => (
            <button key={d} onClick={() => setDb(d)} className={`rounded px-1.5 py-0.5 ${db === d ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {d === 'lichess' ? 'Club 1400–2200' : 'Masters'}
            </button>
          ))}
        </div>
      </div>
      {data === undefined ? (
        <p className="text-xs text-zinc-500">Loading…</p>
      ) : !data.moves.length ? (
        <p className="text-xs text-zinc-500">No games reached this position.</p>
      ) : (
        <ul className="space-y-1">
          {data.moves.slice(0, 8).map((m) => {
            const n = games(m)
            const share = n / Math.max(1, total)
            const w = m.white / Math.max(1, n)
            const d = m.draws / Math.max(1, n)
            return (
              <li key={m.uci} className="flex items-center gap-2">
                <span className={`w-14 font-mono ${book.has(m.uci) ? 'text-emerald-400' : 'text-zinc-300'}`}>
                  {m.san}
                  {book.has(m.uci) && ' ✓'}
                </span>
                <span className="w-10 text-right text-xs tabular-nums text-zinc-400">{(share * 100).toFixed(share < 0.1 ? 1 : 0)}%</span>
                <span className="flex h-2 flex-1 overflow-hidden rounded" title={`White ${(w * 100).toFixed(0)}% · draw ${(d * 100).toFixed(0)}% · Black ${((1 - w - d) * 100).toFixed(0)}%`}>
                  <span className="bg-zinc-100" style={{ width: `${w * 100}%` }} />
                  <span className="bg-zinc-500" style={{ width: `${d * 100}%` }} />
                  <span className="bg-zinc-800" style={{ width: `${(1 - w - d) * 100}%` }} />
                </span>
                <span className="w-14 text-right text-[11px] tabular-nums text-zinc-600">{n >= 1000 ? `${Math.round(n / 1000)}k` : n}</span>
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-[11px] text-zinc-600">✓ = in your book. Data: Lichess opening explorer.</p>
    </section>
  )
}
