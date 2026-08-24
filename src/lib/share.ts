import type { TestResult } from "./models";

export interface Snapshot {
  ts: number | null;
  results: TestResult[];
  omitted: number;
  valid: boolean;
}

// Shared links carry the whole payload in the URL path, so size is bounded at
// the source: error strings are the unbounded dimension (provider messages can
// run to kilobytes) and very large sweeps multiply every entry. `omitted`
// records how many entries were cut so readers see a partial snapshot as
// partial rather than silently truncated.
const MAX_RESULTS = 150;
const MAX_ERROR_CHARS = 140;

export function encodeSnapshot(data: { ts: number; results: TestResult[] }): string {
  const results = data.results
    .slice(0, MAX_RESULTS)
    .map((r) =>
      r.error && r.error.length > MAX_ERROR_CHARS ? { ...r, error: r.error.slice(0, MAX_ERROR_CHARS) } : r,
    );
  const omitted = Math.max(0, data.results.length - results.length);
  const bytes = new TextEncoder().encode(JSON.stringify({ ...data, results, omitted }));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Tolerant inverse of encodeSnapshot. Corrupted or foreign input yields a
// snapshot flagged invalid rather than throwing, so a bad link renders the
// friendly invalid-state instead of crashing the page; a well-formed but
// empty payload stays valid so it can be shown as an empty result set.
export function decodeSnapshot(encoded: string): Snapshot {
  try {
    let b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    b64 += "=".repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || typeof data !== "object" || !Array.isArray(data.results)) {
      return { ts: null, results: [], omitted: 0, valid: false };
    }
    return {
      ts: typeof data.ts === "number" ? data.ts : null,
      results: data.results as TestResult[],
      omitted: typeof data.omitted === "number" ? data.omitted : 0,
      valid: true,
    };
  } catch {
    return { ts: null, results: [], omitted: 0, valid: false };
  }
}
