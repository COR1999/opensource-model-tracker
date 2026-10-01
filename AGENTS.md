# opensource-model-tracker — AGENTS.md

## Task setup checklist

Before starting any non-trivial task (multi-file changes, PRs, audits, refactors):

1. **List applicable skills.** For each skill in `available_skills`, ask: does this task match its trigger? If yes, note it.
2. **Load them immediately.** Do the loading before writing the first line of code. Do not defer to "after the commit."
3. **Cite in the commit body.** When a lesson changes what you do, name it: `lesson: <slug>`.

## Report back

After completing a task, report:

- **Skills loaded:** Which skills were loaded and used.
- **Skills skipped:** Which were applicable but not loaded, and why.
- **Lessons cited:** Which lessons changed the approach.
- **Sweep result:** If a sweep was run, the coverage statement.

This is the only durable record that a skill earned its place. An uncited skill is indistinguishable from one that was never loaded.

<!-- workbench:start — managed by Agent-Workbench; do not edit inside this block -->
## Inherited from Agent-Workbench (v0.8.0, imported 2026-08-26)

<!-- Rules and lessons here are copied from the workbench. Edit them at the
     source and re-run scripts/adopt.sh; edits made inside this block are lost. -->

**Work record:** commit bodies carry the durable account — how it was found, the
root cause, the mechanism chosen and why, and how it was verified. Not a one-line
subject.

**Citing a lesson:** when one of the lessons below changes what you do, name
it in the commit body or PR as: lesson: <slug>. That citation is the only
evidence a lesson earned its place.

**Model trailer:** every commit a model authors must end with:
  Model: <Provider> <Model> (<model-id>)

**Lessons matched to this stack:**
- **agent-sessions-live-in-multiple-stores** (2026-08) — One "agent window" can be several backends with separate session stores
- **backslash-escape-slop-breaks-tsx** (2026-08) — AI-generated TSX can ship literal backslash-escapes that break compilation
- **btoa-is-latin1-not-url-safe** (2026-08) — `btoa` is Latin-1 only, and raw base64 is not URL-safe
- **check-lastexitcode-not-stderr** (2026-08) — A native command's stderr output is not a failure verdict
- **cli-migration-sweep-every-invocation-site** (2026-08) — A CLI migration is done only when every invocation site is swept
- **copy-fallback-freezes-the-install** (2026-08) — An installer that falls back from symlink to copy freezes the thing it installed
- **get-content-ansi-default-corrupts-utf8** (2026-08) — Reading a BOM-less UTF-8 file without -Encoding corrupts non-ASCII content
- **hydration-recovery-leaves-stale-attributes** (2026-08) — Hydration-mismatch recovery leaves stale DOM attributes behind
- **layout-metadata-leaks-to-all-pages** (2026-08) — Canonical and og:url set in the root layout leak onto every page
- **next-build-fails-silently-stale-cache** (2026-08) — `next build` can exit 1 with empty output when `.next` is corrupted
- **next-build-vs-live-dev-corrupts-dot-next** (2026-08) — `next build` against a running `next dev` server corrupts both
- **next-dev-is-not-production** (2026-07) — `next dev` does not replicate static and ISR caching
- **node-modules-without-bin-is-broken** (2026-08) — A present node_modules does not mean a working toolchain
- **opencode-env-keys-resolve-at-startup** (2026-08) — Provider `{env:VAR}` keys resolve once, at agent-server startup
- **opencode-explicit-env-apikey-blocks-credential-store** (2026-08) — An explicit `apiKey: {env:X}` in opencode config blocks the credential-store fallback
- **stacked-pr-base-deletion-cascade** (2026-08) — Don't delete a stacked PR's base branch before the whole stack merges
- **vitest-fork-timeout-windows** (2026-08) — On Windows, vitest's default forks pool can hang; run with --no-file-parallelism

**Skills available — load BEFORE coding, not after:**
- **agentic-vocabulary** — Reference skill. Consult when you hit an agentic-coding term that is unfamiliar, ambiguous, or overloaded (skill vs tool vs subagent vs workflow, handoff, harness, context window, progressive disclosure, etc.)
- **capture-lesson** — Use immediately after something surprises you or costs you time, while the context is fresh. Prompts for what happened, applies the four-part test, drafts a lesson against the template, and writes it to `lessons/`.
- **design-handbook** — Use when asked to design, redesign, restyle, or improve the look of a UI, or to "show what this could look like" / "give me HTML" / prototype a visual direction. Produces a browsable standalone HTML handbook.
- **deslop** — YOU HAVE JUST WRITTEN OR GENERATED A BLOCK OF CODE and are about to commit it — run this over your own diff first. Strips comments that restate the code, tutorial-voice asides, commented-out scaffold, lazy `any`, inline values that have a home elsewhere.
- **explain-and-open-pr** — Use to turn finished changes or a found-and-fixed problem into a GitHub PR with a plain-English explanation, instead of letting changes pile up uncommitted.
- **grilling** — Use BEFORE implementation to stress-test a plan, spec, idea, or decision and surface the assumptions and choices hidden inside it.
- **handoff** — Use to pass in-flight work between sessions when context is getting long, a session is ending, or a subtask boundary is reached.
- **sweep-the-class** — YOU HAVE JUST FIXED A BUG, or reviewed someone else's fix, and are about to say it is done — use this first, before reporting completion, to find whether the same defect exists elsewhere.
- **tdd** — YOU ARE ABOUT TO CREATE A NEW TEST FILE, or to add new behaviour that will need one — read this before writing either the test or the code. Defines HOW the red-green loop runs.
<!-- workbench:end -->

## Project Overview

A dashboard that tracks which free AI models are currently available and functional
across three provider APIs: NVIDIA NIM, OpenCode Zen, and OpenRouter `:free` tier.
It discovers models from each provider's catalog, tests each model with a real
`/chat/completions` request, and displays status, response time, function-calling
support, and 7-day uptime history.

**Who it's for:** Developers using free AI model tiers who need to know which models
are live, working, and compatible with T3 Code.

**Key insight:** `lib/models.ts` is a barrel re-export — do NOT add logic there.

## Architecture

```
Layer 0 — Routing/API      src/app/        Next.js App Router (pages + API routes)
Layer 1 — Business Logic   src/lib/        Pure functions + server-side logic (no React import)
Layer 2 — Components       src/components/ UI components (all "use client")
Layer 3 — State            src/hooks/      Custom React hooks
```

### `src/lib/` file guide (add logic here, not to `models.ts`)

| File | Contains |
|------|----------|
| `types.ts` | Domain types: `Provider`, `ModelCategory`, `ModelInfo` (incl. live `benchmarkScore`/`codingScore`/…), `TestResult` (`working` \| `slow` \| `rate-limited` \| `error` \| `timeout` \| `removed`), `UptimeRecord` |
| `curated.ts` | Static data: `T3_KNOWN_BREAKING`, `KNOWN_SLOW`, `T3_AVAILABLE_MODELS`, `FALLBACK_OPENCODE_MODELS`, `FALLBACK_OPENROUTER_MODELS`, `CATEGORY_MAP` |
| `categories.ts` | Pure functions: `normalizeModelId`, `lookupCandidates`, `inferCategory`, `isT3Breaking`, `isKnownSlow`, `isT3Available` |
| `providers.ts` | Provider API clients + URL builders; `fetchAllProviderModels` annotates + sorts via `rankings.ts` |
| `rankings.ts` | Live BenchLM + OpenRouter AA/usage ranking; fuzzy free-tier id matching; 1h `TtlCache` |
| `testing.ts` | `testModel`/`runModelTests`; free-tier 15s budget vs paid 8s; one retry on 429 |
| `rate-limit.ts` | Retry policy for HTTP 429 (`shouldRetryRateLimit`) |
| `uptime-history.ts` | Remote/local uptime merge + 7-day roll for cron `data/uptime-history.json` (on the `data` branch) |
| `picks.ts` | `bestForChips`, `recommendModel` |
| `catalog-changes.ts` | `diffCatalog` → added / removed / free-tier-gone |
| `subscriptions.ts` | Webhook CRUD + `statusChangeAlerts` + best-effort `dispatchAlerts` |
| `api-auth.ts` | `isAuthorized` — CRON_SECRET bearer OR same-origin Origin/Referer check |
| `cache.ts` | `TtlCache<T>` — single-flight + stale-while-error, module-scoped |
| `storage.ts` | localStorage wrappers incl. shortlist |
| `share.ts` | `encodeSnapshot`/`decodeSnapshot` — URL-safe base64 |
| `display.ts` | Theme/color/formatting helpers (no React imports) |

### API routes

| Route | Purpose |
|-------|---------|
| `GET /api/models` | Catalog + `rankingMeta`, 5-min `TtlCache` |
| `POST /api/test` / `/api/test-all` | Auth-gated model probes |
| `GET /api/cron` | Fail-closed daily tests; merges uptime history; preflight in 503 body |
| `GET /api/uptime` | Shared uptime from GitHub `data/uptime-history.json` |
| `GET /api/results` | Cron snapshots (`?date=YYYY-MM-DD` or latest) |

### Data flow: Test a single model

1. User clicks "Test" → `useModelTesting.testOne(model)` → POST `/api/test` with model JSON
2. Route handler validates via `parseModel()` → checks `isAuthorized()` → calls `testModel(apiKey, model)`
3. `testModel()`: strips provider prefix → POST `/chat/completions` (free 15s / paid 8s) → tools probe → optional 429 retry
4. Result merged into `useModelTesting.results` + localStorage; interesting status changes fire webhooks

### Data flow: Dashboard model catalog

1. `useModelCatalog` (auto-refreshes every 5 min) → GET `/api/models`
2. `fetchAllProviderModels` → providers + `rankModels` (BenchLM/OpenRouter) → best-first sort
3. Cached in module-scoped `TtlCache` (5 min) + CDN `stale-while-revalidate=600`
4. Client diffs via `diffCatalog` → `newModels`, `freeTierGone`, changelog, optional webhook alerts
5. Auto-tests newly detected models (skips `KNOWN_SLOW`)

## Development

```bash
npm install          # legacy-peer-deps is set in .npmrc
npm run dev          # localhost:3000
npm test             # vitest unit tests
npm run lint         # eslint
npx tsc --noEmit     # type check
npm run build        # production build
npm run verify:production  # live smoke check against the deployed site
```

**Windows:** Run tests with `npx vitest run --no-file-parallelism` (vitest fork pool can hang).

`verify:production` asserts what unit tests cannot see: that the deployed
catalog is populated and ranked, that no provider is erroring, and that the
shared uptime is *fresh* rather than merely present. A stale uptime history and
a ranking snapshot pointing at a branch with no file were both invisible to the
test suite and only surfaced when the live endpoints were queried. Run it
whenever a change touches cron, the data branch, or either reader.

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `NVIDIA_API_KEY` | Yes | From build.nvidia.com — used by catalog fetch + model testing |
| `OPENROUTER_API_KEY` | Yes | From openrouter.ai — required even for `:free` models |
| `CRON_SECRET` | Optional | Protects `/api/cron` (fails closed/503 if unset) |
| `SNAPSHOT_GITHUB_TOKEN` | Optional | PAT for daily snapshot commits to `data/snapshots/` + rolling `data/uptime-history.json` |

## Critical Constraints

1. **`lib/models.ts` is a barrel re-export.** Add logic to the specific source file
   (`types.ts`, `curated.ts`, `categories.ts`, `providers.ts`, `testing.ts`), not to `models.ts`.

2. **`localStorage` is browser-only.** Read in `useEffect`, never in component initializers
   (prevents SSR hydration mismatches). Applies to `useModelCatalog`, `useModelTesting`,
   `page.tsx`, `ModelDetailPage`.

3. **Model IDs are provider-namespaced.** `opencode/` and `openrouter/` prefixes are
   prepended by this app and stripped before calling upstream APIs. Use
   `normalizeModelId()` from `lib/categories.ts`. NVIDIA IDs keep their `nvidia/` prefix.

4. **`/api/cron` fails closed.** Returns 503 if `CRON_SECRET` is unset. Never lower this.

5. **Cron output lives on the `data` branch, never on a code branch.**
   `data/uptime-history.json`, `data/benchmarks.json` and `data/snapshots/*` are
   written there and read from there. `DATA_BRANCH` in `lib/curated.ts` is the
   single source; `/api/uptime`, `/api/results` and `rankings.ts` must not add
   `master`/`main-dev`/`main` back as fallbacks.

   This has churned twice and both times the cause was a wrong belief about
   which branch production deploys from. **Production deploys from `master`;
   `main-dev` is the integration branch; `master` is also the GitHub default
   branch.** Cron originally wrote to the default branch with no explicit ref
   while `/api/uptime` read only `main-dev`, so shared uptime never appeared. It
   was then pinned to `main-dev` to match the reader, which left `master`
   drifting a data commit behind daily. Verify with `git log`, not assumption.

   Corollary: there is deliberately **no** fallback reader. If `data` is
   unreachable the route returns an empty history — honest, unlike a stale copy.

   This is enforced, not just documented. `tests/data-branch-guard.test.ts`
   fails the build if any code-branch name appears in a string literal under
   `src/`, if cron stops writing to `DATA_BRANCH`, if a reader stops reading it,
   or if a `data/` directory reappears in the working tree.

6. **`TtlCache` uses module-level state.** Intentional — persists across warm serverless
   invocations on Vercel. Do not make it request-scoped.

7. **All `fetch` calls must use `AbortSignal.timeout()`.** 8s for model tests, 10s for
   provider catalog fetches, 15s for GitHub API writes.

8. **Share links are base64 in the URL path.** `encodeSnapshot` caps at 150 results,
   truncates errors to 140 chars. URL length must stay under browser limits.
## Coding Conventions

- Comments explain **why**, not **what** (historical context, design trade-offs)
- Strict TypeScript — no `any`, use proper type guards
- `@/` path alias maps to `src/` (defined in `tsconfig.json` and `vitest.config.mts`)
- All components use `"use client"` except API routes and root layout

## Testing

- **Framework:** Vitest 4.x; node for lib, jsdom via `// @vitest-environment jsdom` for hooks/components
- **Structure:** `tests/` mirrors `lib/` file names; `tests/components/`, `tests/hooks/`
- **Covers:** auth, cache, display, categories, share, storage, rankings, uptime, picks,
  catalog-changes, subscriptions, rate-limit, providers, `/api/models`, testing retry edges,
  ModelTable/AlertSettings, useModelCatalog/useModelTesting
- **Does NOT cover:** full `/api/cron` path (network), React page.tsx end-to-end
- Run: `npm test` (add `--no-file-parallelism` on Windows)

## Dead Code

- None known — ShareDialog.tsx and useToasts.ts were removed.
