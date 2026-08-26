import type { TestResult } from "./models";

export interface Subscription {
  id: string;
  url: string;
  /** If set, only fire for these model IDs. Empty = all models. */
  modelIds: string[];
  createdAt: number;
}

export interface AlertPayload {
  type: "status_change" | "new_model" | "removed_model";
  timestamp: number;
  modelId: string;
  displayName: string;
  provider: string;
  previousStatus?: TestResult["status"];
  currentStatus?: TestResult["status"];
}

const STORAGE_KEY = "model-tracker-subscriptions";

function read(): Subscription[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(
      (s): s is Subscription =>
        !!s && typeof s === "object" && typeof s.id === "string" && typeof s.url === "string",
    ) : [];
  } catch {
    return [];
  }
}

function write(subs: Subscription[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(subs));
    return true;
  } catch {
    return false;
  }
}

export function loadSubscriptions(): Subscription[] {
  return read();
}

export function addSubscription(url: string, modelIds: string[] = []): Subscription {
  const subs = read();
  const sub: Subscription = {
    id: `wh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    url,
    modelIds,
    createdAt: Date.now(),
  };
  subs.push(sub);
  write(subs);
  return sub;
}

export function removeSubscription(id: string): boolean {
  const subs = read();
  const filtered = subs.filter((s) => s.id !== id);
  if (filtered.length === subs.length) return false;
  write(filtered);
  return true;
}

/**
 * Fire a webhook payload to all matching subscriptions.
 * Best-effort: failures are collected, not thrown.
 */
export async function dispatchAlerts(
  payload: AlertPayload,
  subs: Subscription[] = read(),
): Promise<{ sent: number; failed: number }> {
  const matching = subs.filter(
    (s) => s.modelIds.length === 0 || s.modelIds.includes(payload.modelId),
  );
  if (matching.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  await Promise.allSettled(
    matching.map(async (sub) => {
      try {
        const res = await fetch(sub.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) sent++;
        else failed++;
      } catch {
        failed++;
      }
    }),
  );

  return { sent, failed };
}
