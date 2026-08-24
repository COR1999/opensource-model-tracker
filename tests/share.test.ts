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
    const ts = 1755000000000;
    const decoded = decodeSnapshot(encodeSnapshot({ ts, results: sample }));
    expect(decoded.ts).toBe(ts);
    expect(decoded.results).toEqual(sample);
  });

  it("produces URL-safe output (no + / =)", () => {
    const encoded = encodeSnapshot({ ts: Date.now(), results: sample });
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("handles unicode payloads", () => {
    const withUnicode: TestResult[] = [
      { ...sample[0], error: "模型不可用 — café ✓" },
    ];
    const decoded = decodeSnapshot(encodeSnapshot({ ts: 1, results: withUnicode }));
    expect(decoded.results[0].error).toBe("模型不可用 — café ✓");
  });

  it("returns an empty snapshot for garbage input instead of throwing", () => {
    for (const bad of ["", "!!!", "not base64 at all", "eyJpbnZhbGlk"]) {
      const decoded = decodeSnapshot(bad);
      expect(decoded.ts).toBeNull();
      expect(decoded.results).toEqual([]);
    }
  });

  it("tolerates missing ts field", () => {
    const encoded = encodeSnapshot({ ts: 5, results: [] }).length; // sanity
    expect(encoded).toBeGreaterThan(0);
    const raw = btoa(JSON.stringify({ results: sample }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const decoded = decodeSnapshot(raw);
    expect(decoded.ts).toBeNull();
    expect(decoded.results).toEqual(sample);
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
