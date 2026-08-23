import type { TestResult } from "./models";

export interface Snapshot {
  ts: number | null;
  results: TestResult[];
}

// Snapshot payloads ride in the URL path, so they are base64url-encoded
// (RFC 4648 §5) to stay route-safe without server round-trips.
export function encodeSnapshot(data: { ts: number; results: TestResult[] }): string {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Tolerant inverse of encodeSnapshot; corrupted or foreign input yields an
// empty snapshot rather than throwing, so a bad link renders the friendly
// invalid-state instead of crashing the page.
export function decodeSnapshot(encoded: string): Snapshot {
  try {
    let b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    b64 += "=".repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    return {
      ts: typeof data?.ts === "number" ? data.ts : null,
      results: Array.isArray(data?.results) ? data.results : [],
    };
  } catch {
    return { ts: null, results: [] };
  }
}
