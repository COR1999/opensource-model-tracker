import type { ModelInfo } from "./types";
import { normalizeModelId } from "./categories";
import { TtlCache } from "./cache";

/**
 * Live benchmark ranking for free-tier models.
 *
 * Primary source: BenchLM's public leaderboard JSON (no auth). Secondary:
 * OpenRouter Data API `/api/v1/benchmarks` (Artificial Analysis indexes) and
 * `/api/v1/datasets/rankings-daily` (usage) when OPENROUTER_API_KEY is set.
 * Matching is fuzzy on normalised keys because Zen renames models and free
 * tiers add suffixes BenchLM does not use.
 */

export type BenchmarkSource = "benchlm" | "openrouter-aa" | "openrouter-usage";

export interface BenchmarkEntry {
  rank?: number;
  /** BenchLM overall 0-100 when available; not mixed with AA indexes. */
  score?: number;
  intelligence?: number;
  coding?: number;
  agentic?: number;
  knowledge?: number;
  usageRank?: number;
  source: BenchmarkSource;
}

export interface BenchmarkIndex {
  byKey: Map<string, BenchmarkEntry>;
  meta: { asOf: string | null; sources: string[] };
}

const BENCHLM_LEADERBOARD_URL = "https://benchlm.ai/api/data/leaderboard";
const BENCHMARKS_SNAPSHOT_URLS = [
  "https://raw.githubusercontent.com/COR1999/opensource-model-tracker/data/data/benchmarks.json",
  "https://raw.githubusercontent.com/COR1999/opensource-model-tracker/main-dev/data/benchmarks.json",
  "https://raw.githubusercontent.com/COR1999/opensource-model-tracker/master/data/benchmarks.json",
];
const OPENROUTER_BENCHMARKS_URL =
  "https://openrouter.ai/api/v1/benchmarks?source=artificial-analysis&max_results=100";
const OPENROUTER_RANKINGS_URL =
  "https://openrouter.ai/api/v1/datasets/rankings-daily";

// BenchLM updates on the order of days; OpenRouter traffic is continuous but
// the catalog only refreshes every 5 minutes, so an hour is plenty.
const RANKINGS_TTL_MS = 60 * 60 * 1000;
const rankingsCache = new TtlCache<BenchmarkIndex>(RANKINGS_TTL_MS);

/** Alphanumeric-only lowercase key for cross-provider name matching. */
export function rankingKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^(opencode|openrouter|nvidia)\//, "")
    .replace(/:free$/i, "")
    .replace(/-free$/i, "")
    .replace(/\(free\)/gi, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

const STRIP_SUFFIXES = [
  "contributor",
  "instruct",
  "instruction",
  "it",
  "preview",
  "max",
  "high",
  "xhigh",
  "reasoning",
  "thinking",
  "adaptive",
  "fallback",
];

/** All lookup keys for one external model name, most specific first. */
export function rankingKeys(...parts: string[]): string[] {
  const base = rankingKey(parts.filter(Boolean).join(" "));
  const keys = new Set<string>();
  if (base) keys.add(base);

  // Strip known vendor/marketing suffixes and date stamps so
  // "Muse Spark 1.2 (xhigh)" / "glm-5.2-20260616" still hit "musespark12"/"glm52".
  let cursor = base.replace(/\d{6,8}$/, "");
  if (cursor) keys.add(cursor);
  for (const token of STRIP_SUFFIXES) {
    const t = rankingKey(token);
    if (t && cursor.length > t.length && cursor.endsWith(t)) {
      cursor = cursor.slice(0, -t.length).replace(/\d{6,8}$/, "");
      if (cursor) keys.add(cursor);
    }
  }

  // Path-suffix keys: "z-ai/glm-5.2" → also "glm52".
  const bare = rankingKey(normalizeModelId(parts.join(" ")));
  if (bare) keys.add(bare.replace(/\d{6,8}$/, ""));
  const segments = parts
    .join(" ")
    .replace(/^(opencode|openrouter)\//, "")
    .replace(/:free$/i, "")
    .replace(/-free$/i, "")
    .split("/")
    .filter(Boolean);
  if (segments.length > 0) {
    const last = rankingKey(segments[segments.length - 1]).replace(/\d{6,8}$/, "");
    if (last) keys.add(last);
  }
  return [...keys].filter(Boolean);
}

function putEntry(byKey: Map<string, BenchmarkEntry>, entry: BenchmarkEntry, ...names: string[]): void {
  for (const name of names) {
    for (const key of rankingKeys(name)) {
      const existing = byKey.get(key);
      // Prefer entries that carry an overall score (BenchLM) over usage-only rows.
      if (!existing || (existing.score == null && entry.score != null)) {
        byKey.set(key, { ...existing, ...entry, source: entry.source });
      } else if (existing.score != null && entry.score != null && entry.score > existing.score) {
        byKey.set(key, { ...existing, ...entry, source: entry.source });
      } else if (existing) {
        // Fill missing category fields from a secondary source without
        // clobbering BenchLM's overall score/rank.
        byKey.set(key, {
          ...entry,
          ...existing,
          coding: existing.coding ?? entry.coding,
          agentic: existing.agentic ?? entry.agentic,
          knowledge: existing.knowledge ?? entry.knowledge,
          usageRank: existing.usageRank ?? entry.usageRank,
        });
      }
    }
  }
}

function parseBenchlm(payload: unknown, byKey: Map<string, BenchmarkEntry>): void {
  const models = (payload as { models?: unknown[] })?.models;
  if (!Array.isArray(models)) return;
  for (const row of models) {
    const r = row as {
      rank?: number;
      model?: string;
      creator?: string;
      overallScore?: number;
      categoryScores?: { coding?: number | null; agentic?: number | null; knowledge?: number | null };
    };
    if (!r.model) continue;
    const entry: BenchmarkEntry = {
      rank: r.rank,
      score: typeof r.overallScore === "number" ? r.overallScore : undefined,
      coding: r.categoryScores?.coding ?? undefined,
      agentic: r.categoryScores?.agentic ?? undefined,
      knowledge: r.categoryScores?.knowledge ?? undefined,
      source: "benchlm",
    };
    putEntry(byKey, entry, r.model, r.creator ? `${r.creator} ${r.model}` : r.model);
  }
}

function parseOpenRouterBenchmarks(payload: unknown, byKey: Map<string, BenchmarkEntry>): void {
  const data = (payload as { data?: unknown[] })?.data;
  if (!Array.isArray(data)) return;
  for (const row of data) {
    const r = row as {
      model_permaslug?: string;
      display_name?: string;
      intelligence_index?: number | null;
      coding_index?: number | null;
      agentic_index?: number | null;
    };
    const names = [r.display_name, r.model_permaslug].filter(
      (n): n is string => typeof n === "string" && n.length > 0
    );
    if (names.length === 0) continue;
    const entry: BenchmarkEntry = {
      // AA indexes are a different scale from BenchLM overall; never use them
      // as benchmarkScore. They fill coding/agentic/intelligence for models
      // BenchLM's top-50 JSON does not list.
      intelligence: typeof r.intelligence_index === "number" ? r.intelligence_index : undefined,
      coding: typeof r.coding_index === "number" ? r.coding_index : undefined,
      agentic: typeof r.agentic_index === "number" ? r.agentic_index : undefined,
      source: "openrouter-aa",
    };
    putEntry(byKey, entry, ...names);
  }
}

function parseOpenRouterUsage(payload: unknown, byKey: Map<string, BenchmarkEntry>): void {
  const data = (payload as { data?: unknown[] })?.data;
  if (!Array.isArray(data)) return;
  // Aggregate token counts per permaslug across the returned window, then rank.
  const totals = new Map<string, number>();
  for (const row of data) {
    const r = row as { model_permaslug?: string; total_tokens?: string };
    if (!r.model_permaslug || r.model_permaslug === "other") continue;
    const n = Number(r.total_tokens);
    if (!Number.isFinite(n)) continue;
    totals.set(r.model_permaslug, (totals.get(r.model_permaslug) ?? 0) + n);
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  ranked.forEach(([slug], i) => {
    putEntry(byKey, { usageRank: i + 1, source: "openrouter-usage" }, slug);
  });
}

interface BenchlmLoad {
  ok: boolean;
  asOf: string | null;
}

function readLastUpdated(payload: unknown): string | null {
  const value = (payload as { lastUpdated?: unknown }).lastUpdated;
  return typeof value === "string" ? value : null;
}

/**
 * A non-2xx from BenchLM is an outage just as much as a thrown fetch is, so
 * both must fall through to the committed snapshot rather than silently
 * producing an unranked catalog.
 */
async function loadBenchlmPrimary(byKey: Map<string, BenchmarkEntry>): Promise<BenchlmLoad> {
  try {
    const res = await fetch(BENCHLM_LEADERBOARD_URL, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { ok: false, asOf: null };
    const payload = await res.json();
    parseBenchlm(payload, byKey);
    return { ok: true, asOf: readLastUpdated(payload) };
  } catch {
    return { ok: false, asOf: null };
  }
}

/** data/benchmarks.json as committed by the daily cron snapshot job. */
async function loadBenchlmSnapshot(byKey: Map<string, BenchmarkEntry>): Promise<BenchlmLoad> {
  for (const url of BENCHMARKS_SNAPSHOT_URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const payload = await res.json();
      parseBenchlm(payload, byKey);
      return { ok: true, asOf: readLastUpdated(payload) };
    } catch {
      // try the next snapshot branch
    }
  }
  return { ok: false, asOf: null };
}

async function loadBenchmarks(): Promise<BenchmarkIndex> {
  const byKey = new Map<string, BenchmarkEntry>();
  const sources: string[] = [];
  let asOf: string | null = null;

  const benchlm = await loadBenchlmPrimary(byKey);
  if (benchlm.ok) {
    sources.push("benchlm");
    asOf = benchlm.asOf;
  } else {
    const snapshot = await loadBenchlmSnapshot(byKey);
    if (snapshot.ok) {
      sources.push("benchlm-snapshot");
      asOf = snapshot.asOf;
    }
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    try {
      const res = await fetch(
        `${OPENROUTER_BENCHMARKS_URL.replace("max_results=100", "max_results=200")}`,
        {
          headers: { Authorization: `Bearer ${openRouterKey}` },
          signal: AbortSignal.timeout(10000),
        }
      );
      if (res.ok) {
        parseOpenRouterBenchmarks(await res.json(), byKey);
        sources.push("openrouter-aa");
      }
    } catch {
      // optional enrichment
    }

    try {
      // One recent day of usage is enough to rank free variants.
      const end = new Date();
      end.setUTCDate(end.getUTCDate() - 1);
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 1);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      const res = await fetch(
        `${OPENROUTER_RANKINGS_URL}?start_date=${fmt(start)}&end_date=${fmt(end)}`,
        {
          headers: { Authorization: `Bearer ${openRouterKey}` },
          signal: AbortSignal.timeout(10000),
        }
      );
      if (res.ok) {
        parseOpenRouterUsage(await res.json(), byKey);
        sources.push("openrouter-usage");
      }
    } catch {
      // optional enrichment
    }
  }

  return { byKey, meta: { asOf, sources } };
}

export async function getBenchmarkIndex(): Promise<BenchmarkIndex> {
  const { value } = await rankingsCache.get(loadBenchmarks);
  return value;
}

export function lookupBenchmark(model: ModelInfo, index: BenchmarkIndex): BenchmarkEntry | undefined {
  const candidates = [
    ...rankingKeys(model.id),
    ...rankingKeys(model.displayName),
    ...rankingKeys(model.ownedBy, model.displayName),
  ];
  for (const key of candidates) {
    const hit = index.byKey.get(key);
    if (hit) return hit;
  }
  // Prefix fallback: "deepseekv4flash0731" should still hit "deepseekv4flash".
  for (const key of candidates) {
    if (key.length < 8) continue;
    for (const [k, entry] of index.byKey) {
      if (k.startsWith(key) || key.startsWith(k)) {
        if (k.length >= 8 || key.length >= 8) return entry;
      }
    }
  }
  return undefined;
}

/** Attach benchmark fields and sort best-first. */
export function annotateAndSortModels(models: ModelInfo[], index: BenchmarkIndex): ModelInfo[] {
  const annotated = models.map((m) => {
    const hit = lookupBenchmark(m, index);
    if (!hit) return { ...m };
    return {
      ...m,
      benchmarkScore: hit.score,
      benchmarkRank: hit.rank,
      codingScore: hit.coding,
      agenticScore: hit.agentic,
      knowledgeScore: hit.knowledge,
      intelligenceScore: hit.intelligence,
      usageRank: hit.usageRank,
    };
  });

  return annotated.sort((a, b) => {
    // 1) BenchLM overall (0-100), when known.
    const sa = a.benchmarkScore;
    const sb = b.benchmarkScore;
    const aHas = typeof sa === "number";
    const bHas = typeof sb === "number";
    if (aHas && bHas && sa !== sb) return (sb as number) - (sa as number);
    if (aHas !== bHas) return aHas ? -1 : 1;

    // 2) Models BenchLM has not scored still rank by OpenRouter AA coding,
    //    then agentic, then intelligence — different scale, but useful order.
    const ca = a.codingScore ?? -1;
    const cb = b.codingScore ?? -1;
    if (ca !== cb) return cb - ca;
    const aa = a.agenticScore ?? -1;
    const ab = b.agenticScore ?? -1;
    if (aa !== ab) return ab - aa;
    const ia = a.intelligenceScore ?? -1;
    const ib = b.intelligenceScore ?? -1;
    if (ia !== ib) return ib - ia;

    // 3) Usage rank if known, then provider/id.
    const ua = a.usageRank ?? Number.POSITIVE_INFINITY;
    const ub = b.usageRank ?? Number.POSITIVE_INFINITY;
    if (ua !== ub) return ua - ub;

    return a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id);
  });
}

export async function rankModels(models: ModelInfo[]): Promise<{
  models: ModelInfo[];
  meta: BenchmarkIndex["meta"];
}> {
  const index = await getBenchmarkIndex();
  return { models: annotateAndSortModels(models, index), meta: index.meta };
}
