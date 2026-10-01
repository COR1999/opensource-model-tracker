import { describe, it, expect } from "vitest";
import { encodeSnapshot, decodeSnapshot } from "@/lib/share";
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

describe("share codec", () => {
  it("round-trips a snapshot", () => {
    const encoded = encodeSnapshot({ ts: 1755000000000, results: sample });
    const back = decodeSnapshot(encoded);
    expect(back.valid).toBe(true);
    expect(back.ts).toBe(1755000000000);
    expect(back.results).toEqual(sample);
  });

  it("produces URL-path-safe output", () => {
    const encoded = encodeSnapshot({ ts: Date.now(), results: sample });
    expect(encoded).not.toMatch(/[+/=?#&\s]/);
    expect(encodeURIComponent(encoded)).toBe(encoded);
  });

  it("handles unicode payloads", () => {
    const unicode: TestResult[] = [
      { ...sample[0], modelId: "nvidia/模型-测试-🚀", error: "错误: 超时 — ünïcodé" },
    ];
    const encoded = encodeSnapshot({ ts: 1, results: unicode });
    const back = decodeSnapshot(encoded);
    expect(back.results[0].modelId).toBe("nvidia/模型-测试-🚀");
    expect(back.results[0].error).toBe("错误: 超时 — ünïcodé");
  });

  it("reports valid:false for garbage input instead of throwing", () => {
    for (const bad of ["!!!not-base64!!!", "", "zzzz"]) {
      const back = decodeSnapshot(bad);
      expect(back.valid).toBe(false);
      expect(back.results).toEqual([]);
      expect(back.ts).toBeNull();
    }
  });

  it("distinguishes an empty run from an unreadable link", () => {
    const encoded = encodeSnapshot({ ts: 42, results: [] });
    const back = decodeSnapshot(encoded);
    expect(back.valid).toBe(true);
    expect(back.ts).toBe(42);
    expect(back.results).toEqual([]);
  });

  it("still decodes legacy pre-v2 links", () => {
    const json = JSON.stringify({ ts: 1755000000000, results: sample });
    const legacy = btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const back = decodeSnapshot(legacy);
    expect(back.valid).toBe(true);
    expect(back.ts).toBe(1755000000000);
    expect(back.results).toEqual(sample);
  });

  it("normalises unknown provider/status values from a hostile payload", () => {
    const json = JSON.stringify({
      ts: 1,
      results: [{ modelId: "x/y", provider: "evil", status: "pwned", httpCode: "?" }],
    });
    const legacy = btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const back = decodeSnapshot(legacy);
    expect(back.results[0].provider).toBe("nvidia");
    expect(back.results[0].status).toBe("error");
    expect(back.results[0].httpCode).toBe(0);
  });

  it("flags well-formed payloads as valid and garbage as invalid", () => {
    expect(decodeSnapshot(encodeSnapshot({ ts: 1, results: sample })).valid).toBe(true);
    expect(decodeSnapshot("!!!").valid).toBe(false);
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
