import type { TestResult } from "./types";

export type CatalogChangeType = "added" | "removed" | "free-tier-gone";

export interface CatalogChange {
  type: CatalogChangeType;
  modelId: string;
  displayName: string;
  timestamp: number;
}

/** True for ids this tracker treats as free-tier (Zen free / OpenRouter :free). */
export function isFreeTierId(id: string): boolean {
  if (id.startsWith("openrouter/")) return id.endsWith(":free");
  if (id.startsWith("opencode/")) return id.endsWith("-free") || id.endsWith("/big-pickle");
  return id.endsWith("-free") || id.endsWith(":free");
}

/**
 * Diff two catalog id sets. Models that vanished from a free-tier id are
 * flagged free-tier-gone so the UI can say "free tier revoked" rather than a
 * generic removal.
 */
export function diffCatalog(
  prevIds: Iterable<string>,
  nextIds: Iterable<string>,
  displayNames: Map<string, string> = new Map(),
  now: number = Date.now()
): CatalogChange[] {
  const prev = new Set(prevIds);
  const next = new Set(nextIds);
  const name = (id: string) => displayNames.get(id) || id.split("/").pop() || id;

  const added = [...next].filter((id) => !prev.has(id));
  const removed = [...prev].filter((id) => !next.has(id));

  const changes: CatalogChange[] = [
    ...added.map((modelId) => ({
      type: "added" as const,
      modelId,
      displayName: name(modelId),
      timestamp: now,
    })),
    ...removed.map((modelId) => ({
      type: (isFreeTierId(modelId) ? "free-tier-gone" : "removed") as CatalogChangeType,
      modelId,
      displayName: name(modelId),
      timestamp: now,
    })),
  ];
  return changes;
}

/** Map last test results to a set of ids whose free tier looks revoked. */
export function freeTierGoneIds(
  catalogIds: Iterable<string>,
  results: Map<string, TestResult>
): Set<string> {
  const out = new Set<string>();
  for (const id of catalogIds) {
    if (!isFreeTierId(id)) continue;
    const r = results.get(id);
    if (r?.status === "removed") out.add(id);
  }
  return out;
}
