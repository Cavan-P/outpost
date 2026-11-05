import { useEffect, useState } from 'react'
import { Chess } from 'chess.js'
import { formatPv, formatScore, getAnalysisEngine, winProb, type Analysis } from '../lib/engine'
import { describeEval, explainMove, type Explanation } from '../lib/explain'
import { getSettings } from '../lib/settings'

interface Props {
  fen: string
  /** from useAnalysis() in the parent, so the eval bar and panel share one search */
  analysis: Analysis | null
  enabled: boolean
  onToggle?: (on: boolean) => void
  /** called with the engine's best move so the board can draw an arrow */
  onBest?: (uci: string | null) => void
}

export function useAnalysis(fen: string, enabled: boolean, multipv = 3) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  useEffect(() => {
    setAnalysis(null)
    if (!enabled) return
    const chess = new Chess(fen)
    if (chess.isGameOver()) return
    let live = true
    const engine = getAnalysisEngine()
    void engine.analyze(fen, { depth: getSettings().depth, multipv }, (a) => live && setAnalysis(a)).then((a) => live && a.lines.length && setAnalysis(a))
    return () => {
      live = false
    }
  }, [fen, enabled, multipv])
  return analysis
}

export function EvalBar({ analysis, orientation }: { analysis: Analysis | null; orientation: 'white' | 'black' }) {
  const p = winProb(analysis?.lines[0])
  const whitePct = Math.round(p * 100)
  const label = formatScore(analysis?.lines[0])
  return (
    <div className={`relative w-3 sm:w-4 rounded overflow-hidden bg-zinc-800 flex ${orientation === 'white' ? 'flex-col' : 'flex-col-reverse'}`} title={label}>
      <div className="bg-zinc-700 transition-all duration-500" style={{ height: `${100 - whitePct}%` }} />
      <div className="bg-zinc-100 transition-all duration-500" style={{ height: `${whitePct}%` }} />
    </div>
  )
}

export function EnginePanel({ fen, analysis, enabled, onToggle, onBest }: Props) {
  const [why, setWhy] = useState<Explanation | null>(null)

  useEffect(() => {
    setWhy(null)
  }, [fen])

  const best = analysis?.lines[0]
  useEffect(() => {
    onBest?.(enabled && best ? best.pv[0] : null)
  }, [enabled, best?.pv[0], onBest]) // eslint-disable-line react-hooks/exhaustive-deps

  const chess = new Chess(fen)
  const over = chess.isCheckmate() ? 'Checkmate' : chess.isStalemate() ? 'Stalemate' : chess.isDraw() ? 'Draw' : null

  function explainBest() {
    if (!best) return
    setWhy(explainMove(fen, best.pv[0], best.pv))
  }

  return (
    <section className="rounded-xl bg-zinc-900/80 ring-1 ring-white/5 p-4 space-y-3">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-wide text-zinc-300 uppercase">Stockfish</h3>
        {onToggle && (
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
            <input type="checkbox" className="accent-brand-500" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
            Show engine
          </label>
        )}
      </header>

      {!enabled ? (
        <p className="text-sm text-zinc-500">Engine hidden — try to work it out yourself first.</p>
      ) : over ? (
        <p className="text-sm text-zinc-300">{over}.</p>
      ) : (
        <>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-mono font-semibold text-zinc-100">{formatScore(best)}</span>
            <span className="text-xs text-zinc-500">depth {analysis?.depth ?? 0}</span>
          </div>
          <p className="text-xs text-zinc-400">{best ? describeEval(best) : 'Thinking…'}</p>
          <ol className="space-y-1">
            {analysis?.lines.map((l) => (
              <li key={l.multipv} className="flex gap-2 text-sm">
                <span className={`w-14 shrink-0 font-mono ${l.multipv === 1 ? 'text-emerald-400' : 'text-zinc-400'}`}>{formatScore(l)}</span>
                <span className="text-zinc-300 truncate" title={formatPv(fen, l.pv, 16)}>
                  {formatPv(fen, l.pv, 8)}
                </span>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2 pt-1">
            <button className="btn-secondary" disabled={!best} onClick={explainBest}>
              Why is this best?
            </button>
          </div>
          {why && <WhyList explanation={why} />}
        </>
      )}
    </section>
  )
}

export function WhyList({ explanation, title }: { explanation: Explanation; title?: string }) {
  return (
    <div className="rounded-lg bg-emerald-950/40 p-3 text-sm">
      <p className="font-semibold text-emerald-300 mb-1">{title ?? `Why ${explanation.san}?`}</p>
      <ul className="list-disc pl-5 space-y-0.5 text-zinc-200">
        {explanation.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  )
}
