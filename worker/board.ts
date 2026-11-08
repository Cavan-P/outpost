// Leaderboards in D1. Opt-in: you pick a nickname and get a secret player key; only a few numbers
// are ever posted (weekly XP, total XP, bosses, medals, streak, Gauntlet bests). Scores come from
// the browser, so they're sanity-checked but ultimately on the honour system.

import { ipOf, json, limited, sha256, type Env } from './util'

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, secret TEXT NOT NULL,
    created INTEGER NOT NULL, updated INTEGER NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 1, bosses INTEGER NOT NULL DEFAULT 0,
    medals INTEGER NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS weekly (player TEXT NOT NULL, week INTEGER NOT NULL, xp INTEGER NOT NULL, PRIMARY KEY (player, week))`,
  `CREATE INDEX IF NOT EXISTS weekly_rank ON weekly (week, xp DESC)`,
  `CREATE TABLE IF NOT EXISTS gauntlet (player TEXT NOT NULL, opening TEXT NOT NULL, score INTEGER NOT NULL, PRIMARY KEY (player, opening))`,
  `CREATE INDEX IF NOT EXISTS gauntlet_rank ON gauntlet (opening, score DESC)`,
]
let ready = false
async function ensure(db: D1Database) {
  if (ready) return
  await db.batch(SCHEMA.map((s) => db.prepare(s)))
  ready = true
}

// same curve as the app (lib/game.ts)
const step = (level: number) => Math.round(80 + 25 * Math.pow(level, 1.2))
function levelOf(xp: number) {
  let level = 1
  let floor = 0
  while (level < 100 && xp >= floor + step(level)) floor += step(level++)
  return level
}

/** Monday-based week number (UTC), the same scheme as the app's weekIndex. */
const weekNow = () => Math.floor((Date.now() / 86_400_000 + 3) / 7)

const NAME = /^[A-Za-z0-9_-]{3,20}$/
const RESERVED = /^(admin|outpost|moderator|anthropic|lichess|chesscom|system|you)$/i
const int = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)))

function newSecret() {
  return [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** "id.secret" → the player row, if the secret matches. */
async function auth(db: D1Database, req: Request) {
  const key = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const [id, secret] = key.split('.')
  if (!id || !secret) return null
  const row = await db.prepare('SELECT * FROM players WHERE id = ?').bind(id).first<Record<string, number | string>>()
  if (!row || row.secret !== (await sha256(`outpost-board:${secret}`))) return null
  return row
}

export async function board(req: Request, env: Env, path: string, url: URL): Promise<Response> {
  if (!env.DB) return json({ error: 'Leaderboards are not set up on this server' }, 503)
  const db = env.DB
  await ensure(db)
  const ip = ipOf(req)

  // POST /api/board/join {name} → {id, name, key}
  if (path === '/api/board/join' && req.method === 'POST') {
    if (limited(ip, 'board-join', 5, 60 * 60_000)) return json({ error: 'Too many sign-ups — try again later' }, 429)
    const { name } = (await req.json().catch(() => ({}))) as { name?: string }
    const n = String(name ?? '').trim()
    if (!NAME.test(n) || RESERVED.test(n)) return json({ error: 'Nicknames are 3–20 letters, numbers, - or _' }, 400)
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    const secret = newSecret()
    try {
      await db.prepare('INSERT INTO players (id, name, secret, created, updated) VALUES (?, ?, ?, ?, ?)').bind(id, n, await sha256(`outpost-board:${secret}`), Date.now(), Date.now()).run()
    } catch {
      return json({ error: 'That nickname is taken' }, 409)
    }
    return json({ id, name: n, key: `${id}.${secret}` }, 201)
  }

  // GET /api/board/me (auth) → your name, to link another device with your key
  if (path === '/api/board/me' && req.method === 'GET') {
    const me = await auth(db, req)
    return me ? json({ id: me.id, name: me.name }) : json({ error: 'Unknown player key' }, 401)
  }

  // POST /api/board/scores (auth) {weekXp, xp, bosses, medals, streak, gauntlet: {opening: score}}
  if (path === '/api/board/scores' && req.method === 'POST') {
    if (limited(ip, 'board-post', 120, 60 * 60_000)) return json({ error: 'Slow down a little' }, 429)
    const me = await auth(db, req)
    if (!me) return json({ error: 'Unknown player key' }, 401)
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const xp = int(b.xp, 2_000_000)
    // sanity checks: no wild jumps, no impossible weeks
    const gained = xp - Number(me.xp)
    const hours = Math.max(1, (Date.now() - Number(me.updated)) / 3_600_000)
    if (gained > 3000 + hours * 400) return json({ error: 'That is a suspicious amount of XP' }, 422)
    const weekXp = Math.min(int(b.weekXp, 25_000), xp)
    const stmts = [
      db.prepare('UPDATE players SET xp = MAX(xp, ?), level = ?, bosses = ?, medals = ?, streak = ?, updated = ? WHERE id = ?').bind(xp, levelOf(Math.max(xp, Number(me.xp))), int(b.bosses, 200), int(b.medals, 400), int(b.streak, 5000), Date.now(), me.id),
      db.prepare('INSERT INTO weekly (player, week, xp) VALUES (?, ?, ?) ON CONFLICT (player, week) DO UPDATE SET xp = MAX(xp, excluded.xp)').bind(me.id, weekNow(), weekXp),
    ]
    const g = (b.gauntlet && typeof b.gauntlet === 'object' ? b.gauntlet : {}) as Record<string, unknown>
    for (const [opening, score] of Object.entries(g).slice(0, 120))
      if (/^[a-z0-9~-]{2,60}$/.test(opening))
        stmts.push(db.prepare('INSERT INTO gauntlet (player, opening, score) VALUES (?, ?, ?) ON CONFLICT (player, opening) DO UPDATE SET score = MAX(score, excluded.score)').bind(me.id, opening, int(score, 300)))
    await db.batch(stmts)
    return json({ ok: true })
  }

  // DELETE /api/board/me (auth) — leave the leaderboards
  if (path === '/api/board/me' && req.method === 'DELETE') {
    const me = await auth(db, req)
    if (!me) return json({ error: 'Unknown player key' }, 401)
    await db.batch([db.prepare('DELETE FROM weekly WHERE player = ?').bind(me.id), db.prepare('DELETE FROM gauntlet WHERE player = ?').bind(me.id), db.prepare('DELETE FROM players WHERE id = ?').bind(me.id)])
    return json({ ok: true })
  }

  // GET /api/board?kind=week|level|bosses|streak|gauntlet&opening=&names=a,b&me=<id>
  if (path === '/api/board' && req.method === 'GET') {
    if (limited(ip, 'board-read', 600, 60 * 60_000)) return json({ error: 'Slow down a little' }, 429)
    const kind = url.searchParams.get('kind') ?? 'week'
    const names = (url.searchParams.get('names') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => NAME.test(s))
      .slice(0, 50)
    const meId = url.searchParams.get('me') ?? ''
    let base: string
    const args: (string | number)[] = []
    if (kind === 'week') {
      base = 'SELECT p.id, p.name, p.level, p.updated, w.xp AS score FROM weekly w JOIN players p ON p.id = w.player WHERE w.week = ?'
      args.push(weekNow())
    } else if (kind === 'gauntlet') {
      const opening = url.searchParams.get('opening') ?? ''
      if (!/^[a-z0-9~-]{2,60}$/.test(opening)) return json({ error: 'Which opening?' }, 400)
      base = 'SELECT p.id, p.name, p.level, p.updated, g.score AS score FROM gauntlet g JOIN players p ON p.id = g.player WHERE g.opening = ?'
      args.push(opening)
    } else {
      const col = kind === 'bosses' ? 'bosses' : kind === 'streak' ? 'streak' : 'xp'
      base = `SELECT p.id, p.name, p.level, p.updated, p.${col} AS score FROM players p WHERE 1 = 1`
    }
    const filter = names.length ? ` AND p.name IN (${names.map(() => '?').join(',')})` : '' // name is COLLATE NOCASE
    const rows = await db
      .prepare(`SELECT * FROM (${base}${filter}) WHERE score > 0 ORDER BY score DESC, updated ASC LIMIT 50`)
      .bind(...args, ...names)
      .all<{ id: string; name: string; level: number; score: number }>()
    const list = rows.results.map((r, i) => ({ rank: i + 1, name: r.name, level: r.level, score: r.score, you: r.id === meId }))
    // your own rank, even if you're outside the top 50
    let you: { rank: number; score: number } | null = null
    if (meId && !list.some((r) => r.you) && !names.length) {
      const mine = await db.prepare(`SELECT score FROM (${base}) WHERE id = ?`).bind(...args, meId).first<{ score: number }>()
      if (mine?.score) {
        const ahead = await db.prepare(`SELECT COUNT(*) AS n FROM (${base}) WHERE score > ?`).bind(...args, mine.score).first<{ n: number }>()
        you = { rank: (ahead?.n ?? 0) + 1, score: mine.score }
      }
    }
    const total = await db.prepare(`SELECT COUNT(*) AS n FROM (${base}) WHERE score > 0`).bind(...args).first<{ n: number }>()
    return json({ kind, week: weekNow(), total: total?.n ?? 0, list, you }, 200, { 'Cache-Control': 'no-store' })
  }

  return json({ error: 'Not found' }, 404)
}
