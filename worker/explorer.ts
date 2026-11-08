// Proxy for the Lichess opening explorer, which now needs a token. The token stays on the server
// (Worker secret LICHESS_TOKEN); answers are cached at the edge for a week, so each position is
// fetched from Lichess about once no matter how many people look at it.

import { ipOf, json, limited, type Env } from './util'

const WEEK = 7 * 24 * 3600
const FEN = /^[1-8pnbrqkPNBRQK/]{15,90} [wb] (-|[KQkq]{1,4}) (-|[a-h][36]) \d{1,3} \d{1,4}$/

export async function explorer(req: Request, env: Env, url: URL, ctx: ExecutionContext): Promise<Response> {
  if (!env.LICHESS_TOKEN) return json({ error: 'The opening explorer is not set up on this server' }, 503)
  const fen = url.searchParams.get('fen') ?? ''
  const db = url.searchParams.get('db') === 'masters' ? 'masters' : 'lichess'
  if (!FEN.test(fen)) return json({ error: 'Bad position' }, 400)

  // normalise so equivalent requests share a cache entry (move counters don't matter)
  const parts = fen.split(' ')
  const key = new URL(`https://explorer-cache.outpost/${db}`)
  key.searchParams.set('fen', `${parts.slice(0, 4).join(' ')} 0 1`)
  const cache = caches.default
  const hit = await cache.match(key.toString())
  if (hit) return new Response(hit.body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Cache': 'HIT' } })

  if (limited(ipOf(req), 'explorer', 300, 60 * 60_000)) return json({ error: 'Slow down a little' }, 429)
  const upstream = new URL(`https://explorer.lichess.ovh/${db}`)
  upstream.searchParams.set('fen', `${parts.slice(0, 4).join(' ')} 0 1`)
  upstream.searchParams.set('moves', '12')
  upstream.searchParams.set('topGames', '0')
  if (db === 'lichess') {
    upstream.searchParams.set('recentGames', '0')
    upstream.searchParams.set('speeds', 'blitz,rapid,classical')
    upstream.searchParams.set('ratings', '1400,1600,1800,2000,2200')
  }
  const r = await fetch(upstream, { headers: { Authorization: `Bearer ${env.LICHESS_TOKEN}`, Accept: 'application/json', 'User-Agent': 'Outpost chess trainer' } })
  if (r.status === 429) return json({ error: 'Lichess is rate-limiting — try again in a minute' }, 429)
  if (r.status === 401 || r.status === 403) return json({ error: 'The opening explorer token was rejected' }, 503)
  if (!r.ok) return json({ error: `Lichess said ${r.status}` }, 502)
  const data = (await r.json()) as { white: number; draws: number; black: number; moves: { uci: string; san: string; white: number; draws: number; black: number; averageRating?: number }[] }
  // keep only what the app uses
  const slim = JSON.stringify({
    total: data.white + data.draws + data.black,
    moves: data.moves.map((m) => ({ uci: m.uci, san: m.san, white: m.white, draws: m.draws, black: m.black, rating: m.averageRating })),
  })
  ctx.waitUntil(cache.put(key.toString(), new Response(slim, { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${WEEK}` } })))
  return new Response(slim, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Cache': 'MISS' } })
}
