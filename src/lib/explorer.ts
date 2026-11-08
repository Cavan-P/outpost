// Move statistics from the Lichess opening explorer, through the Worker (/api/explorer), which
// holds the API token and caches answers. If the server has no token, everything here quietly
// returns null and the features that use it fall back.

export interface ExplorerMove {
  uci: string
  san: string
  white: number
  draws: number
  black: number
  rating?: number
}
export interface ExplorerData {
  total: number
  moves: ExplorerMove[]
}

const memo = new Map<string, Promise<ExplorerData | null>>()
let unavailable = false

export const games = (m: ExplorerMove) => m.white + m.draws + m.black

export function getExplorer(fen: string, db: 'lichess' | 'masters' = 'lichess', timeoutMs = 4000): Promise<ExplorerData | null> {
  if (unavailable) return Promise.resolve(null)
  const key = `${db}|${fen.split(' ').slice(0, 4).join(' ')}`
  const hit = memo.get(key)
  if (hit) return hit
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeoutMs)
  const p = fetch(`${import.meta.env.BASE_URL}api/explorer?${new URLSearchParams({ fen, db })}`, { signal: ctl.signal })
    .then(async (r) => {
      if (r.status === 503 || r.status === 404) unavailable = true // not configured on this server
      if (!r.ok) {
        memo.delete(key)
        return null
      }
      return (await r.json()) as ExplorerData
    })
    .catch(() => {
      memo.delete(key)
      return null
    })
    .finally(() => clearTimeout(t))
  memo.set(key, p)
  return p
}

export const explorerUnavailable = () => unavailable
