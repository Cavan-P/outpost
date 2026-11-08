// Outpost's Worker: serves the static site (dist/) and a tiny sync API.
//
// Sync without accounts: a device creates a random code; your progress is stored in R2 under a
// hash of that code (so the bucket never contains the codes themselves). Every save carries the
// ETag of the copy it was based on, so two devices can't overwrite each other — the loser gets
// 412, downloads, merges and tries again.

interface Env {
  ASSETS: Fetcher
  SYNC: R2Bucket
}

const MAX_BYTES = 5 * 1024 * 1024 // compressed snapshot
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ' // no 0/O, 1/I/L
const CODE_LEN = 12 // ≈ 59 bits

const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
}

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json', ...extra } })

const normalise = (code: string) => code.toUpperCase().replace(/[^0-9A-Z]/g, '')
const validCode = (c: string) => c.length === CODE_LEN && [...c].every((ch) => ALPHABET.includes(ch))

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LEN))
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')
}

async function keyFor(code: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`outpost-sync:${code}`))
  return `sync/${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

// Best-effort, per-isolate rate limiting (Cloudflare's WAF rules can be added on top).
const hits = new Map<string, { n: number; reset: number }>()
function limited(ip: string, bucket: string, max: number, windowMs: number) {
  const k = `${bucket}:${ip}`
  const now = Date.now()
  const h = hits.get(k)
  if (!h || now > h.reset) {
    hits.set(k, { n: 1, reset: now + windowMs })
    if (hits.size > 10_000) hits.clear()
    return false
  }
  h.n++
  return h.n > max
}

async function readBody(req: Request): Promise<ArrayBuffer | Response> {
  const len = Number(req.headers.get('Content-Length') ?? 0)
  if (len > MAX_BYTES) return json({ error: 'Too large' }, 413)
  const buf = await req.arrayBuffer()
  if (buf.byteLength > MAX_BYTES) return json({ error: 'Too large' }, 413)
  if (!buf.byteLength) return json({ error: 'Empty body' }, 400)
  return buf
}

async function sync(req: Request, env: Env, path: string): Promise<Response> {
  const ip = req.headers.get('CF-Connecting-IP') ?? 'local'
  // POST /api/sync — create a code, store the first snapshot
  if (path === '/api/sync' && req.method === 'POST') {
    if (limited(ip, 'create', 10, 60 * 60_000)) return json({ error: 'Too many new codes — try again later' }, 429)
    const body = await readBody(req)
    if (body instanceof Response) return body
    const code = newCode()
    const obj = await env.SYNC.put(await keyFor(code), body, { httpMetadata: { contentType: 'application/octet-stream' } })
    return json({ code, etag: obj.httpEtag }, 201)
  }

  const m = path.match(/^\/api\/sync\/([^/]+)$/)
  if (!m) return json({ error: 'Not found' }, 404)
  const code = normalise(decodeURIComponent(m[1]))
  if (!validCode(code)) return json({ error: 'That is not a valid sync code' }, 400)
  if (limited(ip, 'use', 240, 60 * 60_000)) return json({ error: 'Slow down a little' }, 429)
  const key = await keyFor(code)

  if (req.method === 'GET') {
    const obj = await env.SYNC.get(key)
    if (!obj) return json({ error: 'No data for that code' }, 404)
    return new Response(obj.body, { headers: { ...headers, 'Content-Type': 'application/octet-stream', ETag: obj.httpEtag } })
  }

  if (req.method === 'PUT') {
    const ifMatch = req.headers.get('If-Match')
    if (!ifMatch) return json({ error: 'If-Match required' }, 428)
    if (!(await env.SYNC.head(key))) return json({ error: 'No data for that code' }, 404)
    const body = await readBody(req)
    if (body instanceof Response) return body
    // only writes if nobody else saved since this device last downloaded
    const obj = await env.SYNC.put(key, body, { onlyIf: new Headers({ 'If-Match': ifMatch }), httpMetadata: { contentType: 'application/octet-stream' } })
    if (!obj) return json({ error: 'Changed on another device' }, 412)
    return json({ etag: obj.httpEtag })
  }

  if (req.method === 'DELETE') {
    await env.SYNC.delete(key)
    return json({ ok: true })
  }

  return json({ error: 'Method not allowed' }, 405)
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname.startsWith('/api/')) {
      // same-origin only: browsers send Origin on cross-site requests
      const origin = req.headers.get('Origin')
      if (origin && new URL(origin).host !== url.host) return json({ error: 'Forbidden' }, 403)
      try {
        return await sync(req, env, url.pathname)
      } catch (e) {
        return json({ error: 'Server error', detail: String(e).slice(0, 200) }, 500)
      }
    }
    return env.ASSETS.fetch(req)
  },
} satisfies ExportedHandler<Env>
