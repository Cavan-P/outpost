import { useEffect, useMemo, type ReactNode } from 'react'

interface Props {
  tone: 'success' | 'fail'
  title: string
  subtitle?: ReactNode
  /** Enter / Space triggers this (usually "Next") */
  onPrimary?: () => void
  primaryLabel?: string
  children?: ReactNode // extra actions
  burst?: boolean
}

/**
 * The result of a line / endgame / puzzle, shown as a strip directly under the board
 * (Board's `result` prop) so the final position stays visible.
 */
export function ResultCard({ tone, title, subtitle, onPrimary, primaryLabel = 'Next', children, burst = tone === 'success' }: Props) {
  useEffect(() => {
    if (!onPrimary) return
    const k = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onPrimary()
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onPrimary])

  // a few confetti particles flying out of the icon
  const particles = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2
        const r = 50 + Math.random() * 40
        return { dx: Math.cos(a) * r, dy: Math.sin(a) * r, color: ['#fbbf24', 'var(--color-brand-400)', '#f87171', '#60a5fa', '#34d399'][i % 5], delay: Math.random() * 100 }
      }),
    [],
  )
  const good = tone === 'success'

  return (
    <div className={`pop-in flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl px-4 py-3 ring-1 ${good ? 'bg-emerald-950/40 ring-emerald-500/40' : 'bg-red-950/40 ring-red-500/40'}`}>
      <div className="relative shrink-0">
        {burst &&
          particles.map((p, i) => (
            <span
              key={i}
              className="burst pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-sm"
              style={{ background: p.color, '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, animationDelay: `${p.delay}ms` } as React.CSSProperties}
            />
          ))}
        <span className={`grid h-10 w-10 place-items-center rounded-full text-xl font-bold ${good ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>{good ? '✓' : '✗'}</span>
      </div>
      <div className="min-w-0 flex-1 basis-48">
        <p className={`font-semibold ${good ? 'text-emerald-300' : 'text-red-300'}`}>{title}</p>
        {subtitle && <div className="text-sm text-zinc-300">{subtitle}</div>}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {children}
        {onPrimary && (
          <button className="btn-primary" onClick={onPrimary} autoFocus>
            {primaryLabel} <span className="text-xs opacity-60">↵</span>
          </button>
        )}
      </div>
    </div>
  )
}
