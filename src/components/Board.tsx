import { Chess, type Square } from 'chess.js'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Chessboard, type Arrow } from 'react-chessboard'
import { boardColors, isMinimal, useSettings } from '../lib/settings'

export interface BoardMove {
  from: string
  to: string
  promotion?: string
}

interface Props {
  fen: string
  orientation: 'white' | 'black'
  /** Return true if the move was accepted. Only legal moves are passed in. */
  onMove?: (m: BoardMove) => boolean
  interactive?: boolean
  arrows?: Arrow[]
  lastMove?: { from: string; to: string } | null
  flash?: { square: string; color: 'good' | 'bad' } | null
  /** The side you play. When set, you can queue one premove while the opponent is thinking. */
  player?: 'w' | 'b'
  /** Blindfold: pieces are hidden but you can still move by clicking squares (or typing — see MoveInput). */
  blind?: boolean
  /** Rendered directly under the board (e.g. a "line complete" strip) — never covering it. */
  result?: ReactNode
  /** 'large' lets the board grow past the usual 620px on pages where it's the main event */
  size?: 'default' | 'large'
}

const EMPTY = '8/8/8/8/8/8/8/8'


export function Board({ fen, orientation, onMove, interactive = true, arrows = [], lastMove, flash, player, blind = false, result, size = 'default' }: Props) {
  const settings = useSettings()
  const [light, dark] = boardColors(settings)
  const [selected, setSelected] = useState<string | null>(null)
  const [premove, setPremove] = useState<{ from: string; to: string } | null>(null)
  // a pawn move waiting for you to pick the promotion piece
  const [promo, setPromo] = useState<{ from: string; to: string; color: 'w' | 'b' } | null>(null)
  const chess = useMemo(() => new Chess(fen), [fen])
  const premoving = !!player && chess.turn() !== player && !chess.isGameOver()
  const mover = premoving ? player : chess.turn()

  const targets = useMemo(() => {
    if (!selected) return []
    if (!premoving) return chess.moves({ square: selected as Square, verbose: true }).map((m) => m.to)
    // Premove hints: pretend it's our turn. Any square can still be chosen by dragging (e.g. a recapture).
    const parts = fen.split(' ')
    parts[1] = player!
    parts[3] = '-'
    try {
      return new Chess(parts.join(' '), { skipValidation: true }).moves({ square: selected as Square, verbose: true }).map((m) => m.to)
    } catch {
      return []
    }
  }, [chess, fen, selected, premoving, player])

  // react-chessboard memoizes its drop handler from when a drag *started*. A drag that begins during the
  // opponent's turn and ends after their move lands would otherwise see a stale position, so the
  // handlers below read everything through this ref instead of their closures.
  const live = useRef({ chess, premoving, onMove })
  live.current = { chess, premoving, onMove }

  // Fire the queued premove as soon as it's our turn (also if it was queued just as the turn flipped);
  // drop it silently if it became illegal.
  useEffect(() => {
    if (!premove || !player || chess.turn() !== player) return
    setPremove(null)
    tryMove(premove.from, premove.to)
  }, [fen, premove]) // eslint-disable-line react-hooks/exhaustive-deps

  function choose(from: string, to: string): boolean {
    if (live.current.premoving) {
      if (from !== to) setPremove({ from, to })
      return false
    }
    return tryMove(from, to)
  }

  function tryMove(from: string, to: string): boolean {
    const { chess, onMove } = live.current
    const legal = chess.moves({ square: from as Square, verbose: true }).find((m) => m.to === to)
    if (!legal || !onMove) return false
    if (legal.promotion && !settings.autoQueen) {
      setPromo({ from, to, color: legal.color })
      return false
    }
    return onMove({ from, to, promotion: legal.promotion ? 'q' : undefined })
  }

  function promote(piece: 'q' | 'r' | 'b' | 'n') {
    const p = promo
    setPromo(null)
    if (p) live.current.onMove?.({ from: p.from, to: p.to, promotion: piece })
  }

  // a new position (or the board going read-only) cancels an open picker
  useEffect(() => setPromo(null), [fen, interactive])
  useEffect(() => {
    if (!promo) return
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPromo(null)
      const p = ({ q: 'q', r: 'r', b: 'b', n: 'n', k: 'n' } as const)[e.key.toLowerCase() as 'q']
      if (p) promote(p)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [promo]) // eslint-disable-line react-hooks/exhaustive-deps

  const squareStyles: Record<string, React.CSSProperties> = {}
  if (lastMove) {
    squareStyles[lastMove.from] = { background: 'rgba(255, 214, 10, 0.35)' }
    squareStyles[lastMove.to] = { background: 'rgba(255, 214, 10, 0.5)' }
  }
  if (premove) {
    squareStyles[premove.from] = { background: 'rgba(168, 85, 247, 0.45)' }
    squareStyles[premove.to] = { background: 'rgba(168, 85, 247, 0.6)' }
  }
  if (selected) squareStyles[selected] = { background: 'rgba(56, 189, 248, 0.5)' }
  for (const t of blind ? [] : targets) {
    const occupied = chess.get(t as Square)
    squareStyles[t] = occupied
      ? { background: 'radial-gradient(circle, transparent 58%, rgba(15,23,42,0.35) 60%)' }
      : { background: 'radial-gradient(circle, rgba(15,23,42,0.3) 22%, transparent 24%)' }
  }
  if (promo) squareStyles[promo.to] = { background: 'rgba(56, 189, 248, 0.5)' }
  if (flash) squareStyles[flash.square] = { background: flash.color === 'good' ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)' }

  // The board fills its container's height, so pin the container to a square.
  return (
    // sized to the window height too, so the board and the result strip under it fit on screen together
    <div className="mx-auto w-full self-start" style={{ maxWidth: size === 'large' ? 'min(820px, max(320px, calc(100vh - 250px)))' : 'min(620px, max(320px, calc(100vh - 240px)))' }}>
      <div className="relative aspect-square w-full select-none" style={{ containerType: 'inline-size' }}>
        <Chessboard
          options={{
            position: blind ? EMPTY : fen,
            boardOrientation: orientation,
            allowDragging: interactive,
            // react-chessboard keys arrows by squares; duplicates (book arrow == engine arrow) leave stale DOM behind
            arrows: arrows.filter((a, i) => arrows.findIndex((b) => b.startSquare === a.startSquare && b.endSquare === a.endSquare) === i),
            squareStyles,
            lightSquareStyle: { backgroundColor: light },
            darkSquareStyle: { backgroundColor: dark },
            showNotation: settings.coordinates,
            boardStyle: isMinimal(settings.theme) ? { borderRadius: 2 } : { borderRadius: 6, boxShadow: '0 10px 30px rgba(0,0,0,0.35)' },
            animationDurationInMs: settings.animationMs,
            showAnimations: settings.animationMs > 0,
            canDragPiece: ({ piece }) => interactive && piece.pieceType[0] === mover,
            onPieceDrop: ({ sourceSquare, targetSquare }) => {
              setSelected(null)
              if (!targetSquare) return false
              return choose(sourceSquare, targetSquare)
            },
            onSquareClick: ({ square }) => {
              if (!interactive) return
              // read the piece from the real position (the board may be showing an empty blindfold board)
              const piece = chess.get(square as Square)
              if (selected && piece?.color !== mover && (targets.includes(square as Square) || premoving)) {
                choose(selected, square)
                setSelected(null)
                return
              }
              if (selected && targets.includes(square as Square)) {
                choose(selected, square)
                setSelected(null)
                return
              }
              if (piece && piece.color === mover) setSelected(square === selected ? null : square)
              else {
                setSelected(null)
                setPremove(null)
              }
            },
            onSquareRightClick: () => {
              setPremove(null)
              setSelected(null)
            },
          }}
        />
        {promo && <PromotionPicker promo={promo} orientation={orientation} onPick={promote} onCancel={() => setPromo(null)} />}
      </div>
      {result && <div className="mt-3">{result}</div>}
    </div>
  )
}

const GLYPH = { w: { q: '♕', r: '♖', b: '♗', n: '♘' }, b: { q: '♛', r: '♜', b: '♝', n: '♞' } } as const

/** Four pieces stacked over the promotion square (towards the board's center), like on Lichess. */
function PromotionPicker({ promo, orientation, onPick, onCancel }: { promo: { to: string; color: 'w' | 'b' }; orientation: 'white' | 'black'; onPick: (p: 'q' | 'r' | 'b' | 'n') => void; onCancel: () => void }) {
  const file = promo.to.charCodeAt(0) - 97
  const col = orientation === 'white' ? file : 7 - file
  const rank = Number(promo.to[1])
  const atTop = (orientation === 'white') === (rank === 8)
  return (
    <div className="absolute inset-0 z-10 bg-black/40" onClick={onCancel} onContextMenu={(e) => (e.preventDefault(), onCancel())}>
      <div
        className="absolute flex flex-col overflow-hidden rounded-md shadow-2xl ring-1 ring-white/20"
        style={{ left: `${col * 12.5}%`, width: '12.5%', ...(atTop ? { top: 0 } : { bottom: 0, flexDirection: 'column-reverse' }) }}
        onClick={(e) => e.stopPropagation()}
      >
        {(['q', 'n', 'r', 'b'] as const).map((p) => (
          <button
            key={p}
            onClick={() => onPick(p)}
            title={`Promote to ${{ q: 'queen', r: 'rook', b: 'bishop', n: 'knight' }[p]} (${p === 'n' ? 'N' : p.toUpperCase()})`}
            className="flex aspect-square w-full items-center justify-center bg-zinc-100 leading-none text-zinc-900 hover:bg-amber-200"
            style={{ fontSize: '10cqw' }}
          >
            {GLYPH[promo.color][p]}
          </button>
        ))}
      </div>
    </div>
  )
}
