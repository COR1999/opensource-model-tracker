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

/** Statuses worth a webhook: not working/slow noise. App-only is informational. */
export const INTERESTING_STATUSES: ReadonlySet<TestResult["status"]> = new Set([
  "timeout",
  "rate-limited",
  "error",
  "removed",
]);

const STORAGE_KEY = "model-tracker-subscriptions";

export function isValidWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseSubscriptions(raw: unknown): Subscription[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is Subscription =>
      !!s &&
      typeof s === "object" &&
      typeof (s as Subscription).id === "string" &&
      typeof (s as Subscription).url === "string" &&
      isValidWebhookUrl((s as Subscription).url)
  );
}

export function readSubscriptions(): Subscription[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return parseSubscriptions(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function writeSubscriptions(subs: Subscription[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(subs));
    return true;
  } catch {
    return false;
  }
}

export function loadSubscriptions(): Subscription[] {
  return readSubscriptions();
}

export function addSubscription(url: string, modelIds: string[] = []): Subscription {
  const subs = readSubscriptions();
  const sub: Subscription = {
    id: `wh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    url,
    modelIds,
    createdAt: Date.now(),
  };
  subs.push(sub);
  writeSubscriptions(subs);
  return sub;
}

export function removeSubscription(id: string): boolean {
  const subs = readSubscriptions();
  const filtered = subs.filter((s) => s.id !== id);
  if (filtered.length === subs.length) return false;
  writeSubscriptions(filtered);
  return true;
}

/** Pure filter: which subscriptions should receive this payload. */
export function matchingSubscriptions(
  payload: AlertPayload,
  subs: Subscription[]
): Subscription[] {
  return subs.filter((s) => s.modelIds.length === 0 || s.modelIds.includes(payload.modelId));
}

/**
 * Diff two result maps and produce status_change alerts when a model enters
 * an interesting status (timeout / rate-limited / error / removed).
 */
export function statusChangeAlerts(
  prev: Map<string, TestResult>,
  next: Map<string, TestResult>,
  displayNames: Map<string, string> = new Map(),
  now: number = Date.now()
): AlertPayload[] {
  const alerts: AlertPayload[] = [];
  for (const [modelId, current] of next) {
    const previous = prev.get(modelId);
    if (!previous) continue;
    if (previous.status === current.status) continue;
    if (!INTERESTING_STATUSES.has(current.status)) continue;
    alerts.push({
      type: "status_change",
      timestamp: now,
      modelId,
      displayName: displayNames.get(modelId) || modelId.split("/").pop() || modelId,
      provider: current.provider,
      previousStatus: previous.status,
      currentStatus: current.status,
    });
  }
  return alerts;
}

/**
 * Fire a webhook payload to all matching subscriptions.
 * Best-effort: failures are collected, not thrown.
 */
export async function dispatchAlerts(
  payload: AlertPayload,
  subs: Subscription[] = readSubscriptions()
): Promise<{ sent: number; failed: number }> {
  const matching = matchingSubscriptions(payload, subs);
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
    })
  );

  return { sent, failed };
}
