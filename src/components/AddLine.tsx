import { useState } from 'react'
import { addSeenMove } from '../lib/extendLine'
import type { OpeningTree, TreeNode } from '../lib/tree'

export const plyLabel = (node: TreeNode, san: string) => {
  const ply = node.ply + 1
  return `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '…'}${san}`
}

/**
 * "+ add": put a move that took a game out of book into the opening, with Stockfish's best
 * continuation, so next time it's part of Learn and Practice.
 */
export function AddLineButton({ tree, node, uci, label = '+ add to opening' }: { tree: OpeningTree; node: TreeNode; uci: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [progress, setProgress] = useState('')
  if (state === 'done') return <span className="text-xs text-emerald-400">added ✓</span>
  return (
    <button
      className="text-xs text-emerald-400 hover:underline disabled:opacity-60"
      disabled={state === 'working'}
      title={`Add this move to ${tree.def.name}, with Stockfish's best continuation for both sides`}
      onClick={async () => {
        setState('working')
        try {
          await addSeenMove(tree.def.id, node, uci, 10, tree.def.side, (d, t) => setProgress(`${d}/${t}`))
          setState('done')
        } catch {
          setState('error')
        }
      }}
    >
      {state === 'working' ? `adding… ${progress}` : state === 'error' ? 'failed — retry' : label}
    </button>
  )
}
