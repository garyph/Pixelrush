# PixelDash — Global Leaderboard Setup Guide
# ============================================
# Takes about 10–15 minutes. Everything is FREE on Cloudflare's free tier.

## WHAT YOU'LL DEPLOY

  [Cloudflare Pages]  ←  hosts your game files (index.html, etc.)
        ↕  API calls
  [Cloudflare Worker] ←  leaderboard API (worker.js)
        ↕  reads/writes
  [Cloudflare KV]     ←  persistent global data store (scores + games played)


## STEP 1 — Cloudflare Account
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Go to https://cloudflare.com → sign up free
2. You don't need a domain — Cloudflare gives you free subdomains


## STEP 2 — Install Wrangler (Cloudflare CLI)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Open a terminal and run:

  npm install -g wrangler
  npx wrangler login

This opens your browser to authenticate with Cloudflare.


## STEP 3 — Create the KV Namespace (the database)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Run this command:

  npx wrangler kv:namespace create PIXELDASH_KV

It will print something like:
  { binding = "PIXELDASH_KV", id = "abc123...", preview_id = "xyz789..." }

Copy those IDs into wrangler.toml replacing REPLACE_WITH_KV_ID etc.


## STEP 4 — Deploy the Worker
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
In the folder containing worker.js and wrangler.toml, run:

  npx wrangler deploy

It will deploy and print your Worker URL, something like:
  https://pixeldash-leaderboard.YOUR-ACCOUNT.workers.dev

Copy that URL!


## STEP 5 — Update the Game
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Open index.html and find this line near the top of the <script>:

  const API = 'https://YOUR-WORKER.YOUR-ACCOUNT.workers.dev';

Replace it with your actual Worker URL from Step 4. Example:

  const API = 'https://pixeldash-leaderboard.gary123.workers.dev';


## STEP 6 — Deploy the Game (Cloudflare Pages)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OPTION A — Drag & Drop (easiest):
  1. Go to https://dash.cloudflare.com → Pages → Create a project
  2. Click "Upload assets"
  3. Drag your game folder (index.html, manifest.json, sw.js, icons) into it
  4. Cloudflare gives you a URL like: https://pixeldash.pages.dev

OPTION B — Connect to GitHub:
  1. Push your game files to a GitHub repo
  2. In Cloudflare Pages → Connect to Git → select your repo
  3. Build command: (leave empty)  Output directory: /
  4. Deploy — any future git push auto-deploys


## STEP 7 — Done!
━━━━━━━━━━━━━━━━━
Your game is now live globally. Anyone anywhere can:
  ✓ Play the game
  ✓ See the real-time global Top 10 leaderboard
  ✓ Submit their name if they crack the top 10
  ✓ See the global games-played counter tick up

Cloudflare FREE tier limits (more than enough):
  KV reads:  100,000/day free
  KV writes: 1,000/day free
  Workers:   100,000 requests/day free
  Pages:     500 deploys/month, unlimited bandwidth


## CUSTOM DOMAIN (optional)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
In Cloudflare Pages → your project → Custom Domains
Add any domain you own. Cloudflare handles SSL automatically.


## TROUBLESHOOTING
━━━━━━━━━━━━━━━━━━
• Scores not saving? Check the Worker URL in index.html matches exactly
• CORS errors? Make sure you're calling /api/board, /api/score, /api/played
• Bad word still slipping through? Add it to the BAD_WORDS array in worker.js
  then re-run: npx wrangler deploy
• KV not persisting? Verify the binding name "PIXELDASH_KV" matches wrangler.toml
