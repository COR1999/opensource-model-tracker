import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import type { ModelInfo } from "@/lib/types";

vi.mock("@/lib/api-auth", () => ({ isAuthorized: () => true }));

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

const sampleModels: ModelInfo[] = [
  {
    id: "opencode/big-pickle",
    displayName: "Big Pickle",
    provider: "opencode",
    ownedBy: "opencode",
    category: "chat",
  },
];

function jsonRes(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const catalogUrls: string[] = [];

function installFetch(): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/models")) {
      catalogUrls.push(url);
      if (url.includes("opencode.ai")) {
        return jsonRes({ data: [{ id: "big-pickle", owned_by: "opencode" }] });
      }
      if (url.includes("openrouter.ai")) return jsonRes({ data: [] });
      if (url.includes("nvidia.com")) return jsonRes({ data: [] });
    }
    if (url.includes("/chat/completions")) {
      return jsonRes({ choices: [{ message: { content: "hi" } }] });
    }
    return jsonRes({});
  }) as typeof fetch;
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/test-all", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/test-all", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    catalogUrls.length = 0;
    rankModels.mockReset();
    rankModels.mockImplementation(async (models: ModelInfo[]) => ({
      models,
      meta: { asOf: "2026-09-29", sources: ["benchlm"] },
    }));
    installFetch();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("reuses the cached catalog across batches instead of re-fetching every provider", async () => {
    const { POST } = await import("@/app/api/test-all/route");

    // Test All walks the catalog in batches of 10, so a 150-model run issues
    // ~15 of these back to back. Each one used to spend 3 upstream catalog
    // calls plus the benchmark index, which is pure waste.
    const first = await POST(postRequest({ modelIds: sampleModels.map((m) => m.id) }));
    const second = await POST(postRequest({ modelIds: sampleModels.map((m) => m.id) }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const opencodeCatalogCalls = catalogUrls.filter((u) => u.includes("opencode.ai")).length;
    expect(opencodeCatalogCalls).toBe(1);
  });

  it("still tests the requested models and returns their results", async () => {
    const { POST } = await import("@/app/api/test-all/route");
    const res = await POST(postRequest({ modelIds: sampleModels.map((m) => m.id) }));
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].modelId).toBe("opencode/big-pickle");
  });

  it("rejects an oversized batch without spending catalog calls", async () => {
    const { POST } = await import("@/app/api/test-all/route");
    const res = await POST(
      postRequest({ modelIds: Array.from({ length: 26 }, (_, i) => `opencode/m${i}-free`) })
    );
    expect(res.status).toBe(400);
    expect(catalogUrls.length).toBe(0);
  });
});
