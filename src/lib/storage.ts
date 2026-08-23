import type { TestResult, UptimeRecord } from "./models";
import type { Theme } from "./display";

export const STORAGE_KEYS = {
  KNOWN_MODELS: "model-tracker-known-models",
  UPTIME: "model-tracker-uptime",
  LAST_RESULTS: "model-tracker-last-results",
  CHANGELOG: "model-tracker-changelog",
  THEME: "model-tracker-theme",
  HIDE_ENDPOINTS: "model-tracker-hide-endpoints",
} as const;

export interface ChangelogEntry {
  timestamp: number;
  type: "added" | "removed";
  modelId: string;
  displayName: string;
}

export function loadKnownModels(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.KNOWN_MODELS);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function saveKnownModels(ids: string[]) {
  localStorage.setItem(STORAGE_KEYS.KNOWN_MODELS, JSON.stringify(ids));
}

export function loadChangelog(): ChangelogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CHANGELOG);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveChangelog(entries: ChangelogEntry[]) {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const trimmed = entries.filter((e) => e.timestamp > thirtyDaysAgo);
  localStorage.setItem(STORAGE_KEYS.CHANGELOG, JSON.stringify(trimmed));
}

export function loadUptime(): Record<string, UptimeRecord[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.UPTIME);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveUptime(data: Record<string, UptimeRecord[]>) {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const trimmed: Record<string, UptimeRecord[]> = {};
  for (const [k, v] of Object.entries(data)) {
    trimmed[k] = v.filter((r) => r.timestamp > sevenDaysAgo);
  }
  localStorage.setItem(STORAGE_KEYS.UPTIME, JSON.stringify(trimmed));
}

export function appendUptime(
  prev: Record<string, UptimeRecord[]>,
  modelId: string,
  result: TestResult
): Record<string, UptimeRecord[]> {
  const next = { ...prev };
  const existing = next[modelId] || [];
  next[modelId] = [
    ...existing,
    { timestamp: Date.now(), status: result.status, responseTimeMs: result.responseTimeMs },
  ];
  return next;
}

export function loadLastResults(): Map<string, TestResult> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LAST_RESULTS);
    if (!raw) return new Map();
    const arr: TestResult[] = JSON.parse(raw);
    return new Map(arr.map((r) => [r.modelId, r]));
  } catch {
    return new Map();
  }
}

export function saveLastResults(results: Map<string, TestResult>) {
  localStorage.setItem(STORAGE_KEYS.LAST_RESULTS, JSON.stringify([...results.values()]));
}

// Default true: embeddings/TTS/image/classifier endpoints are noise unless you
// specifically want them; opting out persists.
export function loadHideEndpoints(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.HIDE_ENDPOINTS) !== "false";
  } catch {
    return true;
  }
}

export function loadTheme(): Theme {
  try {
    return (localStorage.getItem(STORAGE_KEYS.THEME) as Theme) || "dark";
  } catch {
    return "dark";
  }
}
