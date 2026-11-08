// Shared helpers for the Worker modules.

export interface Env {
  ASSETS: Fetcher
  SYNC: R2Bucket
  DB?: D1Database
  /** Lichess personal API token (no scopes) for the opening explorer — set as a Worker secret */
  LICHESS_TOKEN?: string
}

export const baseHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
}

export const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...baseHeaders, 'Content-Type': 'application/json', ...extra } })

export async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Best-effort, per-isolate rate limiting (Cloudflare's WAF rules can be added on top).
const hits = new Map<string, { n: number; reset: number }>()
export function limited(ip: string, bucket: string, max: number, windowMs: number) {
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

export const ipOf = (req: Request) => req.headers.get('CF-Connecting-IP') ?? 'local'
