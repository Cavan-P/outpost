import { moveLabel, pathTo, type TreeNode } from '../lib/tree'

/** The current line as clickable move chips. */
export function MoveTrail({ node, onJump }: { node: TreeNode; onJump: (n: TreeNode) => void }) {
  const path = pathTo(node)
  if (!path.length) return <p className="text-sm text-zinc-500">Starting position.</p>
  return (
    <div className="flex flex-wrap gap-1 text-sm">
      {path.map((n) => (
        <button
          key={n.id}
          onClick={() => onJump(n)}
          className={`rounded px-1.5 py-0.5 font-mono ${n === node ? 'bg-brand-600 text-white' : 'text-zinc-300 hover:bg-zinc-800'}`}
        >
          {moveLabel(n)}
        </button>
      ))}
    </div>
  )
}

export function historyText(node: TreeNode) {
  return pathTo(node).map((n) => (n.ply % 2 === 1 ? `${Math.ceil(n.ply / 2)}.${n.san}` : n.san)).join(' ')
}
