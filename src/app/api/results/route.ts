import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const REPO_OWNER = "COR1999";
const REPO_NAME = "opensource-model-tracker";
const SNAPSHOTS_PATH = "data/snapshots";

/**
 * GET /api/results
 *
 * Returns the latest daily snapshot from data/snapshots/. External callers
 * can use this to monitor model health without scraping the dashboard.
 *
 * Query params:
 *   date — specific date (YYYY-MM-DD). Omit for the most recent snapshot.
 *
 * Requires SNAPSHOT_GITHUB_TOKEN to read from the repo.
 */
export async function GET(req: Request) {
  const token = process.env.SNAPSHOT_GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "SNAPSHOT_GITHUB_TOKEN not configured" },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "opensource-model-tracker-api",
  };

  // If a specific date is requested, fetch that snapshot directly.
  if (dateParam) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return NextResponse.json(
        { error: "date must be YYYY-MM-DD format" },
        { status: 400 },
      );
    }
    const snapUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${SNAPSHOTS_PATH}/${dateParam}.json`;
    const res = await fetch(snapUrl, { headers, signal: AbortSignal.timeout(10000) });
    if (res.status === 404) {
      return NextResponse.json({ error: `No snapshot for ${dateParam}` }, { status: 404 });
    }
    if (!res.ok) {
      return NextResponse.json({ error: `GitHub API error (${res.status})` }, { status: 502 });
    }
    const file = await res.json() as { content?: string; encoding?: string };
    if (file.encoding === "base64" && file.content) {
      const decoded = JSON.parse(Buffer.from(file.content, "base64").toString("utf-8"));
      return NextResponse.json(decoded, {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
    return NextResponse.json({ error: "Failed to decode snapshot" }, { status: 500 });
  }

  // No date specified — list available snapshots and return the latest.
  const listUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${SNAPSHOTS_PATH}`;
  const listRes = await fetch(listUrl, { headers, signal: AbortSignal.timeout(10000) });
  if (listRes.status === 404) {
    return NextResponse.json({ error: "No snapshots directory found" }, { status: 404 });
  }
  if (!listRes.ok) {
    return NextResponse.json({ error: `GitHub API error (${listRes.status})` }, { status: 502 });
  }

  const files = await listRes.json() as Array<{ name: string; path: string }>;
  const snapshots = files
    .filter((f) => f.name.endsWith(".json"))
    .map((f) => f.name.replace(".json", ""))
    .sort()
    .reverse();

  if (snapshots.length === 0) {
    return NextResponse.json({ error: "No snapshots available" }, { status: 404 });
  }

  const latest = snapshots[0];
  const snapUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${SNAPSHOTS_PATH}/${latest}.json`;
  const snapRes = await fetch(snapUrl, { headers, signal: AbortSignal.timeout(10000) });
  if (!snapRes.ok) {
    return NextResponse.json({ error: `Failed to fetch latest snapshot` }, { status: 502 });
  }

  const file = await snapRes.json() as { content?: string; encoding?: string };
  if (file.encoding === "base64" && file.content) {
    const decoded = JSON.parse(Buffer.from(file.content, "base64").toString("utf-8"));
    return NextResponse.json(
      {
        ...decoded,
        availableDates: snapshots.slice(0, 30),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }

  return NextResponse.json({ error: "Failed to decode snapshot" }, { status: 500 });
}
