import { useSyncExternalStore } from 'react'

// ───────────── themes ─────────────

export type ThemeId = 'onyx' | 'obsidian' | 'noir' | 'mono' | 'forest' | 'crimson' | 'midnight' | 'paper'
export type BoardId = 'theme' | 'green' | 'brown' | 'blue' | 'red' | 'grey' | 'ink' | 'ivory' | 'slate' | 'carbon' | 'walnut' | 'marble' | 'ocean' | 'rose' | 'tournament' | 'royal' | 'emerald' | 'champion'

export const THEMES: { id: ThemeId; name: string; desc: string; swatch: [string, string, string]; minimal?: boolean }[] = [
  { id: 'onyx', name: 'Onyx', desc: 'Black and gold', swatch: ['#000000', '#c5a059', '#9a7b56'], minimal: true },
  { id: 'obsidian', name: 'Obsidian', desc: 'Black and platinum', swatch: ['#000000', '#d6d6d6', '#5b6168'], minimal: true },
  { id: 'noir', name: 'Noir Rouge', desc: 'Black with a single red accent', swatch: ['#000000', '#ef4444', '#3a3a3a'], minimal: true },
  { id: 'mono', name: 'Mono', desc: 'Pure greyscale', swatch: ['#0b0b0b', '#e5e5e5', '#8a8a8a'], minimal: true },
  { id: 'forest', name: 'Forest', desc: 'The original: charcoal and emerald', swatch: ['#18181b', '#10b981', '#779556'] },
  { id: 'crimson', name: 'Crimson', desc: 'Dark with deep red accents', swatch: ['#1a1414', '#e11d48', '#9e3b3b'] },
  { id: 'midnight', name: 'Midnight', desc: 'Navy and electric blue', swatch: ['#0f172a', '#3b82f6', '#4b7399'] },
  { id: 'paper', name: 'Paper', desc: 'Light, with red ink', swatch: ['#f5f3ef', '#dc2626', '#b9a993'] },
]

export const isMinimal = (t: ThemeId) => !!THEMES.find((x) => x.id === t)?.minimal

/** [light square, dark square] */
export const BOARDS: Record<Exclude<BoardId, 'theme'>, { name: string; colors: [string, string] }> = {
  green: { name: 'Green', colors: ['#e9edcc', '#779556'] },
  brown: { name: 'Wood', colors: ['#f0d9b5', '#b58863'] },
  blue: { name: 'Blue', colors: ['#dee3e6', '#7393ae'] },
  red: { name: 'Red', colors: ['#f2e1dc', '#a64444'] },
  grey: { name: 'Gray', colors: ['#d9d9d9', '#8a8a8a'] },
  ink: { name: 'Ink', colors: ['#e6e1d8', '#686868'] },
  ivory: { name: 'Ivory', colors: ['#ebe3d1', '#9a7b56'] },
  slate: { name: 'Slate', colors: ['#d3d6d9', '#5b6168'] },
  carbon: { name: 'Carbon', colors: ['#bdbdbd', '#4f4f4f'] },
  // collectibles — unlocked by playing (see lib/meta.ts)
  walnut: { name: 'Walnut', colors: ['#e8cfa6', '#7b4f2c'] },
  marble: { name: 'Marble', colors: ['#f4f1ea', '#a9a49a'] },
  ocean: { name: 'Ocean', colors: ['#d6eaf0', '#2f6f86'] },
  rose: { name: 'Rose', colors: ['#f6e3e5', '#b5677a'] },
  tournament: { name: 'Tournament', colors: ['#f0f0dc', '#4e7a4a'] },
  royal: { name: 'Royal', colors: ['#e9e2f3', '#5b3f8c'] },
  emerald: { name: 'Emerald', colors: ['#dff2e7', '#1f7a55'] },
  champion: { name: 'Champion', colors: ['#f3e7c4', '#8a6a1f'] },
}

const THEME_BOARD: Record<ThemeId, Exclude<BoardId, 'theme'>> = { onyx: 'ivory', obsidian: 'slate', noir: 'carbon', mono: 'grey', forest: 'green', crimson: 'red', midnight: 'blue', paper: 'brown' }

export function boardColors(s: Settings): [string, string] {
  return BOARDS[s.board === 'theme' ? THEME_BOARD[s.theme] : s.board].colors
}

// ───────────── settings store ─────────────

export interface Settings {
  depth: number // analysis depth for the engine panel and mistake checks
  autoReplyMs: number // delay before the opponent's book reply in practice
  theme: ThemeId
  board: BoardId
  coordinates: boolean
  animationMs: number
  xpPopups: boolean
  /** skip the promotion picker and always make a queen */
  autoQueen: boolean
}

const KEY = 'ctt.settings.v1'
const DEFAULTS: Settings = { depth: 18, autoReplyMs: 450, theme: 'onyx', board: 'theme', coordinates: true, animationMs: 180, xpPopups: true, autoQueen: false }

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULTS
  }
}

let current = load()
const subs = new Set<() => void>()

export function applyTheme(theme: ThemeId) {
  const root = document.documentElement
  root.dataset.theme = theme
  if (isMinimal(theme)) root.dataset.minimal = ''
  else delete root.dataset.minimal
}

export function getSettings(): Settings {
  return current
}

export function saveSettings(s: Settings) {
  current = { ...s }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* storage unavailable */
  }
  applyTheme(current.theme)
  subs.forEach((f) => f())
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => void subs.delete(f)
    },
    () => current,
  )
}
