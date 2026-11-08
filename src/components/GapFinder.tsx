import { useEffect, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { findGaps, type Gap } from '../lib/gaps'
import { pathTo, type OpeningTree, type TreeNode } from '../lib/tree'

const label = (n: TreeNode) =>
  pathTo(n)
    .filter((x) => x.ply > 0)
    .map((x) => `${x.ply % 2 ? `${Math.ceil(x.ply / 2)}.` : ''}${x.san}`)
    .join(' ')

/** "Where is my repertoire thin?" — asks Stockfish for good opponent moves your lines don't cover. */
export function GapFinder({ tree, onJump, onAnalyze }: { tree: OpeningTree; onJump: (n: TreeNode) => void; onAnalyze: (fen: string) => void }) {
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle')
  const [progress, setProgress] = useState<[number, number]>([0, 0])
  const [gaps, setGaps] = useState<Gap[]>([])
  const stop = useRef(false)
  useEffect(() => {
    stop.current = false
    setState('idle')
    setGaps([])
    return () => void (stop.current = true)
  }, [tree])

  async function run() {
    setState('running')
    stop.current = false
    const g = await findGaps(tree, (d, t) => setProgress([d, t]), () => stop.current)
    if (stop.current) return
    setGaps(g)
    setState('done')
  }

  return (
    <section className="space-y-2 rounded-xl bg-zinc-900/80 p-4 text-sm ring-1 ring-white/5">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Repertoire gaps</h3>
        {state !== 'running' && (
          <button className="ml-auto text-xs text-brand-400 hover:underline" onClick={run}>
            {state === 'done' ? 'scan again' : 'scan with Stockfish'}
          </button>
        )}
      </div>
      {state === 'idle' && <p className="text-xs text-zinc-500">Finds strong opponent moves inside your lines that the book doesn't answer yet.</p>}
      {state === 'running' && (
        <div className="space-y-1">
          <div className="h-1 overflow-hidden rounded bg-zinc-800">
            <div className="h-full bg-brand-500" style={{ width: `${(progress[0] / Math.max(1, progress[1])) * 100}%` }} />
          </div>
          <p className="text-xs text-zinc-500">
            Checking position {progress[0]}/{progress[1]}…
          </p>
        </div>
      )}
      {state === 'done' &&
        (gaps.length ? (
          <ul className="max-h-64 space-y-1.5 overflow-auto">
            {gaps.map((g) => (
              <li key={g.node.id + g.uci} className="flex items-baseline gap-2">
                <button className="min-w-0 flex-1 truncate text-left text-zinc-400 hover:text-zinc-100" onClick={() => onJump(g.node)} title="Go to this position">
                  {label(g.node) || 'start'} <b className="font-mono text-amber-300">{g.node.ply % 2 === 0 ? `${g.node.ply / 2 + 1}.` : '…'}{g.san}</b>
                </button>
                <span className="text-[11px] text-zinc-600">{g.behind < 0.05 ? 'engine best' : `−${g.behind.toFixed(1)}`}</span>
                <button
                  className="text-xs text-brand-400 hover:underline"
                  onClick={() => {
                    const c = new Chess(g.node.fen)
                    c.move({ from: g.uci.slice(0, 2), to: g.uci.slice(2, 4), promotion: g.uci[4] })
                    onAnalyze(c.fen())
                  }}
                >
                  analyse
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-emerald-400">No holes found — every strong reply inside your lines is covered.</p>
        ))}
      {state === 'done' && gaps.length > 0 && <p className="text-[11px] text-zinc-600">Patch them in "My Repertoire" with your own lines.</p>}
    </section>
  )
}
