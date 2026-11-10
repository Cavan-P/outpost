import { useMemo, useState } from 'react'
import { MedalBadge } from '../../components/GameUI'
import { AddLineButton, plyLabel } from '../../components/AddLine'
import { useExtensionsVersion } from '../../lib/extensions'
import { medalFor, openingUsage, type OpeningUsage } from '../../lib/openingIndex'
import type { ImportedGame } from '../../lib/games'

const baseId = (id: string) => id.replace(/~flip$/, '')

const covered = (u: OpeningUsage) => !!u.book && (u.book.identified || u.avgDepth >= 4)

function status(u: OpeningUsage): { tone: string; text: string } {
  if (!covered(u)) return { tone: 'text-amber-300', text: 'Not in Outpost yet' }
  if (u.avgDepth < 6) return { tone: 'text-sky-300', text: `In Outpost${u.book!.practiced ? '' : ' (not studied)'} — but not this line yet` }
  if (!u.book!.practiced) return { tone: 'text-sky-300', text: 'In Outpost — not studied' }
  if (u.youLeft > u.games.length / 2) return { tone: 'text-red-300', text: 'Studied, but you leave book early' }
  return { tone: 'text-emerald-400', text: 'Studied' }
}

/**
 * Openings from your imported games: how often, how you score, how far your games stay in
 * Outpost's book, and whether you've studied it — with a one-click next step for each.
 */
export function GameOpenings({ games, onOpenOpening, onFind }: { games: ImportedGame[]; onOpenOpening: (id: string, flip: boolean) => void; onFind: (sans: string[]) => void }) {
  const extVersion = useExtensionsVersion() // re-check after you add a line
  const usage = useMemo(() => openingUsage(games), [games, extVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  const [all, setAll] = useState(false)
  if (!usage.length) return null
  const gaps = usage.filter((u) => u.games.length >= 2 && (!covered(u) || !u.book!.practiced))
  const shown = all ? usage : usage.slice(0, 10)
  return (
    <section className="space-y-3 rounded-xl p-5 ring-1 ring-white/5">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Openings in your games</h3>
        {gaps.length > 0 && (
          <span className="text-xs text-amber-300">
            {gaps.length} opening{gaps.length === 1 ? '' : 's'} you meet often that you haven't studied
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr>
              <th className="font-normal">Opening</th>
              <th className="font-normal">Games</th>
              <th className="font-normal">Score</th>
              <th className="font-normal" title="Average number of moves your games stayed in Outpost's book">In book</th>
              <th className="font-normal">Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => {
              const st = status(u)
              const b = u.book
              const flip = !!b?.tree.def.flipped
              // the moves to explore: the common start of these games, up to where the book ran out
              const sans = u.games[0].sans.slice(0, Math.max(4, Math.min(12, Math.round(u.avgDepth) + 2)))
              return (
                <tr key={`${u.side}|${u.family}`} className="border-t border-white/5 align-top">
                  <td className="py-2 pr-2">
                    <span className="mr-1 text-zinc-500">{u.side === 'w' ? '♔' : '♚'}</span>
                    <span className="text-zinc-200">{u.family}</span>
                    {b && covered(u) && (
                      <span className="block text-[11px] text-zinc-500">
                        closest: {b.tree.def.name}
                        {flip ? ' (facing it)' : ''}
                      </span>
                    )}
                    {u.deviations.slice(0, 3).map((d) => (
                      <span key={d.node.id + d.san} className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[11px] text-zinc-400">
                        <span>
                          {d.by === 'opponent' ? 'Opponent left book with' : 'You played'} <b className="font-mono text-zinc-200">{plyLabel(d.node, d.san)}</b>
                          {d.count > 1 ? ` (${d.count}×)` : ''}
                        </span>
                        <AddLineButton tree={d.tree} node={d.node} uci={d.uci} />
                      </span>
                    ))}
                  </td>
                  <td className="py-2 tabular-nums text-zinc-400">{u.games.length}</td>
                  <td className={`py-2 tabular-nums ${u.score >= 0.5 ? 'text-emerald-400' : 'text-red-400'}`}>{Math.round(u.score * 100)}%</td>
                  <td className="py-2 tabular-nums text-zinc-400">{u.avgDepth ? `${(u.avgDepth / 2).toFixed(1)} moves` : '–'}</td>
                  <td className={`py-2 text-xs ${st.tone}`}>
                    <span className="flex items-center gap-1.5">
                      {st.text}
                      {b && b.practiced && <MedalBadge tier={medalFor(b.tree)} />}
                    </span>
                  </td>
                  <td className="py-2 text-right text-xs">
                    {b && covered(u) ? (
                      <button className="text-brand-400 hover:underline" onClick={() => onOpenOpening(baseId(b.tree.def.id), flip)}>
                        {b.practiced ? 'Practice' : 'Learn it'}
                      </button>
                    ) : (
                      <button className="text-brand-400 hover:underline" onClick={() => onFind(sans)}>
                        Find openings
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {usage.length > 10 && (
        <button className="text-xs text-zinc-400 hover:text-zinc-100" onClick={() => setAll((x) => !x)}>
          {all ? 'Show fewer' : `Show all ${usage.length}`}
        </button>
      )}
    </section>
  )
}
