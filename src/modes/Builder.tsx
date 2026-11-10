import { Chess } from 'chess.js'
import { useMemo, useState } from 'react'
import { Board, type BoardMove } from '../components/Board'
import { OPENINGS, type OpeningDef } from '../data/openings'
import { deleteCustomOpening, newCustomId, saveCustomOpening, useCustomOpenings } from '../lib/custom'
import { parseLine } from '../lib/tree'

// Build your own repertoire: play moves on the board, annotate them, save lines — or import a PGN.

type Draft = OpeningDef

const blank = (): Draft => ({ id: newCustomId(), name: 'My repertoire', eco: '', side: 'w', tags: [], summary: '', ideas: [], lines: [] })
const TAG_CHOICES = ['gambit', 'solid', 'aggressive', 'trappy', 'offbeat']
const ANNOTATIONS = ['', '!', '!!', '?!', '!?', '?', '??']

export function Builder({ onOpen }: { onOpen: (id: string) => void }) {
  const custom = useCustomOpenings()
  const [draft, setDraft] = useState<Draft | null>(null)

  if (draft) return <Editor initial={draft} onClose={() => setDraft(null)} onOpen={onOpen} />

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-brand-400">Your lines</p>
          <h1 className="mt-1 text-3xl font-bold text-zinc-50">My repertoire</h1>
          <p className="mt-1 text-sm text-zinc-500">Build openings from scratch, extend a built-in one, or import PGN. They show up in the library and work with Learn, Practice, Face it and Review.</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
          <select
            className="input min-w-0 flex-1 sm:flex-none"
            value=""
            onChange={(e) => {
              const src = OPENINGS.find((o) => o.id === e.target.value)
              if (src) setDraft({ ...src, id: newCustomId(), name: `${src.name} (my version)`, tags: src.tags.filter((t) => t !== 'custom') })
            }}
          >
            <option value="">Copy a built-in opening…</option>
            {OPENINGS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <button className="btn-primary" onClick={() => setDraft(blank())}>
            + New repertoire
          </button>
        </div>
      </header>

      {custom.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {custom.map((d) => (
            <article key={d.id} className="flex flex-col gap-2 rounded-xl bg-zinc-900/80 p-5 ring-1 ring-white/5">
              <h2 className="text-lg font-semibold text-zinc-50">{d.name}</h2>
              <p className="text-xs text-zinc-500">
                as {d.side === 'w' ? 'White' : 'Black'} · {d.lines.length} lines
              </p>
              <p className="line-clamp-2 flex-1 text-sm text-zinc-400">{d.summary || 'No description.'}</p>
              <div className="flex gap-2">
                <button className="btn-primary flex-1" onClick={() => onOpen(d.id)}>
                  Open
                </button>
                <button className="btn-secondary flex-1" onClick={() => setDraft(d)}>
                  Edit
                </button>
                <button
                  className="btn-secondary"
                  title="Delete"
                  onClick={() => {
                    if (confirm(`Delete "${d.name}"?`)) deleteCustomOpening(d.id)
                  }}
                >
                  🗑
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">No custom repertoires yet.</p>
      )}
    </div>
  )
}

/** Serialise a played path to our line format: `e4 e5 f4!{note} …` */
function serialize(sans: string[], ann: Record<number, string>, notes: Record<number, string>) {
  return sans.map((s, i) => `${s}${ann[i] ?? ''}${notes[i]?.trim() ? `{${notes[i].replace(/[{}]/g, '').trim()}}` : ''}`).join(' ')
}

function pgnToLine(pgn: string): string {
  const c = new Chess()
  c.loadPgn(pgn)
  const comments = new Map(c.getComments().map((x) => [x.fen, x.comment]))
  const replay = new Chess()
  return c
    .history()
    .map((s) => {
      replay.move(s)
      const note = comments.get(replay.fen())?.replace(/\[%[^\]]*\]/g, '').trim()
      return note ? `${s}{${note.replace(/[{}]/g, '')}}` : s
    })
    .join(' ')
}

function Editor({ initial, onClose, onOpen }: { initial: Draft; onClose: () => void; onOpen: (id: string) => void }) {
  const [d, setD] = useState<Draft>(initial)
  const [sans, setSans] = useState<string[]>([])
  const [cursor, setCursor] = useState(0)
  const [ann, setAnn] = useState<Record<number, string>>({})
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [pgn, setPgn] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const fen = useMemo(() => {
    const c = new Chess()
    for (const s of sans.slice(0, cursor)) c.move(s)
    return c.fen()
  }, [sans, cursor])

  function onMove(m: BoardMove) {
    const c = new Chess(fen)
    const mv = c.move({ from: m.from, to: m.to, promotion: m.promotion })
    setSans((xs) => [...xs.slice(0, cursor), mv.san])
    setCursor((x) => x + 1)
    return true
  }

  function loadLine(line: string) {
    const toks = parseLine(line)
    setSans(toks.map((t) => t.san))
    setCursor(toks.length)
    setAnn(Object.fromEntries(toks.map((t, i) => [i, t.annotation])))
    setNotes(Object.fromEntries(toks.map((t, i) => [i, t.note])))
  }

  function addLine() {
    if (!sans.length) return
    setD((x) => ({ ...x, lines: [...x.lines, serialize(sans.slice(0, cursor || sans.length), ann, notes)] }))
    setSaved(false)
  }

  function importPgn() {
    setError('')
    try {
      const chunks = pgn.split(/\n\s*\n(?=\[Event )/).filter((t) => t.trim())
      const lines = (chunks.length ? chunks : [pgn]).map(pgnToLine).filter(Boolean)
      setD((x) => ({ ...x, lines: [...x.lines, ...lines] }))
      setPgn('')
    } catch (e) {
      setError(`Couldn't read that PGN: ${(e as Error).message}`)
    }
  }

  function save() {
    setError('')
    try {
      saveCustomOpening(d)
      setSaved(true)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const i = cursor - 1
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <button className="text-xs uppercase tracking-widest text-zinc-500 hover:text-zinc-300" onClick={onClose}>
            ← My repertoire
          </button>
          <input className="mt-1 block w-full bg-transparent text-3xl font-bold text-zinc-50 outline-none" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </div>
        <div className="ml-auto flex gap-2">
          {saved && (
            <button className="btn-secondary" onClick={() => onOpen(d.id)}>
              Open in trainer →
            </button>
          )}
          <button className="btn-primary" onClick={save}>
            {saved ? 'Saved ✓' : 'Save repertoire'}
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,520px)_1fr]">
        <div className="space-y-3">
          <Board fen={fen} orientation={d.side === 'w' ? 'white' : 'black'} onMove={onMove} lastMove={null} />
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => setCursor(0)}>⏮</button>
            <button className="btn-secondary" onClick={() => setCursor((c) => Math.max(0, c - 1))}>←</button>
            <button className="btn-secondary" onClick={() => setCursor((c) => Math.min(sans.length, c + 1))}>→</button>
            <button
              className="btn-secondary"
              onClick={() => {
                setSans([])
                setCursor(0)
                setAnn({})
                setNotes({})
              }}
            >
              Clear board
            </button>
            <button className="btn-primary ml-auto" onClick={addLine} disabled={!sans.length}>
              + Add this line
            </button>
          </div>
          <p className="text-xs text-zinc-500">Play both sides' moves. Going back and playing a different move starts a branch — add each branch as its own line.</p>
        </div>

        <div className="min-w-0 space-y-4">
          <section className="space-y-3 rounded-xl bg-zinc-900/80 p-4 ring-1 ring-white/5">
            <div className="flex flex-wrap gap-x-1 gap-y-1 font-mono text-sm">
              {sans.map((s, k) => (
                <button key={k} onClick={() => setCursor(k + 1)} className={`rounded px-1 ${k + 1 === cursor ? 'bg-brand-600 text-white' : k < cursor ? 'text-zinc-200 hover:bg-zinc-800' : 'text-zinc-600'}`}>
                  {k % 2 === 0 && <span className="text-zinc-500">{k / 2 + 1}.</span>}
                  {s}
                  {ann[k]}
                  {notes[k]?.trim() && <sup className="text-brand-400">•</sup>}
                </button>
              ))}
              {!sans.length && <span className="font-sans text-zinc-500">Make a move on the board.</span>}
            </div>
            {i >= 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-zinc-400">Mark {sans[i]} as</span>
                  <select className="input" value={ann[i] ?? ''} onChange={(e) => setAnn({ ...ann, [i]: e.target.value })}>
                    {ANNOTATIONS.map((a) => (
                      <option key={a} value={a}>
                        {a || '(none)'}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-zinc-500">? / ?? = a trap/mistake to learn the punishment for</span>
                </div>
                <textarea className="input h-20 w-full" placeholder={`Note for ${sans[i]} — why it's played, what to watch for…`} value={notes[i] ?? ''} onChange={(e) => setNotes({ ...notes, [i]: e.target.value })} />
              </div>
            )}
          </section>

          <section className="space-y-2 rounded-xl p-4 ring-1 ring-white/5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Lines ({d.lines.length})</h3>
            <ul className="max-h-60 space-y-1 overflow-auto text-xs">
              {d.lines.map((l, k) => (
                <li key={k} className="flex items-start gap-2">
                  <button className="flex-1 truncate text-left font-mono text-zinc-300 hover:text-zinc-50" title={l} onClick={() => loadLine(l)}>
                    {parseLine(l)
                      .map((t) => t.san + t.annotation)
                      .join(' ')}
                  </button>
                  <button className="text-zinc-500 hover:text-red-400" onClick={() => setD({ ...d, lines: d.lines.filter((_, j) => j !== k) })}>
                    ✕
                  </button>
                </li>
              ))}
              {!d.lines.length && <li className="text-zinc-500">No lines yet — play one on the board and press "Add this line", or import PGN below.</li>}
            </ul>
          </section>

          <section className="space-y-3 rounded-xl p-4 ring-1 ring-white/5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Details</h3>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-zinc-400">You play</span>
              {(['w', 'b'] as const).map((s) => (
                <button key={s} className={`chip ${d.side === s ? 'chip-active' : ''}`} onClick={() => setD({ ...d, side: s })}>
                  {s === 'w' ? 'White' : 'Black'}
                </button>
              ))}
              <input className="input w-28" placeholder="ECO (opt.)" value={d.eco} onChange={(e) => setD({ ...d, eco: e.target.value })} />
            </div>
            <div className="flex flex-wrap gap-2">
              {TAG_CHOICES.map((t) => (
                <button key={t} className={`chip ${d.tags.includes(t) ? 'chip-active' : ''}`} onClick={() => setD({ ...d, tags: d.tags.includes(t) ? d.tags.filter((x) => x !== t) : [...d.tags, t] })}>
                  {t}
                </button>
              ))}
            </div>
            <textarea className="input h-16 w-full" placeholder="Summary — what is this opening about?" value={d.summary} onChange={(e) => setD({ ...d, summary: e.target.value })} />
            <textarea className="input h-20 w-full" placeholder="Key ideas — one per line" value={d.ideas.join('\n')} onChange={(e) => setD({ ...d, ideas: e.target.value.split('\n') })} />
          </section>

          <section className="space-y-2 rounded-xl p-4 ring-1 ring-white/5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Import PGN</h3>
            <textarea className="input h-24 w-full font-mono text-xs" placeholder="Paste PGN (comments become notes). Each game becomes a line." value={pgn} onChange={(e) => setPgn(e.target.value)} />
            <button className="btn-secondary" onClick={importPgn} disabled={!pgn.trim()}>
              Add as lines
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}
