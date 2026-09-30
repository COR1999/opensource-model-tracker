import { describe, it, expect } from "vitest";
import {
  parseRemoteUptime,
  mergeUptimeHistory,
  buildRemoteUptimeHistory,
  EMPTY_REMOTE_UPTIME,
} from "@/lib/uptime-history";
import { recommendModel, bestForChips } from "@/lib/picks";
import { diffCatalog, isFreeTierId, freeTierGoneIds } from "@/lib/catalog-changes";
import { shouldRetryRateLimit, RATE_LIMIT_MAX_ATTEMPTS } from "@/lib/rate-limit";
import type { ModelInfo, TestResult, UptimeRecord } from "@/lib/types";

function model(partial: Partial<ModelInfo> & { id: string }): ModelInfo {
  return {
    displayName: partial.id,
    provider: "openrouter",
    ownedBy: "x",
    category: "chat",
    ...partial,
  };
}

function result(partial: Partial<TestResult> & { modelId: string }): TestResult {
  return {
    provider: "openrouter",
    status: "working",
    httpCode: 200,
    responseTimeMs: 400,
    supportsFunctionCalling: false,
    ...partial,
  };
}

describe("uptime history", () => {
  it("parses valid remote history and rejects junk", () => {
    const ok = parseRemoteUptime({
      updatedAt: "2026-09-30T00:00:00.000Z",
      days: { "opencode/big-pickle": [{ timestamp: 1, status: "working", responseTimeMs: 10 }] },
    });
    expect(ok.updatedAt).toBe("2026-09-30T00:00:00.000Z");
    expect(ok.days["opencode/big-pickle"]).toHaveLength(1);
    expect(parseRemoteUptime(null)).toEqual(EMPTY_REMOTE_UPTIME);
    expect(parseRemoteUptime({ days: [] })).toEqual(EMPTY_REMOTE_UPTIME);
  });

  it("merges remote into local without duplicating identical records", () => {
    const rec: UptimeRecord = { timestamp: 100, status: "working", responseTimeMs: 5 };
    const local = { m1: [rec] };
    const remote = parseRemoteUptime({ days: { m1: [rec], m2: [{ ...rec, timestamp: 200 }] } });
    const merged = mergeUptimeHistory(local, remote);
    expect(merged.m1).toHaveLength(1);
    expect(merged.m2).toHaveLength(1);
  });

  it("rolls cron results into a 7-day remote history", () => {
    const now = Date.UTC(2026, 8, 30);
    const prev = parseRemoteUptime({
      days: { m1: [{ timestamp: now - 3 * 86400000, status: "working", responseTimeMs: 1 }] },
    });
    const next = buildRemoteUptimeHistory(
      prev,
      [result({ modelId: "m1", responseTimeMs: 2 }), result({ modelId: "m2", status: "error" })],
      now
    );
    expect(next.days.m1).toHaveLength(2);
    expect(next.days.m2).toHaveLength(1);
    expect(next.updatedAt).toBeTruthy();
  });
});

describe("recommendModel", () => {
  it("prefers higher BenchLM score among working models", () => {
    const models = [
      model({ id: "a", benchmarkScore: 40 }),
      model({ id: "b", benchmarkScore: 70 }),
    ];
    const results = new Map([
      ["a", result({ modelId: "a" })],
      ["b", result({ modelId: "b" })],
    ]);
    expect(recommendModel(models, results)?.id).toBe("b");
  });

  it("skips error models when a working alternative exists", () => {
    const models = [
      model({ id: "dead", benchmarkScore: 90 }),
      model({ id: "ok", benchmarkScore: 50 }),
    ];
    const results = new Map([
      ["dead", result({ modelId: "dead", status: "error" })],
      ["ok", result({ modelId: "ok", status: "working" })],
    ]);
    expect(recommendModel(models, results)?.id).toBe("ok");
  });

  it("returns null for empty catalog", () => {
    expect(recommendModel([], new Map())).toBeNull();
  });
});

describe("bestForChips", () => {
  it("labels strong coding and long context", () => {
    const chips = bestForChips(
      model({ id: "x", codingScore: 70, contextLength: 1_000_000 }),
      result({ modelId: "x", responseTimeMs: 500 })
    );
    const labels = chips.map((c) => c.label);
    expect(labels).toContain("code");
    expect(labels).toContain("long ctx");
    expect(labels).toContain("fast");
  });

  it("marks unscored models as unranked", () => {
    const chips = bestForChips(model({ id: "big-pickle" }));
    expect(chips.map((c) => c.label)).toContain("unranked");
  });
});

describe("catalog changes", () => {
  it("flags vanished free-tier ids as free-tier-gone", () => {
    const changes = diffCatalog(
      ["opencode/deepseek-v4-flash-free", "meta/llama-3.3-70b-instruct"],
      ["meta/llama-3.3-70b-instruct"],
      new Map([["opencode/deepseek-v4-flash-free", "DeepSeek V4 Flash"]])
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe("free-tier-gone");
    expect(changes[0].displayName).toBe("DeepSeek V4 Flash");
  });

  it("flags vanished paid ids as removed", () => {
    const changes = diffCatalog(["meta/llama-3.3-70b-instruct"], []);
    expect(changes[0].type).toBe("removed");
  });

  it("detects free-tier ids", () => {
    expect(isFreeTierId("opencode/big-pickle")).toBe(true);
    expect(isFreeTierId("openrouter/z-ai/glm-5.2:free")).toBe(true);
    expect(isFreeTierId("meta/llama-3.3-70b-instruct")).toBe(false);
  });

  it("collects free-tier ids whose last test was removed", () => {
    const gone = freeTierGoneIds(
      ["opencode/x-free", "opencode/y-free", "meta/z"],
      new Map([
        ["opencode/x-free", result({ modelId: "opencode/x-free", status: "removed" })],
        ["opencode/y-free", result({ modelId: "opencode/y-free", status: "working" })],
      ])
    );
    expect([...gone]).toEqual(["opencode/x-free"]);
  });
});

describe("rate-limit retry policy", () => {
  it("allows exactly one retry", () => {
    expect(shouldRetryRateLimit(1)).toBe(true);
    expect(shouldRetryRateLimit(RATE_LIMIT_MAX_ATTEMPTS)).toBe(false);
  });
});
