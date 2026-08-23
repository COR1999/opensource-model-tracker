# Open Source Model Tracker

Dashboard to track which free AI models are available across NVIDIA NIM, OpenCode, and OpenRouter. Providers regularly add, remove, and sunset models without announcements — this tool tells you what's actually live right now.

## Features

- Live model discovery from NVIDIA NIM API, OpenCode free tiers, and OpenRouter `:free` models
- Real API testing — hits each model with an actual request
- Function-calling detection via tools payload
- New model alerts — badges models that appeared since your last visit
- Model categories — filter by chat, code, vision, embedding, audio
- 7-day uptime history tracked per model
- T3 Code warnings for models known to break with Chat Completions
- NVIDIA model links to build.nvidia.com for every model
- Shareable snapshot links to share status with others
- Daily Vercel Cron job for automated testing
- Auto-refresh every 5 minutes
- 10 concurrent model tests with 15s timeout

## Setup

1. Get an NVIDIA API key from build.nvidia.com
2. Get an OpenRouter API key from openrouter.ai (free `:free` models still require auth)
3. Copy .env.example to .env.local
4. Add your NVIDIA_API_KEY, OPENROUTER_API_KEY, and optionally CRON_SECRET
5. npm install && npm run dev

## Deploy to Vercel

1. Push to GitHub
2. Import repo on vercel.com
3. Add NVIDIA_API_KEY and OPENROUTER_API_KEY in Project Settings > Environment Variables
4. (Optional) Add CRON_SECRET for secure cron auth
5. Deploy

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS v4
