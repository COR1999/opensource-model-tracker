import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const originalFetch = globalThis.fetch;
const REPO = "COR1999/opensource-model-tracker";

function historyResponse(stamp: string) {
  return new Response(
    JSON.stringify({
      updatedAt: stamp,
      days: { "openrouter/vendor/model:free": [{ timestamp: 1, status: "working", responseTimeMs: 5 }] },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

describe("GET /api/uptime branch preference", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.SNAPSHOT_GITHUB_TOKEN;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("reads the data branch first, because that is where cron commits", async () => {
    const requested: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      // The data branch is where /api/cron commits uptime-history.json.
      if (url.includes(`${REPO}/data/`)) return historyResponse("2026-10-01T15:43:00.000Z");
      if (url.includes(`${REPO}/master/`)) return historyResponse("2026-10-01T12:39:00.000Z");
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const { GET } = await import("@/app/api/uptime/route");
    const res = await GET();
    const body = await res.json();

    // master is checked first in the URL list, so a stale master copy wins and
    // users are shown yesterday's uptime even though cron just refreshed it.
    expect(body.updatedAt).toBe("2026-10-01T15:43:00.000Z");
    expect(requested[0]).toContain(`${REPO}/data/`);
  });

  it("still falls back to master when data has no history yet", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(`${REPO}/data/`)) return new Response("nope", { status: 404 });
      if (url.includes(`${REPO}/master/`)) return historyResponse("2026-10-01T12:39:00.000Z");
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const { GET } = await import("@/app/api/uptime/route");
    const res = await GET();
    const body = await res.json();
    expect(body.updatedAt).toBe("2026-10-01T12:39:00.000Z");
  });

  it("prefers the token-authenticated Contents API for the data branch when a token exists", async () => {
    process.env.SNAPSHOT_GITHUB_TOKEN = "pat";
    const requested: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      if (url.includes("api.github.com") && url.includes("ref=data")) {
        return new Response(
          JSON.stringify({
            content: Buffer.from(
              JSON.stringify({
                updatedAt: "2026-10-01T15:43:00.000Z",
                days: {},
              })
            ).toString("base64"),
            encoding: "base64",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const { GET } = await import("@/app/api/uptime/route");
    const res = await GET();
    const body = await res.json();

    expect(body.updatedAt).toBe("2026-10-01T15:43:00.000Z");
    expect(requested[0]).toContain("ref=data");
    delete process.env.SNAPSHOT_GITHUB_TOKEN;
  });
});
