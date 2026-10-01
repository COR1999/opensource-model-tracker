#!/usr/bin/env node
/**
 * Live production smoke check.
 *
 * Unit tests cannot see whether the deployed app is actually serving fresh
 * data. Two of the three bugs fixed this session were invisible to the suite
 * and only showed up when the real endpoints were queried: a shared uptime
 * history that stopped updating, and a ranking snapshot pointing at a branch
 * where no file existed. This asserts the things that were silently wrong.
 *
 * Exits non-zero on the first failed invariant, so it can gate a deploy.
 *
 *   node scripts/verify-production.mjs
 *   node scripts/verify-production.mjs https://staging.example.com
 */
import process from "node:process";

const BASE = (process.argv[2] || "https://opensource-model-tracker.vercel.app").replace(/\/$/, "");
/** Shared uptime older than this means cron has stopped committing. */
const MAX_UPTIME_AGE_MS = 30 * 60 * 60 * 1000;

const failures = [];
const checks = [];

function check(name, condition, detail) {
  checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

async function getJson(path) {
  // A network-level failure is a failed check, not a crash: the point of this
  // script is to report what is wrong, including "nothing is reachable".
  try {
    const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(45000) });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } catch (err) {
    return { status: 0, body: null, error: err instanceof Error ? err.message : String(err) };
  }
}

function isFreeTier(id) {
  return /:free$|-free$/.test(id) || id.endsWith("/big-pickle");
}

const catalog = await getJson("/api/models");
check("/api/models returns 200", catalog.status === 200, catalog.error ?? `got ${catalog.status}`);
check(
  "/api/models returns a non-empty catalog",
  Array.isArray(catalog.body?.models) && catalog.body.models.length > 0,
  `models=${catalog.body?.models?.length}`
);

const freeCount = (catalog.body?.models ?? []).filter((m) => isFreeTier(m.id)).length;
check(
  "catalog contains free-tier models",
  freeCount > 0,
  `${freeCount} free of ${catalog.body?.models?.length ?? 0}`
);
check(
  "no provider reported an error",
  Object.values(catalog.body?.errors ?? {}).every((e) => !e),
  JSON.stringify(catalog.body?.errors ?? {})
);
check(
  "ranking sources are populated",
  Array.isArray(catalog.body?.rankingMeta?.sources) && catalog.body.rankingMeta.sources.length > 0,
  "rankingMeta.sources is empty — every model would sort unranked"
);

const uptime = await getJson("/api/uptime");
check("/api/uptime returns 200", uptime.status === 200, uptime.error ?? `got ${uptime.status}`);
const uptimeModels = Object.keys(uptime.body?.days ?? {}).length;
check(
  "/api/uptime serves history for some models",
  uptimeModels > 0,
  "empty history — the data branch may be unreachable or cron may have stopped"
);
const updatedAt = Date.parse(uptime.body?.updatedAt ?? "");
check("/api/uptime reports a parseable updatedAt", !Number.isNaN(updatedAt));
if (!Number.isNaN(updatedAt)) {
  const ageMs = Date.now() - updatedAt;
  check(
    "shared uptime is fresh (cron is committing)",
    ageMs < MAX_UPTIME_AGE_MS,
    `stale by ${Math.round(ageMs / 3600000)}h — cron has not committed recently`
  );
}

const results = await getJson("/api/results");
check("/api/results returns 200", results.status === 200, results.error ?? `got ${results.status}`);
check(
  "/api/results exposes at least one snapshot date",
  Array.isArray(results.body?.availableDates) && results.body.availableDates.length > 0,
  "no snapshot dates — SNAPSHOT_GITHUB_TOKEN or the data branch is wrong"
);

const width = Math.max(...checks.map((c) => c.name.length));
for (const c of checks) {
  const mark = c.ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${c.name.padEnd(width)}${c.ok || !c.detail ? "" : `  (${c.detail})`}`);
}

console.log(`\n${BASE}`);
if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} checks passed.`);