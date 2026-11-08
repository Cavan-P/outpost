// Outpost's Worker: serves the static site (dist/) and a small API —
//   /api/sync      device sync (R2)                 worker/sync.ts
//   /api/board     opt-in leaderboards (D1)          worker/board.ts
//   /api/explorer  Lichess opening explorer proxy    worker/explorer.ts

import { board } from './board'
import { explorer } from './explorer'
import { sync } from './sync'
import { json, type Env } from './util'

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url)
    const path = url.pathname
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(req)
    // same-origin only: browsers send Origin on cross-site requests
    const origin = req.headers.get('Origin')
    if (origin && new URL(origin).host !== url.host) return json({ error: 'Forbidden' }, 403)
    try {
      if (path === '/api/sync' || path.startsWith('/api/sync/')) return await sync(req, env, path)
      if (path === '/api/board' || path.startsWith('/api/board/')) return await board(req, env, path, url)
      if (path === '/api/explorer' && req.method === 'GET') return await explorer(req, env, url, ctx)
      return json({ error: 'Not found' }, 404)
    } catch (e) {
      return json({ error: 'Server error', detail: String(e).slice(0, 200) }, 500)
    }
  },
} satisfies ExportedHandler<Env>
