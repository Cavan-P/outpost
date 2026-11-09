import { useEffect, useMemo, useState } from 'react'
import { OPENINGS } from './data/openings'
import { allOpenings, useCustomOpenings } from './lib/custom'
import { flipOpening, getTree } from './lib/tree'
import { Library } from './modes/Library'
import { MyGames } from './modes/games/MyGames'
import { Review } from './modes/Review'
import { dueItems } from './lib/reviewSession'
import { Builder } from './modes/Builder'
import { About } from './modes/About'
import { Shell, type NavId } from './components/Shell'
import { BOARDS, THEMES, boardColors, saveSettings, useSettings, type BoardId, type Settings } from './lib/settings'
import { Learn } from './modes/Learn'
import { Practice } from './modes/Practice'
import { Analysis } from './modes/Analysis'
import { Endgames } from './modes/Endgames'
import { Training } from './modes/training/Training'
import { Arena } from './modes/Arena'
import { ProfilePage, Toasts } from './components/GameUI'
import { configureTotals, getProfile, onGameEvent } from './lib/game'
import { SyncPanel } from './components/SyncPanel'
import { LeaderboardSettings } from './components/LeaderboardUI'
import { startBoardPosting } from './lib/leaderboard'
import { startAutoSync } from './lib/sync'
import { claimSeason, isCollectible, isUnlocked, settleLeague } from './lib/meta'
import { getGames, myGames } from './lib/games'
import { PUZZLES } from './lib/puzzles'
import { ENDGAMES } from './data/endgames'

configureTotals({
  puzzles: PUZZLES.length,
  endgames: ENDGAMES.length,
  mates: ENDGAMES.filter((e) => e.id.startsWith('mate-')).length,
  gambits: OPENINGS.filter((o) => o.tags.includes('gambit')).map((o) => o.id),
  hasDue: () => dueItems().length > 0,
  hasGameAnalysis: () => myGames(getGames().games).some((g) => g.analysis),
})

type View = { kind: 'home' } | { kind: 'opening'; id: string; mode: 'learn' | 'practice'; flip: boolean } | { kind: 'analysis'; fen?: string; key: number; blind?: boolean } | { kind: 'endgames' } | { kind: 'training' } | { kind: 'arena' } | { kind: 'profile' } | { kind: 'games' } | { kind: 'review'; key: number } | { kind: 'builder' } | { kind: 'about' }

const sideName = (s: 'w' | 'b') => (s === 'w' ? 'White' : 'Black')

export default function App() {
  const [view, setView] = useState<View>({ kind: 'home' })
  const [showSettings, setShowSettings] = useState(false)
  // weekly league results and season-pass rewards (after mount, so their toasts are visible)
  useEffect(() => {
    const t = setTimeout(() => {
      settleLeague()
      claimSeason()
    }, 800)
    startAutoSync()
    startBoardPosting()
    const off = onGameEvent((e) => {
      if (e.kind === 'xp') setTimeout(claimSeason, 0)
    })
    return () => {
      clearTimeout(t)
      off()
    }
  }, [])
  const analyze = (fen: string) => setView({ kind: 'analysis', fen, key: Date.now() })

  useCustomOpenings() // re-render when custom repertoires change
  const base = view.kind === 'opening' ? (allOpenings().find((o) => o.id === view.id) ?? null) : null
  const flip = view.kind === 'opening' && view.flip
  const opening = useMemo(() => (base && flip ? flipOpening(base) : base), [base, flip])
  const tree = useMemo(() => (opening ? getTree(opening) : null), [opening])

  const active: NavId = view.kind === 'home' || view.kind === 'opening' ? 'openings' : view.kind
  const go = (id: NavId) => setView(id === 'openings' ? { kind: 'home' } : id === 'analysis' ? { kind: 'analysis', key: Date.now() } : id === 'review' ? { kind: 'review', key: Date.now() } : { kind: id })
  // recomputed on navigation, which is when it matters
  const dueCount = useMemo(() => dueItems().length, [view]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Shell active={active} onNav={go} onSettings={() => setShowSettings(true)} badges={{ review: dueCount }}>
        {view.kind === 'home' && <Library onOpen={(id, mode, flip) => setView({ kind: 'opening', id, mode, flip })} />}

        {view.kind === 'opening' && opening && tree && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <button className="text-xs uppercase tracking-widest text-zinc-500 hover:text-zinc-300" onClick={() => setView({ kind: 'home' })}>
                  ← Openings
                </button>
                <h1 className="mt-1 text-3xl font-bold text-zinc-50">{opening.name}</h1>
                <p className="text-sm text-zinc-400">
                  {opening.eco} · you play {sideName(opening.side)}
                  {opening.flipped && <span className="ml-2 rounded bg-sky-500/15 px-1.5 py-0.5 text-xs text-sky-300">defending against it</span>}
                </p>
              </div>
              <div className="ml-auto flex rounded-lg bg-zinc-900 p-1 ring-1 ring-white/5" role="group" aria-label="Which side">
                {[false, true].map((f) => (
                  <button
                    key={String(f)}
                    onClick={() => setView({ ...view, flip: f })}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium ${view.flip === f ? 'bg-zinc-700 text-zinc-50' : 'text-zinc-400 hover:text-zinc-100'}`}
                    title={f ? 'Train the replies to this opening' : 'Train the opening itself'}
                  >
                    {f ? `Face it (${sideName(base!.side === 'w' ? 'b' : 'w')})` : `Play it (${sideName(base!.side)})`}
                  </button>
                ))}
              </div>
              <div className="flex rounded-lg bg-zinc-900 p-1 ring-1 ring-white/5">
                {(['learn', 'practice'] as const).map((m) => (
                  <button key={m} onClick={() => setView({ ...view, mode: m })} className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize ${view.mode === m ? 'bg-brand-600 text-white' : 'text-zinc-400 hover:text-zinc-100'}`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <details className="rounded-xl bg-zinc-900/60 ring-1 ring-white/5 px-4 py-3 text-sm" open={view.mode === 'learn'}>
              <summary className="cursor-pointer text-zinc-300 font-medium">Key ideas</summary>
              <p className="text-zinc-300 mt-2">{opening.summary}</p>
              <ul className="list-disc pl-5 mt-2 space-y-1 text-zinc-400">
                {opening.ideas.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </details>
            {opening.flipped && (
              <p className="text-sm text-sky-200/80">
                You're on the receiving end: the trainer plays {opening.name} against you, and the book moves for you are the defenses covered by these lines. Moves marked ? or ?? are traps — don't fall for them.
              </p>
            )}
            {view.mode === 'learn' ? <Learn key={opening.id} tree={tree} onAnalyze={analyze} /> : <Practice key={opening.id} tree={tree} onAnalyze={analyze} />}
          </div>
        )}

        {view.kind === 'analysis' && <Analysis key={view.key} initialFen={view.fen} blindfold={view.blind} />}
        {view.kind === 'endgames' && <Endgames />}
        {view.kind === 'arena' && <Arena onAnalyze={analyze} />}
        {view.kind === 'training' && <Training onBlindfold={() => setView({ kind: 'analysis', key: Date.now(), blind: true })} />}
        {view.kind === 'profile' && <ProfilePage />}
        {view.kind === 'review' && <Review key={view.key} onDone={() => setView({ kind: 'home' })} />}
        {view.kind === 'about' && <About />}
        {view.kind === 'builder' && <Builder onOpen={(id) => setView({ kind: 'opening', id, mode: 'learn', flip: false })} />}
        {view.kind === 'games' && <MyGames onOpenOpening={(id, flip) => setView({ kind: 'opening', id, mode: 'practice', flip })} />}
      </Shell>

      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
      <Toasts />
    </>
  )
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const s = useSettings()
  // appearance changes apply live so you can see them; everything is saved immediately
  const set = (patch: Partial<Settings>) => saveSettings({ ...s, ...patch })
  const close = onClose
  const section = (title: string) => <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 pt-2">{title}</h3>
  const toggle = (label: string, value: boolean, onChange: (v: boolean) => void, hint?: string) => (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <span className="text-sm text-zinc-300">
        {label}
        {hint && <span className="block text-xs text-zinc-500">{hint}</span>}
      </span>
      <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )

  return (
    <div className="fixed inset-0 z-40 bg-black/60 grid place-items-center p-4" onClick={close}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-auto rounded-xl bg-zinc-900 ring-1 ring-white/10 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-50">Settings</h2>
          <button className="btn-primary" onClick={close}>
            Done
          </button>
        </div>

        {section('Theme')}
        {(['Dark', 'Light'] as const).map((group) => (
          <div key={group} className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-widest text-zinc-500">{group}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {THEMES.filter((t) => !!t.light === (group === 'Light')).map((t) => (
                <button
                  key={t.id}
                  onClick={() => set({ theme: t.id })}
                  className={`rounded-lg p-2 text-left ring-2 transition ${s.theme === t.id ? 'ring-brand-500' : 'ring-transparent hover:ring-white/10'}`}
                  style={{ background: t.swatch[0], boxShadow: t.light ? 'inset 0 0 0 1px rgb(0 0 0 / 0.08)' : undefined }}
                >
                  <div className="flex gap-1">
                    <span className="h-4 w-8 rounded" style={{ background: t.swatch[1] }} />
                    <span className="h-4 w-4 rounded" style={{ background: t.swatch[2] }} />
                  </div>
                  <p className="mt-1.5 text-sm font-medium" style={{ color: t.light ? '#1f1b17' : '#f4f4f5' }}>
                    {t.name}
                  </p>
                  <p className="text-[11px] leading-tight" style={{ color: t.light ? '#5e564b' : '#a1a1aa' }}>
                    {t.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ))}

        {section('Board')}
        <div className="flex flex-wrap gap-2">
          {(['theme', ...Object.keys(BOARDS)] as BoardId[]).filter((b) => !isCollectible(b) || isUnlocked(getProfile(), b)).map((b) => {
            const [light, dark] = b === 'theme' ? boardColors({ ...s, board: 'theme' }) : BOARDS[b as Exclude<BoardId, 'theme'>].colors
            return (
              <button key={b} onClick={() => set({ board: b })} className={`rounded-lg p-1.5 ring-2 ${s.board === b ? 'ring-brand-500' : 'ring-transparent hover:ring-white/10'}`} title={b === 'theme' ? 'Match theme' : BOARDS[b as Exclude<BoardId, 'theme'>].name}>
                <span className="grid grid-cols-2 h-9 w-9 overflow-hidden rounded">
                  <span style={{ background: light }} />
                  <span style={{ background: dark }} />
                  <span style={{ background: dark }} />
                  <span style={{ background: light }} />
                </span>
                <span className="block text-[10px] text-zinc-400 mt-0.5">{b === 'theme' ? 'Auto' : BOARDS[b as Exclude<BoardId, 'theme'>].name}</span>
              </button>
            )
          })}
        </div>
        {toggle('Coordinates on the board', s.coordinates, (v) => set({ coordinates: v }))}
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-zinc-300">Piece animation</span>
          <select className="input" value={s.animationMs} onChange={(e) => set({ animationMs: Number(e.target.value) })}>
            <option value={0}>Off</option>
            <option value={100}>Fast</option>
            <option value={180}>Normal</option>
            <option value={300}>Slow</option>
          </select>
        </label>
        {toggle('Always promote to queen', s.autoQueen, (v) => set({ autoQueen: v }), 'Off: you pick the piece — some puzzles need a knight')}
        {toggle('XP pop-ups', s.xpPopups, (v) => set({ xpPopups: v }), 'Achievements and level-ups always show')}

        {section('Sync')}
        <SyncPanel />

        {section('Leaderboards')}
        <LeaderboardSettings />

        {section('Training')}
        <label className="block space-y-1">
          <span className="text-sm text-zinc-300">Engine depth: {s.depth}</span>
          <input type="range" min={10} max={24} value={s.depth} onChange={(e) => set({ depth: Number(e.target.value) })} className="w-full accent-brand-500" />
          <span className="text-xs text-zinc-500">Higher is stronger but slower. 18 is a good default.</span>
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-zinc-300">Opponent reply delay: {s.autoReplyMs} ms</span>
          <input type="range" min={0} max={1500} step={50} value={s.autoReplyMs} onChange={(e) => set({ autoReplyMs: Number(e.target.value) })} className="w-full accent-brand-500" />
        </label>

      </div>
    </div>
  )
}
