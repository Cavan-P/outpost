// Device sync: progress stored in R2 under a hash of a random code. See lib/sync.ts in the app.
import { baseHeaders, ipOf, json, limited, sha256, type Env } from './util'

const MAX_BYTES = 5 * 1024 * 1024 // compressed snapshot
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ' // no 0/O, 1/I/L
const CODE_LEN = 12 // ≈ 59 bits


const normalize = (code: string) => code.toUpperCase().replace(/[^0-9A-Z]/g, '')
const validCode = (c: string) => c.length === CODE_LEN && [...c].every((ch) => ALPHABET.includes(ch))

function newCode() {
  let out = ''
  while (out.length < CODE_LEN) {
    // rejection sampling keeps every character equally likely
    for (const b of crypto.getRandomValues(new Uint8Array(CODE_LEN * 2))) if (b < 248 && out.length < CODE_LEN) out += ALPHABET[b % ALPHABET.length]
  }
  return out
}

const keyFor = async (code: string) => `sync/${await sha256(`outpost-sync:${code}`)}`


async function readBody(req: Request): Promise<ArrayBuffer | Response> {
  const len = Number(req.headers.get('Content-Length') ?? 0)
  if (len > MAX_BYTES) return json({ error: 'Too large' }, 413)
  const buf = await req.arrayBuffer()
  if (buf.byteLength > MAX_BYTES) return json({ error: 'Too large' }, 413)
  if (!buf.byteLength) return json({ error: 'Empty body' }, 400)
  return buf
}

export async function sync(req: Request, env: Env, path: string): Promise<Response> {
  const ip = ipOf(req)
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
  const code = normalize(decodeURIComponent(m[1]))
  if (!validCode(code)) return json({ error: 'That is not a valid sync code' }, 400)
  if (limited(ip, 'use', 240, 60 * 60_000)) return json({ error: 'Slow down a little' }, 429)
  const key = await keyFor(code)

  if (req.method === 'GET') {
    const obj = await env.SYNC.get(key)
    if (!obj) return json({ error: 'No data for that code' }, 404)
    return new Response(obj.body, { headers: { ...baseHeaders, 'Content-Type': 'application/octet-stream', ETag: obj.httpEtag } })
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

