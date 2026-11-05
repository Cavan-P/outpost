import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme, getSettings } from './lib/settings'

applyTheme(getSettings().theme)

// The "Ask the coach" feature (and its Anthropic API key setting) was removed; wipe any key a
// previous version saved in this browser.
try {
  localStorage.removeItem('ctt.anthropicKey')
} catch {
  /* storage unavailable */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
