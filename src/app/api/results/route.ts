import { NextResponse } from "next/server";
import { DATA_BRANCH } from "@/lib/models";

export const dynamic = "force-dynamic";

const REPO_OWNER = "COR1999";
const REPO_NAME = "opensource-model-tracker";
const SNAPSHOTS_PATH = "data/snapshots";

const RAW_BASES = [
  `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${DATA_BRANCH}/${SNAPSHOTS_PATH}`,
  `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/master/${SNAPSHOTS_PATH}`,
  `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main-dev/${SNAPSHOTS_PATH}`,
  `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${SNAPSHOTS_PATH}`,
];

/** DATA_BRANCH first, then code branches for snapshots predating the migration. */
const REFS = [DATA_BRANCH, "master", "main-dev", "main"] as const;

function corsHeaders(): Record<string, string> {
  return {
    "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    "Access-Control-Allow-Origin": "*",
  };
}

async function fetchJsonFromRaw(path: string): Promise<unknown | null> {
  for (const base of RAW_BASES) {
    try {
      const res = await fetch(`${base}/${path}`, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      return await res.json();
    } catch {
      // try next base
    }
  }
  return null;
}

async function fetchFromGithubApi(token: string, path: string): Promise<unknown | null> {
  for (const ref of REFS) {
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${ref}`;
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "opensource-model-tracker-api",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (res.status === 404) continue;
      if (!res.ok) throw new Error(`GitHub API error (${res.status})`);
      const file = (await res.json()) as { content?: string; encoding?: string };
      if (file.encoding === "base64" && file.content) {
        return JSON.parse(Buffer.from(file.content, "base64").toString("utf-8"));
      }
      return null;
    } catch {
      // try next ref
    }
  }
  return null;
}

/**
 * GET /api/results — daily cron snapshots for external monitors.
 * ?date=YYYY-MM-DD for one day; omit for the latest + availableDates.
 * Reads via raw.githubusercontent when public; falls back to Contents API
 * when SNAPSHOT_GITHUB_TOKEN is set.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const token = process.env.SNAPSHOT_GITHUB_TOKEN;

  if (dateParam) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return NextResponse.json({ error: "date must be YYYY-MM-DD format" }, { status: 400 });
    }
    const path = `${SNAPSHOTS_PATH}/${dateParam}.json`;
    let decoded = await fetchJsonFromRaw(`${dateParam}.json`);
    if (!decoded && token) decoded = await fetchFromGithubApi(token, path);
    if (!decoded) {
      return NextResponse.json({ error: `No snapshot for ${dateParam}` }, { status: 404 });
    }
    return NextResponse.json(decoded, { headers: corsHeaders() });
  }

  // List via GitHub Contents API when token present; otherwise try known
  // recent raw dates is impractical — require token for listing, or return 404.
  if (!token) {
    return NextResponse.json(
      {
        error:
          "Set SNAPSHOT_GITHUB_TOKEN to list snapshots, or request ?date=YYYY-MM-DD (raw public snapshots may still work for a specific date)",
      },
      { status: 503 }
    );
  }

  let files: Array<{ name: string }> | null = null;
  for (const ref of REFS) {
    const listRes = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${SNAPSHOTS_PATH}?ref=${ref}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "opensource-model-tracker-api",
        },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (listRes.status === 404) continue;
    if (!listRes.ok) {
      return NextResponse.json({ error: `GitHub API error (${listRes.status})` }, { status: 502 });
    }
    files = (await listRes.json()) as Array<{ name: string }>;
    break;
  }
  if (!files) {
    return NextResponse.json({ error: "No snapshots directory found" }, { status: 404 });
  }

  const snapshots = files
    .filter((f) => f.name.endsWith(".json"))
    .map((f) => f.name.replace(/\.json$/, ""))
    .sort()
    .reverse();

  if (snapshots.length === 0) {
    return NextResponse.json({ error: "No snapshots available" }, { status: 404 });
  }

  const latest = snapshots[0];
  const decoded =
    (await fetchFromGithubApi(token, `${SNAPSHOTS_PATH}/${latest}.json`)) ??
    (await fetchJsonFromRaw(`${latest}.json`));
  if (!decoded) {
    return NextResponse.json({ error: "Failed to fetch latest snapshot" }, { status: 502 });
  }

  return NextResponse.json(
    { ...(decoded as object), availableDates: snapshots.slice(0, 30) },
    { headers: corsHeaders() }
  );
}
