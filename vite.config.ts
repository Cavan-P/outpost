import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

/** The site-wide ("/*") headers from public/_headers, so `npm run preview` behaves like production. */
function siteHeaders(): Record<string, string> {
  const out: Record<string, string> = {}
  let inSiteBlock = false
  for (const line of readFileSync(new URL('./public/_headers', import.meta.url), 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    if (!line.startsWith(' ')) inSiteBlock = line.trim() === '/*'
    else if (inSiteBlock) {
      const i = line.indexOf(':')
      out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
    }
  }
  return out
}

export default defineConfig({
  // GitHub Pages serves project sites from /<repo>/ — set BASE_PATH=/outpost/ for that; "/" everywhere else
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss()],
  preview: { headers: siteHeaders() },
  // the sync API lives in the Worker: run `npx wrangler dev` (port 8787) alongside `npm run dev`
  server: { proxy: { '/api': 'http://localhost:8787' } },
})
