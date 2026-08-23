import { NextResponse } from "next/server";
import {
  fetchAllProviderModels,
  runModelTests,
  isKnownSlow,
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

function utcDateStamp(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

// Writes the snapshot as a daily commit to this repo via the GitHub Contents
// API. Needs a fine-grained PAT with contents:write on this repository in
// SNAPSHOT_GITHUB_TOKEN; without it the run still completes but reports
// persistence as skipped rather than failing the whole check.
async function persistSnapshot(
  token: string,
  stamp: string,
  summary: object
): Promise<{ persisted: boolean; detail: string }> {
  const path = `data/snapshots/${stamp}.json`;
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
        message: `snapshot: ${stamp} automated model health check`,
        content: Buffer.from(JSON.stringify(summary, null, 2)).toString("base64"),
        ...(sha ? { sha } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!put.ok) {
      const body = await put.text();
      return { persisted: false, detail: `GitHub PUT ${put.status}: ${body.slice(0, 200)}` };
    }
    return { persisted: true, detail: sha ? `updated ${path}` : `created ${path}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { persisted: false, detail: msg };
  }
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Fail closed: this endpoint spends the server API key testing every model,
  // so it must never be reachable without auth. If CRON_SECRET is unset, deny
  // rather than silently skipping the check.
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
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
    down,
    removed,
    results,
  };

  let persistence: { persisted: boolean; detail: string } = {
    persisted: false,
    detail: "SNAPSHOT_GITHUB_TOKEN not configured",
  };
  const snapshotToken = process.env.SNAPSHOT_GITHUB_TOKEN;
  if (snapshotToken) {
    persistence = await persistSnapshot(snapshotToken, summary.date, summary);
  }

  return NextResponse.json({ ...summary, persistence });
}
