import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme, getSettings } from './lib/settings'
import { relabel } from './lib/gameAnalysis'
import { getGames, saveAnalysis } from './lib/games'

applyTheme(getSettings().theme)

// The "Ask the coach" feature (and its Anthropic API key setting) was removed; wipe any key a
// previous version saved in this browser.
try {
  localStorage.removeItem('ctt.anthropicKey')
} catch {
  /* storage unavailable */
}

// Games analyzed under older labeling rules get relabelled from their saved evaluations.
for (const g of getGames().games) {
  const updated = relabel(g)
  if (updated) saveAnalysis(g.id, updated)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
