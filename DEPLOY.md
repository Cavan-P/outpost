# Deploying Outpost

Outpost is a **static site**: `npm run build` produces a `dist/` folder (about 2.8 MB) of plain HTML, JS, CSS and the Stockfish WebAssembly engine. There is no server code and no database. Stockfish runs in each visitor's browser, and their data stays in their browser. Any static host works.

Recommended: **Cloudflare Pages** (free, fast worldwide, applies the security headers in `public/_headers` automatically, redeploys on every `git push`). Alternatives are covered below.

---

## 1. Put the code on GitHub

1. Create a **public** repository on GitHub named `outpost`. Leave it empty: no README, no license (the project already has both).
2. In a terminal, from the project folder:

   ```bash
   cd "/Users/cavan/Documents/Portfolio and Projects/chess-theory-trainer"
   git init
   git add .
   git commit -m "Outpost: first public version"
   git branch -M main
   git remote add origin https://github.com/YOUR-NAME/outpost.git
   git push -u origin main
   ```

   `node_modules/` and `dist/` are ignored, so only source, data and the engine files are committed.

## 2. Point the About page at your repo (required by the GPL)

```bash
cp .env.example .env
```

Edit `.env` so it reads `VITE_REPO_URL=https://github.com/YOUR-NAME/outpost`, then commit it:

```bash
git add .env && git commit -m "Link the source repository" && git push
```

(The URL isn't a secret, so committing `.env` is fine. On Cloudflare/Netlify you can set `VITE_REPO_URL` as an environment variable in the dashboard instead.)

## 3. Check the production build locally

```bash
npm install
npm run validate
npm run build
npm run preview
```

Open http://localhost:4173. `preview` serves the real build with the same security headers as production. Check that the engine shows an evaluation in Analysis and that About shows your repo link.

---

## 4a. Host on Cloudflare Pages (recommended, free)

1. Sign in at https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → pick the `outpost` repo.
2. Build settings:
   - Framework preset: **Vite** (or "None")
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Environment variable: `NODE_VERSION` = `22` (and `VITE_REPO_URL` if you didn't commit `.env`)
3. **Save and Deploy**. You get `https://outpost-xxx.pages.dev` in about a minute. Every later `git push` to `main` redeploys.
4. Optional custom domain: **Custom domains** → add `outpost.yourdomain.com` and follow the DNS step. HTTPS is automatic.
5. Check the headers are live: open the site → DevTools → Network → the document request → Response Headers should include `content-security-policy`.

**Netlify** works the same way (build `npm run build`, publish `dist`). It also reads `public/_headers`.

## 4b. GitHub Pages (free, but no custom headers)

GitHub Pages can't send the security headers in `_headers`. The site still works, just without that hardening. It serves the site from `/outpost/`, so the build needs that base path:

1. Repo → **Settings → Pages** → Source: **GitHub Actions**.
2. Add `.github/workflows/pages.yml` that runs `npm ci && BASE_PATH=/outpost/ npm run build` and uploads `dist` with `actions/upload-pages-artifact` + `actions/deploy-pages`. (Ask and I'll add this file.)

## 4c. Host on a DigitalOcean droplet

Yes, it fits easily. The server only hands out static files, so the smallest droplet ($4–6/month, 512 MB–1 GB RAM) is plenty. Its included bandwidth (500 GB–1 TB/month) covers a few hundred thousand first visits at ~2 MB each, and returning visitors mostly hit their browser cache. The trade-off: unlike Pages, you maintain the server yourself (OS updates, SSH keys, firewall).

1. Create a droplet: **Ubuntu 24.04 LTS**, Basic, Regular CPU, the cheapest size, with your **SSH key** (not a password).
2. Point your domain at it: an `A` record for `outpost.yourdomain.com` → the droplet's IP.
3. SSH in and install Caddy, the web server (it handles HTTPS certificates by itself):

   ```bash
   ssh root@YOUR_DROPLET_IP
   apt update && apt upgrade -y
   apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
   apt update && apt install -y caddy
   ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
   mkdir -p /var/www/outpost
   ```

4. From your Mac, build and upload:

   ```bash
   npm run build
   rsync -avz --delete dist/ root@YOUR_DROPLET_IP:/var/www/outpost/
   scp deploy/Caddyfile root@YOUR_DROPLET_IP:/etc/caddy/Caddyfile
   ```

5. On the droplet, put your domain into the Caddyfile and reload:

   ```bash
   sed -i 's/outpost.example.com/outpost.yourdomain.com/' /etc/caddy/Caddyfile
   systemctl reload caddy
   ```

6. Visit `https://outpost.yourdomain.com`. To update later, re-run the `npm run build` + `rsync` lines from step 4.
7. Housekeeping: turn on automatic security updates (`apt install unattended-upgrades`) and DigitalOcean's weekly backups if you like.

---

## Before you share the link: checklist

- [ ] About page shows **View the source code** (not the yellow warning).
- [ ] Analysis shows an engine evaluation (proves the `.wasm` file is served correctly).
- [ ] A Lichess import works (proves the security policy allows the APIs).
- [ ] Response headers include `content-security-policy` (Cloudflare, Netlify or droplet).
- [ ] `LICENSE` and `public/engine/COPYING.txt` are in the repo.

## Optional extras

- **Self-host the fonts** so visitors don't contact Google: download Inter and Cormorant Garamond into `public/fonts/`, swap the Google Fonts `<link>` in `index.html` for `@font-face` rules, then remove the two Google domains from the security policy.
- **Analytics:** if you add any, mention it on the About page ("Your data" section).

## Server features on Cloudflare (sync, leaderboards, opening explorer)

On Cloudflare, the same Worker that serves the site also runs a small API (`worker/`). Static hosts (GitHub Pages, a plain droplet) can't run it; the app still works there, it just hides those features. Each feature needs one-time setup in the Cloudflare dashboard:

| Feature | What to create | Where it's configured |
|---|---|---|
| **Sync** | R2 bucket named `outpost-sync` (R2 → Create bucket) | `r2_buckets` in `wrangler.jsonc` |
| **Leaderboards** | D1 database named `outpost` (D1 → Create); paste its ID into `wrangler.jsonc` | `d1_databases` in `wrangler.jsonc` (tables are created automatically) |
| **"What people play"** (optional) | A Lichess personal API token (lichess.org/account/oauth/token, no scopes), saved as the Worker secret `LICHESS_TOKEN` (Worker → Settings → Variables and Secrets) | nothing else |

Create the bucket and database **before** pushing a deploy that references them, or the deploy fails.

To try the API locally, run the Worker next to the dev server (Vite forwards `/api` to it):

```bash
npx wrangler dev --port 8787
```

`wrangler dev` simulates R2 and D1 on your machine; put a test `LICHESS_TOKEN=…` in `.dev.vars` (git-ignored) to try the explorer.
