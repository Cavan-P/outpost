import { memo } from 'react'
import { boardColors, useSettings } from '../lib/settings'
import { PieceIcon } from './PieceIcon'

/** A lightweight, non-interactive board for thumbnails (plain grid — cheap enough for dozens on a page). */
export const MiniBoard = memo(function MiniBoard({ fen, orientation = 'white', lastMove }: { fen: string; orientation?: 'white' | 'black'; lastMove?: string }) {
  const [light, dark] = boardColors(useSettings())
  const rows = fen.split(' ')[0].split('/')
  const grid: (string | null)[][] = rows.map((r) => {
    const out: (string | null)[] = []
    for (const ch of r) {
      if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) out.push(null)
      else out.push(ch === ch.toUpperCase() ? `w${ch}` : `b${ch}`)
    }
    return out
  })
  const ranks = orientation === 'white' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0]
  const files = orientation === 'white' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0]
  const hi = new Set(lastMove ? [lastMove.slice(0, 2), lastMove.slice(2, 4)] : [])
  return (
    <div className="grid aspect-square w-full grid-cols-8 overflow-hidden rounded">
      {ranks.map((r) =>
        files.map((f) => {
          const sq = `${'abcdefgh'[f]}${8 - r}`
          const piece = grid[r]?.[f]
          return (
            <div key={sq} className="relative" style={{ background: (r + f) % 2 ? dark : light }}>
              {hi.has(sq) && <div className="absolute inset-0 bg-yellow-300/40" />}
              {piece && <PieceIcon code={piece} className="relative h-full w-full" />}
            </div>
          )
        }),
      )}
    </div>
  )
})
