import type { TestResult, UptimeRecord } from "./models";
import type { Theme } from "./display";

export const STORAGE_KEYS = {
  KNOWN_MODELS: "model-tracker-known-models",
  UPTIME: "model-tracker-uptime",
  LAST_RESULTS: "model-tracker-last-results",
  CHANGELOG: "model-tracker-changelog",
  THEME: "model-tracker-theme",
  HIDE_ENDPOINTS: "model-tracker-hide-endpoints",
  DENSITY: "model-tracker-density",
} as const;

export interface ChangelogEntry {
  timestamp: number;
  type: "added" | "removed";
  modelId: string;
  displayName: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const UPTIME_RETENTION_DAYS = 7;
export const CHANGELOG_RETENTION_DAYS = 30;

// Writes are best-effort. localStorage throws on quota exhaustion and in
// Safari private mode, and an unguarded write would abort a test run midway;
// losing a cached snapshot is always preferable to losing the run.
function write(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export function loadKnownModels(): Set<string> {
  const ids = parse<unknown>(read(STORAGE_KEYS.KNOWN_MODELS), []);
  return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []);
}

export function saveKnownModels(ids: string[]): boolean {
  return write(STORAGE_KEYS.KNOWN_MODELS, JSON.stringify(ids));
}

export function loadChangelog(): ChangelogEntry[] {
  const entries = parse<unknown>(read(STORAGE_KEYS.CHANGELOG), []);
  if (!Array.isArray(entries)) return [];
  return entries.filter(
    (e): e is ChangelogEntry =>
      !!e &&
      typeof e === "object" &&
      typeof (e as ChangelogEntry).timestamp === "number" &&
      typeof (e as ChangelogEntry).modelId === "string"
  );
}

export function saveChangelog(entries: ChangelogEntry[]): boolean {
  const cutoff = Date.now() - CHANGELOG_RETENTION_DAYS * DAY_MS;
  const trimmed = entries.filter((e) => e.timestamp > cutoff);
  return write(STORAGE_KEYS.CHANGELOG, JSON.stringify(trimmed));
}

export function loadUptime(): Record<string, UptimeRecord[]> {
  const data = parse<Record<string, UptimeRecord[]>>(read(STORAGE_KEYS.UPTIME), {});
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const out: Record<string, UptimeRecord[]> = {};
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) out[k] = v.filter((r) => r && typeof r.timestamp === "number");
  }
  return out;
}

export function saveUptime(data: Record<string, UptimeRecord[]>): boolean {
  const cutoff = Date.now() - UPTIME_RETENTION_DAYS * DAY_MS;
  const trimmed: Record<string, UptimeRecord[]> = {};
  for (const [k, v] of Object.entries(data)) {
    const kept = v.filter((r) => r.timestamp > cutoff);
    // Drop keys that retention emptied so the payload cannot grow without
    // bound as models come and go from the catalog.
    if (kept.length > 0) trimmed[k] = kept;
  }
  return write(STORAGE_KEYS.UPTIME, JSON.stringify(trimmed));
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
  const arr = parse<unknown>(read(STORAGE_KEYS.LAST_RESULTS), []);
  if (!Array.isArray(arr)) return new Map();
  return new Map(
    arr
      .filter((r): r is TestResult => !!r && typeof r === "object" && typeof r.modelId === "string")
      .map((r) => [r.modelId, r])
  );
}

export function saveLastResults(results: Map<string, TestResult>): boolean {
  return write(STORAGE_KEYS.LAST_RESULTS, JSON.stringify([...results.values()]));
}

// Default true: embeddings/TTS/image/classifier endpoints are noise unless you
// specifically want them; opting out persists.
export function loadHideEndpoints(): boolean {
  return read(STORAGE_KEYS.HIDE_ENDPOINTS) !== "false";
}

export function saveHideEndpoints(hide: boolean): boolean {
  return write(STORAGE_KEYS.HIDE_ENDPOINTS, hide ? "true" : "false");
}

export function loadTheme(): Theme {
  return read(STORAGE_KEYS.THEME) === "light" ? "light" : "dark";
}

export function saveTheme(theme: Theme): boolean {
  return write(STORAGE_KEYS.THEME, theme);
}

export type Density = "comfortable" | "compact";

export function loadDensity(): Density {
  return read(STORAGE_KEYS.DENSITY) === "compact" ? "compact" : "comfortable";
}

export function saveDensity(density: Density): boolean {
  return write(STORAGE_KEYS.DENSITY, density);
}
