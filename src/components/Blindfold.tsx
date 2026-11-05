import { Chess } from 'chess.js'
import { useState } from 'react'
import type { BoardMove } from './Board'

/** Type a move in SAN ("Nf3", "exd5", "O-O") or UCI ("g1f3"). */
export function MoveInput({ fen, onMove, disabled }: { fen: string; onMove: (m: BoardMove) => boolean; disabled?: boolean }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  function submit() {
    const t = text.trim()
    if (!t) return
    const c = new Chess(fen)
    let m
    try {
      m = /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(t) ? c.move({ from: t.slice(0, 2), to: t.slice(2, 4), promotion: t[4] }) : c.move(t)
    } catch {
      setError(`"${t}" isn't legal here`)
      return
    }
    setError('')
    setText('')
    onMove({ from: m.from, to: m.to, promotion: m.promotion })
  }

  return (
    <div className="flex items-center gap-2">
      <input
        className="input flex-1 min-w-0 font-mono"
        placeholder={disabled ? 'Wait for your turn…' : 'Type a move: Nf3, exd5, O-O…'}
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value)
          setError('')
        }}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        autoFocus
      />
      {error && <span className="text-xs text-red-400 shrink-0">{error}</span>}
    </div>
  )
}

/** Toggle + peek button + move input, shown under a board. */
export function BlindfoldBar({
  blind,
  setBlind,
  setPeek,
  fen,
  onMove,
  myTurn,
}: {
  blind: boolean
  setBlind: (b: boolean) => void
  setPeek: (b: boolean) => void
  fen: string
  onMove: (m: BoardMove) => boolean
  myTurn: boolean
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer select-none">
          <input type="checkbox" className="accent-violet-500" checked={blind} onChange={(e) => setBlind(e.target.checked)} />
          🙈 Blindfold <span className="text-xs text-zinc-500">(2× XP)</span>
        </label>
        {blind && (
          <button
            className="btn-secondary ml-auto select-none"
            onPointerDown={() => setPeek(true)}
            onPointerUp={() => setPeek(false)}
            onPointerLeave={() => setPeek(false)}
            title="Hold to see the pieces (no XP bonus for that move)"
          >
            👁 Hold to peek
          </button>
        )}
      </div>
      {blind && <MoveInput fen={fen} onMove={onMove} disabled={!myTurn} />}
    </div>
  )
}
