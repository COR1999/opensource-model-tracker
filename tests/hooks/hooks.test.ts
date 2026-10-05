// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useModelCatalog } from "@/hooks/useModelCatalog";
import { useModelTesting } from "@/hooks/useModelTesting";
import type { ModelInfo, TestResult } from "@/lib/types";

const sampleModel: ModelInfo = {
  id: "opencode/big-pickle",
  displayName: "Big Pickle",
  provider: "opencode",
  ownedBy: "opencode",
  category: "chat",
};

const originalFetch = globalThis.fetch;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("useModelCatalog", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("loads models from /api/models and exposes freeTierGone", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        models: [sampleModel],
        errors: { nvidia: null, opencode: null, openrouter: null },
        rankingMeta: { asOf: null, sources: [] },
      })
    ) as typeof fetch;

    const { result } = renderHook(() => useModelCatalog());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.models).toHaveLength(1);
    expect(result.current.models[0].id).toBe("opencode/big-pickle");
    expect(result.current.error).toBeNull();
  });

  it("records free-tier-gone when a known free model vanishes", async () => {
    // Seed known models so the first refresh diffs against them.
    localStorage.setItem(
      "model-tracker-known-models",
      JSON.stringify(["opencode/deepseek-v4-flash-free", "meta/llama-3.3-70b-instruct"])
    );

    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        models: [
          {
            id: "meta/llama-3.3-70b-instruct",
            displayName: "Llama 3.3 70B",
            provider: "nvidia",
            ownedBy: "meta",
            category: "chat",
          },
        ],
        errors: { nvidia: null, opencode: null, openrouter: null },
        rankingMeta: { asOf: null, sources: [] },
      })
    ) as typeof fetch;

    const { result } = renderHook(() => useModelCatalog());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() =>
      expect(result.current.freeTierGone.has("opencode/deepseek-v4-flash-free")).toBe(true)
    );
  });
});

describe("useModelTesting", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("testOne merges a successful result into state", async () => {
    const testResult: TestResult = {
      modelId: sampleModel.id,
      provider: "opencode",
      status: "working",
      httpCode: 200,
      responseTimeMs: 120,
      supportsFunctionCalling: false,
    };
    globalThis.fetch = vi.fn(async () => jsonResponse(testResult)) as typeof fetch;

    const { result } = renderHook(() => useModelTesting());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    await act(async () => {
      await result.current.testOne(sampleModel);
    });

    expect(result.current.results.get(sampleModel.id)?.status).toBe("working");
    expect(result.current.testingIds.size).toBe(0);
  });

  it("keeps a slower testOne's in-progress flag set while a faster concurrent testOne finishes", async () => {
    const modelB: ModelInfo = {
      id: "opencode/other-model",
      displayName: "Other",
      provider: "opencode",
      ownedBy: "opencode",
      category: "chat",
    };
    const resultFor = (model: ModelInfo): TestResult => ({
      modelId: model.id,
      provider: "opencode",
      status: "working",
      httpCode: 200,
      responseTimeMs: 50,
      supportsFunctionCalling: false,
    });

    let releaseA: (() => void) | undefined;
    globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (body.model.id === sampleModel.id) {
        await new Promise<void>((resolve) => {
          releaseA = resolve;
        });
        return jsonResponse(resultFor(sampleModel));
      }
      return jsonResponse(resultFor(modelB));
    }) as typeof fetch;

    const { result } = renderHook(() => useModelTesting());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    let testADone: Promise<void> = Promise.resolve();
    await act(async () => {
      testADone = result.current.testOne(sampleModel);
      // Let testOne(A)'s synchronous setTestingIds + fetch call register.
      await Promise.resolve();
    });
    expect(result.current.testingIds.has(sampleModel.id)).toBe(true);

    await act(async () => {
      await result.current.testOne(modelB);
    });
    // B resolved first; A is still in flight and must still show as testing.
    expect(result.current.testingIds.has(sampleModel.id)).toBe(true);
    expect(result.current.testingIds.has(modelB.id)).toBe(false);

    await act(async () => {
      releaseA?.();
      await testADone;
    });
    expect(result.current.testingIds.has(sampleModel.id)).toBe(false);
  });

  it("testMany fills missing server results with an error entry", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ results: [] })
    ) as typeof fetch;

    const { result } = renderHook(() => useModelTesting());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    await act(async () => {
      await result.current.testMany([sampleModel], "Test");
    });

    const r = result.current.results.get(sampleModel.id);
    expect(r?.status).toBe("error");
    expect(r?.error).toMatch(/no result/i);
    expect(result.current.progress).toBeNull();
  });
});
