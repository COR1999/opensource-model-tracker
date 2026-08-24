# opensource-model-tracker — agent context

<!-- workbench:start — managed by Agent-Workbench; do not edit inside this block -->
## Inherited from Agent-Workbench (v0.8.0, imported 2026-08-24)

<!-- Rules and lessons here are copied from the workbench. Edit them at the
     source and re-run scripts/adopt.sh; edits made inside this block are lost. -->

**Work record:** commit bodies carry the durable account — how it was found, the
root cause, the mechanism chosen and why, and how it was verified. Not a one-line
subject.

**Citing a lesson:** when one of the lessons below changes what you do, name
it in the commit body or PR as: lesson: <slug>. That citation is the only
evidence a lesson earned its place.

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
<!-- workbench:end -->
