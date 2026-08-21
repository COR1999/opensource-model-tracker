# Open Source Model Tracker

Dashboard to track which free AI models are available across NVIDIA NIM and OpenCode.

## Features

- Lists all available models from NVIDIA API and OpenCode free tiers
- Tests each model with a live API call
- Shows status (working/slow/error/removed), response time, HTTP code
- Checks function calling support
- Filter by provider (NVIDIA / OpenCode)
- Search by model name
- Sort by any column
- Auto-refreshes every 5 minutes
- Parallel testing with concurrency limit

## Setup

1. Get an NVIDIA API key from [build.nvidia.com](https://build.nvidia.com/settings/api-keys)
2. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
3. Add your key to `.env.local`:
   ```
   NVIDIA_API_KEY=nvapi-your-key-here
   ```
4. Install and run:
   ```bash
   npm install
   npm run dev
   ```

## Deploy to Vercel

1. Push to GitHub
2. Import repo on [vercel.com](https://vercel.com)
3. Add `NVIDIA_API_KEY` in Project Settings > Environment Variables
4. Deploy

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS v4
