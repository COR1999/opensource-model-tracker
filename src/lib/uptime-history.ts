import type { TestResult, UptimeRecord } from "./types";

export interface RemoteUptimeHistory {
  updatedAt: string | null;
  days: Record<string, UptimeRecord[]>;
}

export const EMPTY_REMOTE_UPTIME: RemoteUptimeHistory = { updatedAt: null, days: {} };

function isUptimeRecord(v: unknown): v is UptimeRecord {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as UptimeRecord).timestamp === "number" &&
    typeof (v as UptimeRecord).status === "string"
  );
}

/** Parse a remote uptime-history payload; never throws on junk. */
export function parseRemoteUptime(raw: unknown): RemoteUptimeHistory {
  if (!raw || typeof raw !== "object") return EMPTY_REMOTE_UPTIME;
  const days = (raw as { days?: unknown }).days;
  if (!days || typeof days !== "object" || Array.isArray(days)) return EMPTY_REMOTE_UPTIME;
  const out: Record<string, UptimeRecord[]> = {};
  for (const [modelId, list] of Object.entries(days as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const kept = list.filter(isUptimeRecord);
    if (kept.length > 0) out[modelId] = kept;
  }
  const updatedAt = (raw as { updatedAt?: unknown }).updatedAt;
  return {
    updatedAt: typeof updatedAt === "string" ? updatedAt : null,
    days: out,
  };
}

/**
 * Merge remote (cron/shared) uptime into a local map by modelId.
 * Newer timestamps win per modelId when both sides have records; otherwise
 * concatenate and sort ascending so sparklines stay chronological.
 */
export function mergeUptimeHistory(
  local: Record<string, UptimeRecord[]>,
  remote: RemoteUptimeHistory
): Record<string, UptimeRecord[]> {
  const ids = new Set([...Object.keys(local), ...Object.keys(remote.days)]);
  const out: Record<string, UptimeRecord[]> = {};
  for (const id of ids) {
    const a = local[id] ?? [];
    const b = remote.days[id] ?? [];
    if (a.length === 0 && b.length === 0) continue;
    const seen = new Set<string>();
    const merged: UptimeRecord[] = [];
    for (const rec of [...a, ...b]) {
      const key = `${rec.timestamp}:${rec.status}:${rec.responseTimeMs}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(rec);
    }
    merged.sort((x, y) => x.timestamp - y.timestamp);
    out[id] = merged;
  }
  return out;
}

/** Roll today's cron results into a shared history payload (7-day window). */
export function buildRemoteUptimeHistory(
  previous: RemoteUptimeHistory,
  results: TestResult[],
  now: number = Date.now()
): RemoteUptimeHistory {
  const days: Record<string, UptimeRecord[]> = {};
  for (const [modelId, list] of Object.entries(previous.days)) {
    days[modelId] = [...list];
  }
  for (const r of results) {
    const list = days[r.modelId] ?? [];
    list.push({ timestamp: now, status: r.status, responseTimeMs: r.responseTimeMs });
    days[r.modelId] = list;
  }
  const cutoff = now - 7 * 24 * 60 * 60 * 1000;
  const trimmed: Record<string, UptimeRecord[]> = {};
  for (const [modelId, list] of Object.entries(days)) {
    const kept = list.filter((r) => r.timestamp > cutoff);
    if (kept.length > 0) trimmed[modelId] = kept;
  }
  return { updatedAt: new Date(now).toISOString(), days: trimmed };
}
