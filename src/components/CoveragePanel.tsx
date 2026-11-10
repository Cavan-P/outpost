import { useMemo, useState } from 'react'
import type { OpeningDef } from '../data/openings'
import { coverage, label, type Gap } from '../lib/coverage'

type Open = (id: string, mode: 'learn' | 'practice', flip: boolean) => void

const open = (d: OpeningDef, onOpen: Open) => onOpen(d.id.replace(/~flip$/, ''), 'learn', !!d.flipped)

function GapRow({ g, onOpen }: { g: Gap; onOpen: Open }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
      <span className="font-mono text-zinc-100">{label(g.moves)}</span>
      <span className="text-[11px] text-zinc-500">~{g.share}% of games</span>
      {g.suggest.length ? (
        <span className="flex flex-wrap items-baseline gap-x-2 text-xs">
          <span className="text-zinc-500">try</span>
          {g.suggest.map((d) => (
            <button key={d.id} className="text-brand-400 hover:underline" onClick={() => open(d, onOpen)}>
              {d.name}
              {d.flipped ? ' (face it)' : ''}
            </button>
          ))}
        </span>
      ) : (
        <span className="text-xs text-zinc-500">no Outpost opening covers it yet — build one in My Repertoire</span>
      )}
    </li>
  )
}

/** "You don't have an answer to 1.Nc3" — which first moves your studied openings cover, and what to learn next. */
export function CoveragePanel({ onOpen }: { onOpen: Open }) {
  const cov = useMemo(coverage, [])
  const [open_, setOpen] = useState(false)
  const blackGaps = cov.black.filter((g) => !g.covered.length)
  const blackDone = cov.black.filter((g) => g.covered.length)
  const whiteGaps = cov.white.flatMap((w) => w.replies.filter((r) => !r.covered.length))
  const blackShare = Math.round(blackDone.reduce((s, g) => s + g.share, 0))
  const total = blackGaps.length + whiteGaps.length + (cov.white.length ? 0 : 1)
  return (
    <section className="rounded-xl ring-1 ring-white/10">
      <button className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 p-4 text-left" onClick={() => setOpen((o) => !o)}>
        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Repertoire coverage</span>
        <span className="text-sm text-zinc-300">
          As Black you answer {blackDone.length}/{cov.black.length} first moves (~{blackShare}% of games)
          {cov.white.length ? ` · as White, ${whiteGaps.length} common repl${whiteGaps.length === 1 ? 'y' : 'ies'} uncovered` : ' · no White repertoire yet'}
        </span>
        <span className="ml-auto text-xs text-brand-400">{open_ ? 'hide' : total ? `${total} gap${total === 1 ? '' : 's'} →` : 'details'}</span>
      </button>
      {open_ && (
        <div className="grid gap-6 border-t border-white/5 p-4 md:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-200">As Black, against…</h3>
            <div className="flex flex-wrap gap-1.5">
              {cov.black.map((g) => (
                <span
                  key={g.moves[0]}
                  title={g.covered.length ? `Covered by ${g.covered.map((d) => d.name).join(', ')}` : 'No studied answer yet'}
                  className={`rounded px-2 py-0.5 font-mono text-xs ring-1 ${g.covered.length ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30' : 'text-zinc-400 ring-white/10'}`}
                >
                  {g.covered.length ? '✓' : '✗'} 1.{g.moves[0]}
                </span>
              ))}
            </div>
            {blackGaps.length > 0 && (
              <ul className="space-y-1.5">
                {blackGaps.slice(0, 8).map((g) => (
                  <GapRow key={g.moves.join()} g={g} onOpen={onOpen} />
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-200">As White</h3>
            {!cov.white.length ? (
              <div className="space-y-1.5 text-sm text-zinc-400">
                <p>You haven't studied a White opening yet. Good places to start:</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {cov.whiteSuggest.map((d) => (
                    <button key={d.id} className="text-brand-400 hover:underline" onClick={() => open(d, onOpen)}>
                      {d.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              cov.white.map((w) => (
                <div key={w.first} className="space-y-1.5">
                  <p className="text-xs text-zinc-500">After 1.{w.first}, Black plays…</p>
                  <div className="flex flex-wrap gap-1.5">
                    {w.replies.map((g) => (
                      <span
                        key={g.moves[1]}
                        title={g.covered.length ? `Covered by ${g.covered.map((d) => d.name).join(', ')}` : 'No studied answer yet'}
                        className={`rounded px-2 py-0.5 font-mono text-xs ring-1 ${g.covered.length ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30' : 'text-zinc-400 ring-white/10'}`}
                      >
                        {g.covered.length ? '✓' : '✗'} …{g.moves[1]}
                      </span>
                    ))}
                  </div>
                  <ul className="space-y-1.5">
                    {w.replies
                      .filter((g) => !g.covered.length)
                      .slice(0, 5)
                      .map((g) => (
                        <GapRow key={g.moves.join()} g={g} onOpen={onOpen} />
                      ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </section>
  )
}
