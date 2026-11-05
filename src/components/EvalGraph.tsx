import { winProb } from '../lib/engine'
import type { MoveAnalysis } from '../lib/games'

const DOT: Record<MoveAnalysis['cls'], string | null> = { best: null, good: null, inaccuracy: '#facc15', mistake: '#fb923c', blunder: '#ef4444' }

/** White's winning chances over the game; click to jump to a move. Mistakes are marked with dots. */
export function EvalGraph({ moves, current, onPick }: { moves: MoveAnalysis[]; current: number; onPick: (ply: number) => void }) {
  const W = 600
  const H = 120
  const n = Math.max(1, moves.length)
  const x = (i: number) => (i / n) * W
  const y = (p: number) => H - p * H
  const pts = [`0,${y(0.5)}`, ...moves.map((m, i) => `${x(i + 1)},${y(winProb(m.after))}`)]
  const area = `M0,${H} L${pts.join(' L')} L${W},${H} Z`
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-28 w-full cursor-pointer rounded-lg bg-zinc-800"
      preserveAspectRatio="none"
      onClick={(e) => {
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
        onPick(Math.max(0, Math.min(moves.length, Math.round(((e.clientX - r.left) / r.width) * n))))
      }}
    >
      <path d={area} fill="#e4e4e7" opacity={0.9} />
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="#71717a" strokeDasharray="4 4" strokeWidth={1} />
      {moves.map((m, i) => DOT[m.cls] && <circle key={i} cx={x(i + 1)} cy={y(winProb(m.after))} r={3.5} fill={DOT[m.cls]!} stroke="#18181b" strokeWidth={1} />)}
      <line x1={x(current)} x2={x(current)} y1={0} y2={H} stroke="var(--color-brand-400)" strokeWidth={2} />
    </svg>
  )
}
