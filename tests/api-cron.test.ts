import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TestResult } from "@/lib/types";

const originalFetch = globalThis.fetch;
const CRON_SECRET = "test-cron-secret";

function jsonRes(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Ids must classify as chat/code/vision or the cron's TESTABLE_CATEGORIES
// filter drops them before the window is ever built. Provider listings carry
// bare upstream ids — fetchOpenRouterModels prepends the namespace itself.
function freeModel(n: number) {
  return { id: `vendor/free-code-${n}:free`, owned_by: "vendor" };
}

function paidModel(n: number) {
  return { id: `vendor/paid-code-${n}`, owned_by: "vendor" };
}

function cronRequest(): Request {
  return new Request("http://localhost/api/cron", {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
}

describe("GET /api/cron model window", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.CRON_SECRET = CRON_SECRET;
    // No snapshot token: keeps the test off GitHub entirely.
    delete process.env.SNAPSHOT_GITHUB_TOKEN;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.CRON_SECRET;
  });

  it("fills the 25-model window with free-tier models before paid NVIDIA ones", async () => {
    const openrouter = { data: Array.from({ length: 30 }, (_, i) => freeModel(i)) };
    const nvidia = { data: Array.from({ length: 30 }, (_, i) => paidModel(i)) };

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("openrouter.ai/api/v1/models")) return jsonRes(openrouter);
      if (url.includes("opencode.ai")) return jsonRes({ data: [] });
      if (url.includes("nvidia.com")) return jsonRes(nvidia);
      if (url.includes("/chat/completions")) {
        return jsonRes({ choices: [{ message: { content: "hi" } }] });
      }
      // BenchLM / OpenRouter benchmark enrichment: unavailable in this test.
      return jsonRes({ error: "unavailable" }, 503);
    }) as typeof fetch;

    const { GET } = await import("@/app/api/cron/route");
    const res = await GET(cronRequest());
    const body = await res.json();

    const results = body.results as TestResult[];
    const free = results.filter((r) => r.modelId.startsWith("openrouter/"));
    const paid = results.filter((r) => r.provider === "nvidia");

    // The tracker's uptime history feeds free-model sparklines. When paid NVIDIA
    // models outscore free ones on BenchLM, a benchmarkScore sort pushed every
    // free model out of the window, so the shared history was ~55% paid.
    expect(body.scopedTotal).toBe(25);
    expect(body.testedTotal).toBe(25);
    expect(free).toHaveLength(25);
    expect(paid).toHaveLength(0);
  });

  it("still falls back to paid models when fewer free models are testable", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("openrouter.ai/api/v1/models")) {
        return jsonRes({ data: [freeModel(0), freeModel(1)] });
      }
      if (url.includes("opencode.ai")) return jsonRes({ data: [] });
      if (url.includes("nvidia.com")) {
        return jsonRes({ data: Array.from({ length: 10 }, (_, i) => paidModel(i)) });
      }
      if (url.includes("/chat/completions")) {
        return jsonRes({ choices: [{ message: { content: "hi" } }] });
      }
      return jsonRes({ error: "unavailable" }, 503);
    }) as typeof fetch;

    const { GET } = await import("@/app/api/cron/route");
    const res = await GET(cronRequest());
    const body = await res.json();
    const results = body.results as TestResult[];

    expect(results.filter((r) => r.modelId.startsWith("openrouter/"))).toHaveLength(2);
    expect(results.filter((r) => r.provider === "nvidia")).toHaveLength(10);
    expect(body.testedTotal).toBe(12);
  });

  it("never spends a slot on an OpenCode app-only model", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      // Real data, not an empty list: providers.ts falls back to the curated
      // lineup on an empty catalog, which would smuggle in 16 unrelated models.
      if (url.includes("openrouter.ai/api/v1/models")) return jsonRes({ data: [freeModel(0)] });
      if (url.includes("opencode.ai")) {
        return jsonRes({
          data: [
            { id: "big-pickle", owned_by: "opencode" },
            { id: "space-bunny-free", owned_by: "opencode" },
          ],
        });
      }
      if (url.includes("nvidia.com")) return jsonRes({ data: [paidModel(0)] });
      if (url.includes("/chat/completions")) {
        return jsonRes({ choices: [{ message: { content: "hi" } }] });
      }
      return jsonRes({ error: "unavailable" }, 503);
    }) as typeof fetch;

    const { GET } = await import("@/app/api/cron/route");
    const res = await GET(cronRequest());
    const body = await res.json();
    const results = body.results as TestResult[];

    expect(results.map((r) => r.modelId).sort()).toEqual([
      "openrouter/vendor/free-code-0:free",
      "vendor/paid-code-0",
    ]);  });

  it("skips models the shared history already recorded as removed", async () => {
    // NVIDIA keeps ~15% of its catalog listed while the inference endpoint
    // 404s them. Re-probing those daily burns scarce cron slots confirming
    // what is already known.
    const day = 24 * 60 * 60 * 1000;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("uptime-history.json")) {
        return jsonRes({
          updatedAt: new Date().toISOString(),
          days: {
            "vendor/paid-code-0": [
              { timestamp: Date.now() - day, status: "removed", responseTimeMs: 100 },
            ],
          },
        });
      }
      if (url.includes("openrouter.ai/api/v1/models")) return jsonRes({ data: [freeModel(0)] });
      if (url.includes("opencode.ai")) return jsonRes({ data: [] });
      if (url.includes("nvidia.com")) {
        return jsonRes({ data: [paidModel(0), paidModel(1)] });
      }
      if (url.includes("/chat/completions")) {
        return jsonRes({ choices: [{ message: { content: "hi" } }] });
      }
      return jsonRes({ error: "unavailable" }, 503);
    }) as typeof fetch;

    const { GET } = await import("@/app/api/cron/route");
    const res = await GET(cronRequest());
    const body = await res.json();
    const results = body.results as TestResult[];

    expect(results.map((r) => r.modelId)).not.toContain("vendor/paid-code-0");
    expect(results.map((r) => r.modelId)).toContain("vendor/paid-code-1");
    expect(body.skippedRemoved).toBe(1);
  });

  it("still re-probes a removed model once its history has aged past the grace window", async () => {
    // The 7-day retention drops old records, so a skipped model falls out of
    // the history and gets retested. That is what catches a model coming back.
    const old = 9 * 24 * 60 * 60 * 1000;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("uptime-history.json")) {
        return jsonRes({
          updatedAt: new Date().toISOString(),
          days: {
            "vendor/paid-code-0": [
              { timestamp: Date.now() - old, status: "removed", responseTimeMs: 100 },
            ],
          },
        });
      }
      if (url.includes("openrouter.ai/api/v1/models")) return jsonRes({ data: [freeModel(0)] });
      if (url.includes("opencode.ai")) return jsonRes({ data: [{ id: "big-pickle" }] });
      if (url.includes("nvidia.com")) return jsonRes({ data: [paidModel(0)] });
      if (url.includes("/chat/completions")) {
        return jsonRes({ choices: [{ message: { content: "hi" } }] });
      }
      return jsonRes({ error: "unavailable" }, 503);
    }) as typeof fetch;

    const { GET } = await import("@/app/api/cron/route");
    const res = await GET(cronRequest());
    const body = await res.json();

    expect(body.skippedRemoved).toBe(0);
    expect((body.results as TestResult[]).map((r) => r.modelId)).toContain("vendor/paid-code-0");
  });

  it("probes normally when no shared history is readable", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("uptime-history.json")) return jsonRes({ error: "gone" }, 503);
      if (url.includes("openrouter.ai/api/v1/models")) return jsonRes({ data: [freeModel(0)] });
      // A real listing, not an empty one: providers.ts falls back to the curated
      // lineup on an empty catalog, which would smuggle in unrelated models.
      if (url.includes("opencode.ai")) return jsonRes({ data: [{ id: "big-pickle" }] });
      if (url.includes("nvidia.com")) return jsonRes({ data: [paidModel(0), paidModel(1)] });
      if (url.includes("/chat/completions")) {
        return jsonRes({ choices: [{ message: { content: "hi" } }] });
      }
      return jsonRes({ error: "unavailable" }, 503);
    }) as typeof fetch;

    const { GET } = await import("@/app/api/cron/route");
    const res = await GET(cronRequest());
    const body = await res.json();

    // 1 free + 2 paid; big-pickle is app-only so it never enters the window.
    expect(body.skippedRemoved).toBe(0);
    expect(body.testedTotal).toBe(3);
  });

  it("fails closed with 503 when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    globalThis.fetch = vi.fn(async () => jsonRes({})) as typeof fetch;

    const { GET } = await import("@/app/api/cron/route");
    const res = await GET(new Request("http://localhost/api/cron"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.preflight.cronSecretConfigured).toBe(false);
  });
});
