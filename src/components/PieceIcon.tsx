import { defaultPieces } from 'react-chessboard'

/** A single piece drawn with the same artwork as the boards. `code` is like "wN" or "bq". */
export function PieceIcon({ code, className = 'h-8 w-8' }: { code: string; className?: string }) {
  const key = `${code[0]}${code[1].toUpperCase()}`
  const draw = defaultPieces[key]
  return <span className={`inline-block ${className}`}>{draw?.({ svgStyle: { width: '100%', height: '100%' } })}</span>
}
