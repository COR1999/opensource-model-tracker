import { describe, it, expect, vi } from "vitest";
import {
  isValidWebhookUrl,
  parseSubscriptions,
  matchingSubscriptions,
  dispatchAlerts,
  type AlertPayload,
  type Subscription,
} from "@/lib/subscriptions";
import { computeDailyStats } from "@/components/ResponseTrendChart";
import type { UptimeRecord } from "@/lib/types";

describe("subscriptions", () => {
  it("validates http(s) webhook URLs only", () => {
    expect(isValidWebhookUrl("https://hooks.example.com/x")).toBe(true);
    expect(isValidWebhookUrl("http://localhost:3000/hook")).toBe(true);
    expect(isValidWebhookUrl("javascript:alert(1)")).toBe(false);
    expect(isValidWebhookUrl("not-a-url")).toBe(false);
  });

  it("parses and filters subscription lists", () => {
    const parsed = parseSubscriptions([
      { id: "a", url: "https://ok.example.com", modelIds: [], createdAt: 1 },
      { id: "b", url: "ftp://bad", modelIds: [], createdAt: 1 },
      { id: "c", url: "https://ok2.example.com", modelIds: ["m1"], createdAt: 1 },
      null,
      "nope",
    ]);
    expect(parsed.map((s) => s.id)).toEqual(["a", "c"]);
  });

  it("matches subscriptions by model id filter", () => {
    const payload: AlertPayload = {
      type: "new_model",
      timestamp: 1,
      modelId: "opencode/big-pickle",
      displayName: "Big Pickle",
      provider: "opencode",
    };
    const all: Subscription = {
      id: "1",
      url: "https://a.example.com",
      modelIds: [],
      createdAt: 1,
    };
    const other: Subscription = {
      id: "2",
      url: "https://b.example.com",
      modelIds: ["openrouter/x"],
      createdAt: 1,
    };
    const mine: Subscription = {
      id: "3",
      url: "https://c.example.com",
      modelIds: ["opencode/big-pickle"],
      createdAt: 1,
    };
    expect(matchingSubscriptions(payload, [all, other, mine]).map((s) => s.id)).toEqual([
      "1",
      "3",
    ]);
  });

  it("dispatches best-effort and counts failures", async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return new Response("ok", { status: 200 });
      throw new Error("network");
    }) as typeof fetch;

    try {
      const payload: AlertPayload = {
        type: "removed_model",
        timestamp: 1,
        modelId: "x",
        displayName: "X",
        provider: "nvidia",
      };
      const result = await dispatchAlerts(payload, [
        { id: "1", url: "https://a.example.com", modelIds: [], createdAt: 1 },
        { id: "2", url: "https://b.example.com", modelIds: [], createdAt: 1 },
      ]);
      expect(result).toEqual({ sent: 1, failed: 1 });
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("computeDailyStats", () => {
  it("buckets positive response times into the last 7 days", () => {
    const now = Date.now();
    const day = 86_400_000;
    const records: UptimeRecord[] = [
      { timestamp: now, status: "working", responseTimeMs: 1000 },
      { timestamp: now - day, status: "working", responseTimeMs: 2000 },
      { timestamp: now - day, status: "timeout", responseTimeMs: 0 },
      { timestamp: now - 30 * day, status: "working", responseTimeMs: 999 },
    ];
    const stats = computeDailyStats(records);
    expect(stats).toHaveLength(7);
    expect(stats[6]?.avgMs).toBe(1000);
    expect(stats[5]?.avgMs).toBe(2000);
    expect(stats[0]).toBeNull();
  });
});
