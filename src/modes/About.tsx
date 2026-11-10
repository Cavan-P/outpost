import { useRef, useState } from 'react'

// About, credits and licenses — plus the "your data" controls (backup / restore / delete).
// The source link is required once the site is public: the bundled Stockfish engine is GPL-3.0.

/** Set VITE_REPO_URL (see .env.example) to your public repository before publishing. */
export const REPO_URL: string = import.meta.env.VITE_REPO_URL ?? ''

interface Credit {
  name: string
  what: string
  license: string
  url: string
}

const CREDITS: Credit[] = [
  { name: 'Stockfish 19', what: 'The chess engine behind every evaluation, explanation and opponent', license: 'GPL-3.0', url: 'https://github.com/official-stockfish/Stockfish' },
  { name: 'stockfish.js', what: "Nathan Rugg's WebAssembly build of Stockfish (lite, single-threaded, v19.0.1)", license: 'GPL-3.0', url: 'https://github.com/nmrugg/stockfish.js' },
  { name: 'chess.js', what: 'Move generation, validation and PGN parsing', license: 'BSD-2-Clause', url: 'https://github.com/jhlywa/chess.js' },
  { name: 'react-chessboard', what: 'The board component', license: 'MIT', url: 'https://github.com/Clariity/react-chessboard' },
  { name: 'Chess pieces (Cburnett)', what: 'Piece artwork by Colin M. L. Burnett, via Wikimedia Commons', license: 'GPL / BSD / GFDL / CC BY-SA 3.0', url: 'https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces' },
  { name: 'dnd kit', what: 'Drag and drop (used by the board)', license: 'MIT', url: 'https://github.com/clauderic/dnd-kit' },
  { name: 'React', what: 'UI library', license: 'MIT', url: 'https://react.dev' },
  { name: 'Tailwind CSS', what: 'Styling', license: 'MIT', url: 'https://tailwindcss.com' },
  { name: 'Vite', what: 'Build tool', license: 'MIT', url: 'https://vite.dev' },
  { name: 'Inter, Cormorant Garamond, Fraunces, Space Grotesk & JetBrains Mono', what: 'Typefaces, served by Google Fonts', license: 'SIL Open Font License 1.1', url: 'https://fonts.google.com' },
]

const SERVICES: Credit[] = [
  { name: 'Lichess API', what: 'Importing your Lichess games (only when you click Import)', license: 'Public API', url: 'https://lichess.org/api' },
  { name: 'Lichess endgame tablebase', what: 'Perfect-play benchmarks for the endgame star ratings', license: 'Public API', url: 'https://tablebase.lichess.ovh' },
  { name: 'chess.com Published-Data API', what: 'Importing your chess.com games (only when you click Import)', license: 'Public API', url: 'https://www.chess.com/news/view/published-data-api' },
  { name: 'Lichess opening explorer', what: '"What people play" move statistics, fetched through this site\'s server (only the position is sent)', license: 'Public API', url: 'https://lichess.org/api#tag/Opening-Explorer' },
  { name: 'Cloudflare', what: 'Hosting, plus storage for sync and the leaderboards — only if you turn them on', license: 'Service', url: 'https://www.cloudflare.com/privacypolicy/' },
]

const isOurKey = (k: string) => k.startsWith('ctt.')

function storedKeys() {
  const keys: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && isOurKey(k)) keys.push(k)
    }
  } catch {
    /* storage unavailable */
  }
  return keys
}

export function About() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const keys = storedKeys()
  const bytes = keys.reduce((n, k) => n + (localStorage.getItem(k)?.length ?? 0), 0)

  function backup() {
    const data = Object.fromEntries(keys.map((k) => [k, localStorage.getItem(k)]))
    const blob = new Blob([JSON.stringify({ app: 'outpost', saved: new Date().toISOString(), data }, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `outpost-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function restore(f: File) {
    try {
      const parsed = JSON.parse(await f.text())
      // 'chess-theory-trainer' backups come from before the rename
      if (!['outpost', 'chess-theory-trainer'].includes(parsed?.app) || typeof parsed.data !== 'object') throw new Error("That file isn't an Outpost backup.")
      if (!confirm('Replace everything in this browser with the backup?')) return
      for (const k of storedKeys()) localStorage.removeItem(k)
      for (const [k, v] of Object.entries(parsed.data)) if (isOurKey(k) && typeof v === 'string') localStorage.setItem(k, v)
      location.reload()
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    }
  }

  function wipe() {
    if (!confirm('Delete all your progress, games, repertoires, XP and settings from this browser? This cannot be undone (download a backup first if you might want it back).')) return
    for (const k of storedKeys()) localStorage.removeItem(k)
    location.reload()
  }

  const link = (c: Credit) => (
    <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-zinc-100 hover:text-brand-400 hover:underline">
      {c.name}
    </a>
  )

  return (
    <div className="max-w-3xl space-y-10">
      <header>
        <p className="text-xs uppercase tracking-[0.25em] text-brand-400">About</p>
        <h1 className="mt-1 text-3xl font-bold text-zinc-50">Outpost</h1>
        <p className="mt-2 text-zinc-400">
          A free chess trainer for opening theory, tactics, endgames and board vision. Everything runs in your browser: the Stockfish engine runs locally as WebAssembly, and your progress is stored on this device unless you turn on sync. There are no accounts and no tracking.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-zinc-50">Source code & license</h2>
        <p className="text-sm text-zinc-300">
          Outpost is free software, licensed under the{' '}
          <a className="text-brand-400 hover:underline" href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" rel="noopener noreferrer">
            GNU General Public License v3.0 or later
          </a>
          . You can read, copy, change and share the code under the same license.
        </p>
        {REPO_URL ? (
          <a className="btn-primary inline-block" href={REPO_URL} target="_blank" rel="noopener noreferrer">
            View the source code ↗
          </a>
        ) : (
          <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-300 ring-1 ring-amber-400/30">
            No repository link is configured. Set <code>VITE_REPO_URL</code> (see <code>.env.example</code>) before publishing — the GPL requires the site to point to its source.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-50">Credits</h2>
        <p className="text-sm text-zinc-400">Built on the work of these projects — thank you.</p>
        <div className="divide-y divide-white/5 rounded-xl ring-1 ring-white/5">
          {CREDITS.map((c) => (
            <div key={c.name} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm">
              <span className="min-w-44 font-medium">{link(c)}</span>
              <span className="flex-1 text-zinc-400">{c.what}</span>
              <span className="text-xs text-zinc-500">{c.license}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-zinc-500">
          The engine files are served unmodified from <code>/engine/</code> together with their license (<a className="hover:underline" href={`${import.meta.env.BASE_URL}engine/COPYING.txt`} target="_blank" rel="noopener noreferrer">COPYING.txt</a>). Opening notes, endgame lessons and drills were written for this project.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-50">Outside services</h2>
        <div className="divide-y divide-white/5 rounded-xl ring-1 ring-white/5">
          {SERVICES.map((c) => (
            <div key={c.name} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm">
              <span className="min-w-44 font-medium">{link(c)}</span>
              <span className="flex-1 text-zinc-400">{c.what}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-zinc-500">Outpost is an independent project and is not affiliated with or endorsed by Lichess or chess.com.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-50">Your data</h2>
        <p className="text-sm text-zinc-300">
          Your progress, XP, imported games, custom repertoires and settings live in this browser's local storage ({keys.length} items, about {Math.max(1, Math.round(bytes / 1024))} KB). Nothing is uploaded unless you turn on sync. Clearing your browser data erases it, so download a backup now and then.
        </p>
        <p className="text-sm text-zinc-400">
          The only outside requests are the Google Fonts stylesheet when the page loads, and the services above when you use them — the username you type goes to Lichess or chess.com, and endgame positions to the Lichess tablebase.
        </p>
        <p className="text-sm text-zinc-400">
          <b className="text-zinc-200">Sync (optional).</b> If you turn it on in Settings, a compressed copy of your progress, XP, custom repertoires and imported games (including the usernames in them) is stored on Cloudflare R2, under a one-way hash of your sync code — the code itself is never stored. Anyone who has your code can read and change that copy. Settings stay on each device. "Delete synced copy" in Settings removes it from the server.
        </p>
        <p className="text-sm text-zinc-400">
          <b className="text-zinc-200">Leaderboards (optional).</b> If you join with a nickname, your nickname, level, total and weekly XP, bosses defeated, medal count, streak and Gauntlet best scores are stored in a Cloudflare D1 database and shown publicly. "Leave leaderboards" in Settings deletes them. The opening-explorer statistics are fetched from Lichess through the same server, which sends only the position.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={backup}>
            Download backup
          </button>
          <button className="btn-secondary" onClick={() => file.current?.click()}>
            Restore from backup…
          </button>
          <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
          <button className="btn-secondary text-red-300 hover:text-red-200" onClick={wipe}>
            Delete all my data
          </button>
        </div>
        {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>}
      </section>
    </div>
  )
}
