import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Chessboard } from 'react-chessboard'
import { award, count, best, useProfile } from '../../lib/game'
import { boardColors, useSettings } from '../../lib/settings'

export const FILES = 'abcdefgh'
export const ALL_SQUARES = [...FILES].flatMap((f) => [1, 2, 3, 4, 5, 6, 7, 8].map((r) => `${f}${r}`))
export const randomSquare = () => ALL_SQUARES[Math.floor(Math.random() * 64)]
export const isLight = (sq: string) => (FILES.indexOf(sq[0]) + Number(sq[1])) % 2 === 0
export const shuffle = <T,>(xs: T[]) => xs.map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x)

/** A board for drills that don't need a legal chess position (empty boards, a lone knight…). */
export function PlainBoard({
  position = {},
  orientation = 'white',
  squareStyles = {},
  onSquareClick,
  showNotation = true,
}: {
  position?: Record<string, { pieceType: string }>
  orientation?: 'white' | 'black'
  squareStyles?: Record<string, React.CSSProperties>
  onSquareClick?: (square: string) => void
  showNotation?: boolean
}) {
  const [light, dark] = boardColors(useSettings())
  return (
    <div className="aspect-square w-full self-start select-none">
      <Chessboard
        options={{
          position,
          boardOrientation: orientation,
          allowDragging: false,
          showNotation,
          squareStyles,
          lightSquareStyle: { backgroundColor: light },
          darkSquareStyle: { backgroundColor: dark },
          boardStyle: { borderRadius: 6, boxShadow: '0 10px 30px rgba(0,0,0,0.35)' },
          animationDurationInMs: 120,
          onSquareClick: ({ square }) => onSquareClick?.(square),
        }}
      />
    </div>
  )
}

export interface DrillApi {
  running: boolean
  score: number
  hit: () => void
  miss: () => void
}

/**
 * Timed drill wrapper: start button, countdown, score, personal best and XP at the end.
 * `children` renders the drill itself and gets hit()/miss() to report answers.
 */
export function DrillShell({
  id,
  title,
  blurb,
  seconds,
  xpPerPoint,
  children,
}: {
  id: string
  title: string
  blurb: string
  seconds: number
  xpPerPoint: number
  children: (api: DrillApi) => ReactNode
}) {
  const profile = useProfile()
  const [running, setRunning] = useState(false)
  const [left, setLeft] = useState(seconds)
  const [score, setScore] = useState(0)
  const [misses, setMisses] = useState(0)
  const [summary, setSummary] = useState<string | null>(null)
  const scoreRef = useRef(0)
  scoreRef.current = score

  useEffect(() => {
    if (!running) return
    const end = Date.now() + seconds * 1000
    const t = setInterval(() => {
      const l = Math.max(0, Math.ceil((end - Date.now()) / 1000))
      setLeft(l)
      if (l === 0) {
        clearInterval(t)
        setRunning(false)
        const final = scoreRef.current
        const isBest = best(id, final)
        award(final * xpPerPoint + (isBest && final > 0 ? 25 : 0), isBest && final > 0 ? `New best in ${title}!` : `${title}: ${final}`, `drill:${title}`)
        count('drills')
        setSummary(isBest && final > 0 ? `🏆 New personal best: ${final}!` : `Score: ${final}`)
      }
    }, 200)
    return () => clearInterval(t)
  }, [running, seconds, id, title, xpPerPoint])

  function start() {
    setScore(0)
    setMisses(0)
    setLeft(seconds)
    setSummary(null)
    setRunning(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-50">{title}</h2>
          <p className="text-sm text-zinc-400">{blurb}</p>
        </div>
        <div className="ml-auto flex items-center gap-4 text-sm">
          <span className="text-zinc-400">
            best <b className="text-zinc-100">{profile.bests[id] ?? 0}</b>
          </span>
          <span className="text-2xl font-mono font-bold text-emerald-400 tabular-nums">{score}</span>
          {misses > 0 && <span className="text-red-400 tabular-nums">✗{misses}</span>}
          <span className={`font-mono tabular-nums ${left <= 5 && running ? 'text-red-400' : 'text-zinc-300'}`}>{left}s</span>
          <button className="btn-primary" onClick={start} disabled={running}>
            {summary ? 'Again' : running ? 'Go!' : 'Start'}
          </button>
        </div>
      </div>
      <div className="h-1.5 rounded bg-zinc-800 overflow-hidden">
        <div className="h-full bg-brand-500 transition-all duration-200" style={{ width: `${(left / seconds) * 100}%` }} />
      </div>
      {summary && <div className="rounded-lg bg-emerald-950/50 p-3 text-emerald-200 font-semibold">{summary}</div>}
      {children({ running, score, hit: () => setScore((s) => s + 1), miss: () => setMisses((m) => m + 1) })}
    </div>
  )
}
