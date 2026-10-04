# Open Source Model Tracker

Dashboard to track which free AI models are available across NVIDIA NIM, OpenCode, and OpenRouter. Providers regularly add, remove, and sunset models without announcements — this tool tells you what's actually live right now.

## Features

- Live model discovery from NVIDIA NIM API, OpenCode free tiers, and OpenRouter `:free` models
- Live benchmark ranking (BenchLM + OpenRouter Artificial Analysis) — catalog sorted best-first
- Real API testing — hits each model with an actual request
- Free-tier tests get a 15s budget (paid NVIDIA stays 8s); one retry on HTTP 429
- Distinct **Rate limited** status (not a generic error)
- Function-calling detection via tools payload
- New model alerts — badges models that appeared since your last visit
- Free-tier revocation badges + changelog when a free id disappears
- Personal shortlist — star models and filter to ★ Shortlist
- Best-for chips (code / reason / agent / long ctx / fast) from live scores
- “Best free pick” banner using scores + last test result
- Model categories — filter by chat, code, vision, embedding, audio
- 7-day uptime history — local plus shared cron history via `/api/uptime`
- T3 Code warnings for models known to break with Chat Completions
- NVIDIA model links to build.nvidia.com for every model
- Shareable snapshot links to share status with others
- Daily Vercel Cron job for automated testing (chat/code/vision only, skips known-slow models so it finishes inside Vercel's 60s function cap)
- Daily snapshots + rolling `data/uptime-history.json` when `SNAPSHOT_GITHUB_TOKEN` is set
- Auto-refresh every 5 minutes

## Setup

1. Get an NVIDIA API key from build.nvidia.com
2. Get an OpenRouter API key from openrouter.ai (free `:free` models still require auth)
3. Copy .env.example to .env.local
4. Add your NVIDIA_API_KEY, OPENROUTER_API_KEY, and optionally CRON_SECRET and SNAPSHOT_GITHUB_TOKEN
5. npm install && npm run dev

## Deploy to Vercel

1. Push to GitHub
2. Import repo on vercel.com
3. Add NVIDIA_API_KEY and OPENROUTER_API_KEY in Project Settings > Environment Variables
4. (Optional) Add CRON_SECRET for secure cron auth — without it the cron endpoint refuses to run (fail closed)
5. (Optional) Add SNAPSHOT_GITHUB_TOKEN: a fine-grained PAT scoped to this repo with Contents: Read & Write, so the daily cron commits its summary to data/snapshots/YYYY-MM-DD.json and merges rolling uptime into data/uptime-history.json. Without it the cron still runs but skips persistence.
6. **Cron is already declared in `vercel.json`** (`/api/cron`, daily at 08:00 UTC) — Vercel registers it automatically on deploy, no manual Cron Jobs dashboard step needed. Setting `CRON_SECRET` is what matters: Vercel sends it as `Authorization: Bearer $CRON_SECRET` on every cron-triggered request automatically, which is what lets `/api/cron` tell a real cron run apart from a stray public request. To change the schedule, edit `vercel.json`, not the dashboard.
7. Deploy

After the first successful cron run with a snapshot token, `/api/uptime` serves shared history to every browser (merged with local results).

## Tests

```
npm test        # vitest suite: lib modules, API routes, hooks, and components
npm run lint    # eslint
npx tsc --noEmit
```

CI runs all of the above plus a production build on every push and PR (.github/workflows/ci.yml).

## Tech Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS v4
