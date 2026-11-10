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
const MAX_PREMOVES = 10

type Premove = { from: string; to: string }

/** Half-moves played so far, from a FEN (to notice when a board jumps back to an earlier position). */
function plyOf(fen: string) {
  const parts = fen.split(' ')
  return (Number(parts[5]) - 1) * 2 + (parts[1] === 'b' ? 1 : 0)
}

/** The position as it will look after the queued premoves (ignoring the opponent's replies). */
function applyPremoves(fen: string, queue: Premove[], player: 'w' | 'b'): string {
  const c = new Chess(fen)
  for (const { from, to } of queue) {
    const piece = c.get(from as Square)
    if (!piece || piece.color !== player) break
    c.remove(from as Square)
    // castling moves the rook too
    if (piece.type === 'k' && Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) === 2) {
      const rank = from[1]
      const [rf, rt] = to[0] === 'g' ? ['h', 'f'] : ['a', 'd']
      const rook = c.get(`${rf}${rank}` as Square)
      if (rook) {
        c.remove(`${rf}${rank}` as Square)
        c.put(rook, `${rt}${rank}` as Square)
      }
    }
    const promotes = piece.type === 'p' && (to[1] === '8' || to[1] === '1')
    c.remove(to as Square)
    c.put(promotes ? { type: 'q', color: piece.color } : piece, to as Square)
  }
  return c.fen()
}


export function Board({ fen, orientation, onMove, interactive = true, arrows = [], lastMove, flash, player, blind = false, result, size = 'default' }: Props) {
  const settings = useSettings()
  const [light, dark] = boardColors(settings)
  const [selected, setSelected] = useState<string | null>(null)
  // Premoves: up to MAX_PREMOVES moves queued while the opponent is to move. They're shown on the
  // board as if played and fire one per turn; if one turns out illegal, the rest are dropped.
  const [queue, setQueue] = useState<Premove[]>([])
  // a pawn move waiting for you to pick the promotion piece
  const [promo, setPromo] = useState<{ from: string; to: string; color: 'w' | 'b' } | null>(null)
  const chess = useMemo(() => new Chess(fen), [fen])
  const opponentToMove = !!player && chess.turn() !== player && !chess.isGameOver()
  // while moves are queued, further moves queue too (they come after the queued ones)
  const premoving = !!player && interactive && (opponentToMove || queue.length > 0)
  const mover = premoving ? player! : chess.turn()
  const virtualFen = useMemo(() => (player && queue.length ? applyPremoves(fen, queue, player) : fen), [fen, queue, player])
  const view = useMemo(() => (virtualFen === fen ? chess : new Chess(virtualFen, { skipValidation: true })), [virtualFen, fen, chess])

  const targets = useMemo(() => {
    if (!selected) return []
    if (!premoving) return chess.moves({ square: selected as Square, verbose: true }).map((m) => m.to)
    // Premove hints: pretend it's our turn on the board as it will be after the queued moves.
    // Any square can still be chosen (e.g. a recapture onto a square your own piece stands on now).
    const parts = virtualFen.split(' ')
    parts[1] = player!
    parts[3] = '-'
    try {
      return new Chess(parts.join(' '), { skipValidation: true }).moves({ square: selected as Square, verbose: true }).map((m) => m.to)
    } catch {
      return []
    }
  }, [chess, virtualFen, selected, premoving, player])

  // react-chessboard memoizes its drop handler from when a drag *started*. A drag that begins during the
  // opponent's turn and ends after their move lands would otherwise see a stale position, so the
  // handlers below read everything through this ref instead of their closures.
  const live = useRef({ chess, premoving, onMove, queue })
  live.current = { chess, premoving, onMove, queue }

  // Fire the next queued premove as soon as it's our turn. If the position jumped backwards (a new
  // line, a retry) or the board went read-only, the queue is stale — drop it.
  const lastPly = useRef(plyOf(fen))
  useEffect(() => {
    const ply = plyOf(fen)
    const wentBack = ply < lastPly.current
    lastPly.current = ply
    if (!queue.length) return
    if (wentBack || !interactive || !player) {
      setQueue([])
      return
    }
    if (chess.turn() !== player || chess.isGameOver()) return
    const [next, ...rest] = queue
    const ok = tryMove(next.from, next.to, true)
    setQueue(ok ? rest : [])
  }, [fen, queue, interactive]) // eslint-disable-line react-hooks/exhaustive-deps

  function choose(from: string, to: string): boolean {
    if (live.current.premoving) {
      if (from !== to && live.current.queue.length < MAX_PREMOVES) setQueue((q) => [...q, { from, to }])
      return false
    }
    return tryMove(from, to)
  }

  /** `premove`: fired from the queue, so a promotion becomes a queen without asking. */
  function tryMove(from: string, to: string, premove = false): boolean {
    const { chess, onMove } = live.current
    const legal = chess.moves({ square: from as Square, verbose: true }).find((m) => m.to === to)
    if (!legal || !onMove) return false
    if (legal.promotion && !settings.autoQueen && !premove) {
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
  for (const pm of queue) {
    squareStyles[pm.from] = { background: 'rgba(168, 85, 247, 0.4)' }
    squareStyles[pm.to] = { background: 'rgba(168, 85, 247, 0.6)' }
  }
  if (selected) squareStyles[selected] = { background: 'rgba(56, 189, 248, 0.5)' }
  for (const t of blind ? [] : targets) {
    const occupied = view.get(t as Square)
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
            position: blind ? EMPTY : virtualFen,
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
              // read the piece from the position as shown after queued premoves (the board may be a blank blindfold board)
              const piece = view.get(square as Square)
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
                // clicking an empty square with nothing selected cancels the premoves
                if (!selected) setQueue([])
                setSelected(null)
              }
            },
            onSquareRightClick: () => {
              setQueue([])
              setSelected(null)
            },
          }}
        />
        {queue.length > 0 && (
          <div className="pointer-events-none absolute left-1 top-1 z-10 rounded bg-purple-600/90 px-1.5 py-0.5 text-[11px] font-semibold text-white shadow">
            {queue.length} premove{queue.length === 1 ? '' : 's'}
            {queue.length >= MAX_PREMOVES ? ' (max)' : ''} · right-click to cancel
          </div>
        )}
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
