import { describe, it, expect } from "vitest";
import { encodeSnapshot, decodeSnapshot, MAX_ENCODED_LENGTH } from "@/lib/share";
import type { TestResult } from "@/lib/models";

const sample: TestResult[] = [
  {
    modelId: "nvidia/llama-3.1-nemotron-70b-instruct",
    provider: "nvidia",
    status: "working",
    httpCode: 200,
    responseTimeMs: 812,
    supportsFunctionCalling: true,
  },
  {
    modelId: "openrouter/meta/llama-3.1-8b-instruct",
    provider: "openrouter",
    status: "error",
    httpCode: 429,
    responseTimeMs: 210,
    supportsFunctionCalling: false,
    error: "rate limited",
  },
];

function makeResults(n: number, withError = true): TestResult[] {
  return Array.from({ length: n }, (_, i) => ({
    modelId: `openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning-${i}:free`,
    provider: (["nvidia", "opencode", "openrouter"] as const)[i % 3],
    status: (["working", "slow", "error", "timeout", "removed"] as const)[i % 5],
    httpCode: 200,
    responseTimeMs: 1000 + i,
    supportsFunctionCalling: i % 2 === 0,
    ...(withError
      ? { error: `upstream failure ${i}: connect reset before headers were received` }
      : {}),
  }));
}

describe("share codec", () => {
  it("round-trips a snapshot", async () => {
    const { encoded } = await encodeSnapshot({ ts: 1755000000000, results: sample });
    const back = await decodeSnapshot(encoded);
    expect(back.ok).toBe(true);
    expect(back.ts).toBe(1755000000000);
    expect(back.results).toEqual(sample);
  });

  it("produces URL-path-safe output", async () => {
    const { encoded } = await encodeSnapshot({ ts: Date.now(), results: sample });
    // No characters that would terminate or re-segment a path component.
    expect(encoded).not.toMatch(/[+/=?#&\s]/);
    expect(encodeURIComponent(encoded)).toBe(encoded);
  });

  it("handles unicode payloads", async () => {
    const unicode: TestResult[] = [
      { ...sample[0], modelId: "nvidia/模型-测试-🚀", error: "错误: 超时 — ünïcodé" },
    ];
    const { encoded } = await encodeSnapshot({ ts: 1, results: unicode });
    const back = await decodeSnapshot(encoded);
    expect(back.results[0].modelId).toBe("nvidia/模型-测试-🚀");
    expect(back.results[0].error).toBe("错误: 超时 — ünïcodé");
  });

  it("reports ok:false for garbage input instead of throwing", async () => {
    for (const bad of ["!!!not-base64!!!", "", "v2.z@@@@", "zzzz"]) {
      const back = await decodeSnapshot(bad);
      expect(back.ok).toBe(false);
      expect(back.results).toEqual([]);
      expect(back.ts).toBeNull();
    }
  });

  it("distinguishes an empty run from an unreadable link", async () => {
    const { encoded } = await encodeSnapshot({ ts: 42, results: [] });
    const back = await decodeSnapshot(encoded);
    expect(back.ok).toBe(true);
    expect(back.ts).toBe(42);
    expect(back.results).toEqual([]);
  });

  // The bug this codec replaced: raw base64-of-JSON produced 11-40 KB URLs for
  // a normal run, past the request-line cap of Vercel and most CDNs, so every
  // real share link failed. Keep a hard ceiling under test.
  it("keeps a full catalog run inside the URL length budget", async () => {
    for (const n of [10, 45, 90, 200]) {
      const { encoded, omitted } = await encodeSnapshot({
        ts: Date.now(),
        results: makeResults(n),
      });
      expect(encoded.length).toBeLessThanOrEqual(MAX_ENCODED_LENGTH);
      expect(omitted).toBe(0);
      const back = await decodeSnapshot(encoded);
      expect(back.results).toHaveLength(n);
    }
  });

  it("degrades rather than emitting a link the platform would reject", async () => {
    const huge = makeResults(4000);
    const { encoded, degraded, included, omitted } = await encodeSnapshot({
      ts: Date.now(),
      results: huge,
    });
    expect(encoded.length).toBeLessThanOrEqual(MAX_ENCODED_LENGTH);
    expect(degraded).toBe(true);
    expect(included + omitted).toBe(huge.length);
    const back = await decodeSnapshot(encoded);
    expect(back.ok).toBe(true);
    expect(back.results).toHaveLength(included);
  });

  it("drops error text before dropping whole results", async () => {
    // Long error strings compress poorly relative to the ids they accompany;
    // shedding them must come first so more models survive.
    const verbose = makeResults(300).map((r) => ({ ...r, error: "x".repeat(400) }));
    const { included, omitted } = await encodeSnapshot({ ts: Date.now(), results: verbose });
    expect(included).toBe(300);
    expect(omitted).toBe(0);
  });

  it("still decodes legacy pre-v2 links", async () => {
    // Older links are raw base64url of the full TestResult JSON.
    const json = JSON.stringify({ ts: 1755000000000, results: sample });
    const legacy = btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const back = await decodeSnapshot(legacy);
    expect(back.ok).toBe(true);
    expect(back.ts).toBe(1755000000000);
    expect(back.results).toEqual(sample);
  });

  it("normalises unknown provider/status values from a hostile payload", async () => {
    const json = JSON.stringify({
      ts: 1,
      results: [{ modelId: "x/y", provider: "evil", status: "pwned", httpCode: "?" }],
    });
    const legacy = btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const back = await decodeSnapshot(legacy);
    expect(back.results[0].provider).toBe("nvidia");
    expect(back.results[0].status).toBe("error");
    expect(back.results[0].httpCode).toBe(0);
  });

  it("flags well-formed payloads as valid and garbage as invalid", () => {
    expect(decodeSnapshot(encodeSnapshot({ ts: 1, results: sample })).valid).toBe(true);
    expect(decodeSnapshot("!!!").valid).toBe(false);
    // JSON, but the wrong shape: foreign input, not an empty snapshot
    const wrongShape = btoa(JSON.stringify({ hello: "world" }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    expect(decodeSnapshot(wrongShape).valid).toBe(false);
  });

  it("keeps a well-formed empty payload distinct from a corrupt link", () => {
    const decoded = decodeSnapshot(encodeSnapshot({ ts: 1, results: [] }));
    expect(decoded.valid).toBe(true);
    expect(decoded.results).toEqual([]);
  });

  it("caps result count and error length, reporting omissions", () => {
    const many: TestResult[] = Array.from({ length: 200 }, (_, i) => ({
      ...sample[0],
      modelId: `prov/model-${i}`,
      error: "x".repeat(500),
    }));
    const decoded = decodeSnapshot(encodeSnapshot({ ts: 1, results: many }));
    expect(decoded.results.length).toBe(150);
    expect(decoded.omitted).toBe(50);
    expect(decoded.results.every((r) => (r.error ?? "").length === 140)).toBe(true);
    expect(decoded.valid).toBe(true);
  });
});
