import { NextResponse } from "next/server";
import {
  fetchAllProviderModels,
  runModelTests,
  isKnownSlow,
  parseRemoteUptime,
  buildRemoteUptimeHistory,
  ModelCategory,
  TestResult,
} from "@/lib/models";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel caps serverless functions at 60s and Cron discards response bodies.
// Scope targets the categories shown by default and skips known-slow entries
// so a full pass fits the window: ~45 models at concurrency 16 is ~3 batches.
const CONCURRENCY = 16;
const TESTABLE_CATEGORIES: ReadonlySet<ModelCategory> = new Set(["chat", "code", "vision"]);

const REPO_OWNER = "COR1999";
const REPO_NAME = "opensource-model-tracker";
const UPTIME_HISTORY_PATH = "data/uptime-history.json";

function utcDateStamp(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

async function fetchExistingJson(token: string, path: string): Promise<unknown | null> {
  const apiBase = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "opensource-model-tracker-cron",
  };
  try {
    const res = await fetch(apiBase, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const payload = (await res.json()) as { content?: string };
    if (!payload.content) return null;
    return JSON.parse(Buffer.from(payload.content, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

async function putJsonFile(
  token: string,
  path: string,
  data: unknown,
  message: string
): Promise<{ persisted: boolean; detail: string }> {
  const apiBase = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "opensource-model-tracker-cron",
    "Content-Type": "application/json",
  };

  try {
    let sha: string | undefined;
    const existing = await fetch(apiBase, { headers, signal: AbortSignal.timeout(10000) });
    if (existing.ok) {
      sha = ((await existing.json()) as { sha?: string }).sha;
    }

    const put = await fetch(apiBase, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message,
        content: Buffer.from(JSON.stringify(data, null, 2)).toString("base64"),
        ...(sha ? { sha } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!put.ok) {
      return { persisted: false, detail: `GitHub API error (${put.status})` };
    }
    return { persisted: true, detail: sha ? `updated ${path}` : `created ${path}` };
  } catch {
    return { persisted: false, detail: "GitHub API request failed" };
  }
}

async function persistSnapshot(
  token: string,
  stamp: string,
  summary: object
): Promise<{ persisted: boolean; detail: string }> {
  return putJsonFile(
    token,
    `data/snapshots/${stamp}.json`,
    summary,
    `snapshot: ${stamp} automated model health check`
  );
}

async function persistUptimeHistory(
  token: string,
  results: TestResult[],
  now: number
): Promise<{ persisted: boolean; detail: string }> {
  const previousRaw = await fetchExistingJson(token, UPTIME_HISTORY_PATH);
  const previous = parseRemoteUptime(previousRaw);
  const next = buildRemoteUptimeHistory(previous, results, now);
  return putJsonFile(
    token,
    UPTIME_HISTORY_PATH,
    next,
    `uptime: ${utcDateStamp(now)} merge cron results`
  );
}

/** Non-fatal setup report so remote operators know what is missing. */
function cronPreflight(): Record<string, string | boolean> {
  return {
    cronSecretConfigured: Boolean(process.env.CRON_SECRET),
    snapshotTokenConfigured: Boolean(process.env.SNAPSHOT_GITHUB_TOKEN),
    nvidiaKeyConfigured: Boolean(process.env.NVIDIA_API_KEY),
    openrouterKeyConfigured: Boolean(process.env.OPENROUTER_API_KEY),
    scheduleHint:
      "Vercel → Project → Cron Jobs: schedule /api/cron (e.g. 0 */6 * * *) with Authorization: Bearer $CRON_SECRET",
  };
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Fail closed: this endpoint tests every model with the server API key, so
  // it must never be reachable without auth. If CRON_SECRET is unset, deny
  // rather than silently skipping the check.
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured", preflight: cronPreflight() },
      { status: 503 }
    );
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const apiKey = process.env.NVIDIA_API_KEY || "";
  const { models: allModels } = await fetchAllProviderModels(apiKey);

  const scoped = allModels.filter(
    (m) => TESTABLE_CATEGORIES.has(m.category) && !isKnownSlow(m.id)
  );
  const results: TestResult[] = await runModelTests(apiKey, scoped, CONCURRENCY);

  const working = results.filter((r) => r.status === "working").length;
  const slow = results.filter((r) => r.status === "slow").length;
  const rateLimited = results.filter((r) => r.status === "rate-limited").length;
  const down = results.filter((r) => r.status === "error" || r.status === "timeout").length;
  const removed = results.filter((r) => r.status === "removed").length;

  const summary = {
    date: utcDateStamp(startedAt),
    timestamp: startedAt,
    durationMs: Date.now() - startedAt,
    discoveredTotal: allModels.length,
    testedTotal: results.length,
    working,
    slow,
    rateLimited,
    down,
    removed,
    results,
  };

  let persistence: { persisted: boolean; detail: string } = {
    persisted: false,
    detail: "SNAPSHOT_GITHUB_TOKEN not configured",
  };
  let uptimePersistence: { persisted: boolean; detail: string } = {
    persisted: false,
    detail: "SNAPSHOT_GITHUB_TOKEN not configured",
  };
  const snapshotToken = process.env.SNAPSHOT_GITHUB_TOKEN;
  if (snapshotToken) {
    persistence = await persistSnapshot(snapshotToken, summary.date, summary);
    uptimePersistence = await persistUptimeHistory(snapshotToken, results, startedAt);
  }

  return NextResponse.json({
    ...summary,
    persistence,
    uptimePersistence,
    preflight: cronPreflight(),
  });
}
