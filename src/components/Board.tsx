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
    // Auto-queen: underpromotion is rare enough in opening/endgame drills.
    return onMove({ from, to, promotion: legal.promotion ? 'q' : undefined })
  }

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
  if (flash) squareStyles[flash.square] = { background: flash.color === 'good' ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)' }

  // The board fills its container's height, so pin the container to a square.
  return (
    // sized to the window height too, so the board and the result strip under it fit on screen together
    <div className="mx-auto w-full self-start" style={{ maxWidth: size === 'large' ? 'min(820px, max(320px, calc(100vh - 250px)))' : 'min(620px, max(320px, calc(100vh - 240px)))' }}>
      <div className="relative aspect-square w-full select-none">
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
      </div>
      {result && <div className="mt-3">{result}</div>}
    </div>
  )
}
