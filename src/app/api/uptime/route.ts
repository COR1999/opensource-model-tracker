import { NextResponse } from "next/server";
import {
  parseRemoteUptime,
  EMPTY_REMOTE_UPTIME,
  type RemoteUptimeHistory,
} from "@/lib/models";
import { TtlCache } from "@/lib/cache";
import { DATA_BRANCH } from "@/lib/models";

export const dynamic = "force-dynamic";

const REPO_OWNER = "COR1999";
const REPO_NAME = "opensource-model-tracker";
const HISTORY_PATH = "data/uptime-history.json";

// Shared uptime is written by cron at most daily; 1h TTL is plenty.
const UPTIME_TTL_MS = 60 * 60 * 1000;
const uptimeCache = new TtlCache<RemoteUptimeHistory>(UPTIME_TTL_MS);

async function loadFromGitHubRaw(): Promise<RemoteUptimeHistory> {
  const token = process.env.SNAPSHOT_GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "opensource-model-tracker-uptime",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  // DATA_BRANCH is the single source of truth for cron output. The code
  // branches deliberately do not carry these files: two divergent copies meant
  // the reader could serve a stale one and win the race against the fresh one.
  // Nothing to fall back to — if the data branch is unreachable, there is no
  // history to show, which is honest rather than misleading.
  const urls = [
    `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${DATA_BRANCH}/${HISTORY_PATH}`,
  ];
  if (token) {
    urls.unshift(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${HISTORY_PATH}?ref=${DATA_BRANCH}`
    );
  }

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const text = await res.text();
      if (url.includes("api.github.com")) {
        const payload = (await JSON.parse(text)) as { content?: string; encoding?: string };
        if (!payload.content) continue;
        const decoded = Buffer.from(payload.content, "base64").toString("utf8");
        return parseRemoteUptime(JSON.parse(decoded));
      }
      return parseRemoteUptime(JSON.parse(text));
    } catch {
      // try next source
    }
  }
  return EMPTY_REMOTE_UPTIME;
}

export async function GET() {
  try {
    const { value } = await uptimeCache.get(loadFromGitHubRaw);
    return NextResponse.json(
      { ...value, cached: true },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
        },
      }
    );
  } catch {
    return NextResponse.json({ ...EMPTY_REMOTE_UPTIME }, { status: 200 });
  }
}
