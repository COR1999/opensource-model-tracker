import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ModelInfo } from "@/lib/types";

const rankModels = vi.fn();

vi.mock("@/lib/rankings", () => ({
  rankModels: (...args: unknown[]) => rankModels(...args),
  getBenchmarkIndex: vi.fn(async () => ({
    byKey: new Map(),
    meta: { asOf: null, sources: [] as string[] },
  })),
  rankingKey: vi.fn((s: string) => s),
  lookupBenchmark: vi.fn(() => undefined),
  annotateAndSortModels: vi.fn((models: ModelInfo[]) => models),
}));

function jsonRes(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installProviderFetch(modelsByHost: Record<string, unknown>): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("opencode.ai")) return jsonRes(modelsByHost.opencode ?? { data: [] });
    if (url.includes("openrouter.ai")) return jsonRes(modelsByHost.openrouter ?? { data: [] });
    if (url.includes("nvidia.com")) return jsonRes(modelsByHost.nvidia ?? { data: [] });
    return jsonRes({});
  }) as typeof fetch;
}

describe("GET /api/models", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    rankModels.mockReset();
    rankModels.mockImplementation(async (models: ModelInfo[]) => ({
      models,
      meta: { asOf: "2026-09-29", sources: ["benchlm"] },
    }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns models, errors and rankingMeta", async () => {
    installProviderFetch({
      opencode: { data: [{ id: "big-pickle", owned_by: "opencode" }] },
      openrouter: { data: [] },
      nvidia: { data: [] },
    });

    const { GET } = await import("@/app/api/models/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.models.some((m: ModelInfo) => m.id === "opencode/big-pickle")).toBe(true);
    expect(body.rankingMeta.sources).toEqual(["benchlm"]);
    expect(body.cached).toBe(false);
  });

  it("still returns curated fallback models when every provider API fails", async () => {
    // providers.ts falls back to curated lists on network/HTTP failure, so the
    // catalog is rarely empty. The route 502 path is for a true empty models
    // array (e.g. fallbacks removed); this documents the real failure mode.
    globalThis.fetch = vi.fn(async () => {
      throw new Error("all providers down");
    }) as typeof fetch;

    const { GET } = await import("@/app/api/models/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.models)).toBe(true);
    expect(body.models.length).toBeGreaterThan(0);
  });

  it("serves a cached hit on the second request within TTL", async () => {
    installProviderFetch({
      opencode: { data: [{ id: "big-pickle", owned_by: "opencode" }] },
      openrouter: { data: [] },
      nvidia: { data: [] },
    });

    const { GET } = await import("@/app/api/models/route");
    const first = await GET();
    expect(first.headers.get("X-Cache")).toBe("MISS");
    const second = await GET();
    expect(second.headers.get("X-Cache")).toBe("HIT");
  });
});
