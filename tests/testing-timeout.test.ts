import { describe, it, expect } from "vitest";
import {
  isFreeTierModel,
  testTimeoutMs,
  statusFromHttpFailure,
  FREE_TEST_TIMEOUT_MS,
  PAID_TEST_TIMEOUT_MS,
  SLOW_THRESHOLD_MS,
} from "@/lib/testing";
import { FALLBACK_OPENCODE_MODELS } from "@/lib/curated";
import { statusLabel, statusColor, statusDot } from "@/lib/display";
import { decodeSnapshot, encodeSnapshot } from "@/lib/share";
import type { TestResult } from "@/lib/types";

describe("isFreeTierModel / testTimeoutMs", () => {
  it("gives OpenCode free ids and Big Pickle the longer free budget", () => {
    expect(isFreeTierModel({ id: "opencode/big-pickle", provider: "opencode" })).toBe(true);
    expect(isFreeTierModel({ id: "opencode/space-bunny-free", provider: "opencode" })).toBe(true);
    expect(isFreeTierModel({ id: "opencode/mimo-v2.5-free", provider: "opencode" })).toBe(true);
    expect(testTimeoutMs({ id: "opencode/big-pickle", provider: "opencode" })).toBe(
      FREE_TEST_TIMEOUT_MS
    );
  });

  it("gives OpenRouter :free variants the longer free budget", () => {
    expect(
      isFreeTierModel({ id: "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free", provider: "openrouter" })
    ).toBe(true);
    expect(
      testTimeoutMs({
        id: "openrouter/z-ai/glm-5.2:free",
        provider: "openrouter",
      })
    ).toBe(FREE_TEST_TIMEOUT_MS);
  });

  it("keeps paid NVIDIA models on the short budget", () => {
    expect(isFreeTierModel({ id: "meta/llama-3.3-70b-instruct", provider: "nvidia" })).toBe(false);
    expect(isFreeTierModel({ id: "nvidia/nemotron-3-ultra-550b-a55b", provider: "nvidia" })).toBe(
      false
    );
    expect(testTimeoutMs({ id: "meta/llama-3.3-70b-instruct", provider: "nvidia" })).toBe(
      PAID_TEST_TIMEOUT_MS
    );
    expect(FREE_TEST_TIMEOUT_MS).toBeGreaterThan(PAID_TEST_TIMEOUT_MS);
    expect(PAID_TEST_TIMEOUT_MS).toBe(8000);
    expect(FREE_TEST_TIMEOUT_MS).toBeGreaterThanOrEqual(15000);
    expect(SLOW_THRESHOLD_MS).toBe(5000);
  });
});

describe("statusFromHttpFailure", () => {
  it("maps 429 to rate-limited, not a generic error", () => {
    expect(statusFromHttpFailure(429)).toBe("rate-limited");
  });

  it("still treats 404/410 as removed", () => {
    expect(statusFromHttpFailure(404)).toBe("removed");
    expect(statusFromHttpFailure(410)).toBe("removed");
  });

  it("keeps tool-choice 4xx as working", () => {
    expect(statusFromHttpFailure(400, "tool choice is not supported")).toBe("working");
  });

  it("maps other failures to error", () => {
    expect(statusFromHttpFailure(500, "boom")).toBe("error");
    expect(statusFromHttpFailure(400, "bad request")).toBe("error");
  });
});

describe("testModel rate-limit retry", () => {
  it("retries once after 429 then returns the second probe result", async () => {
    const { testModel } = await import("@/lib/testing");
    const calls: number[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? init.body : "";
      calls.push(calls.length + 1);
      // First call is the main probe → 429. Later calls (retry + tools) succeed.
      if (calls.length === 1) {
        return new Response("rate limited", { status: 429 });
      }
      void body;
      return new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const result = await testModel("", {
        id: "opencode/big-pickle",
        displayName: "Big Pickle",
        provider: "opencode",
        ownedBy: "opencode",
        category: "chat",
      });
      // 429 + successful retry + tools probe
      expect(calls.length).toBe(3);
      expect(result.status).toBe("working");
      expect(result.httpCode).toBe(200);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("does not retry when the first probe succeeds", async () => {
    const { testModel } = await import("@/lib/testing");
    let calls = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const result = await testModel("", {
        id: "opencode/big-pickle",
        displayName: "Big Pickle",
        provider: "opencode",
        ownedBy: "opencode",
        category: "chat",
      });
      // main probe + tools probe only — no rate-limit retry
      expect(calls).toBe(2);
      expect(result.status).toBe("working");
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("display + share + curated free lineup", () => {
  it("labels rate-limited distinctly", () => {
    expect(statusLabel("rate-limited")).toBe("Rate limited");
    expect(statusColor("rate-limited", "dark")).not.toBe(statusColor("error", "dark"));
    expect(statusDot("rate-limited")).not.toBe(statusDot("error"));
  });

  it("round-trips rate-limited through share snapshots", () => {
    const result: TestResult = {
      modelId: "opencode/big-pickle",
      provider: "opencode",
      status: "rate-limited",
      httpCode: 429,
      responseTimeMs: 120,
      supportsFunctionCalling: false,
      error: "Provider rate limit",
    };
    const decoded = decodeSnapshot(encodeSnapshot({ ts: 1, results: [result] }));
    expect(decoded.valid).toBe(true);
    expect(decoded.results[0]?.status).toBe("rate-limited");
  });

  it("includes the current Zen free lineup in the fallback catalog", () => {
    const ids = FALLBACK_OPENCODE_MODELS.map((m) => m.id);
    for (const id of [
      "opencode/big-pickle",
      "opencode/space-bunny-free",
      "opencode/longcat-2.5-preview-free",
      "opencode/muse-spark-1.3-contributor-free",
      "opencode/mimo-v2.6-flash-free",
      "opencode/ling-3.0-flash-fin-free",
    ]) {
      expect(ids).toContain(id);
    }
  });
});
