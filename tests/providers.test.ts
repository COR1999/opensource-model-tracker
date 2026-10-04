import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchAllProviderModels,
  fetchOpenCodeModels,
  fetchOpenRouterModels,
  modelUrl,
  nvidiaModelUrl,
  openrouterModelUrl,
} from "@/lib/providers";
import { FALLBACK_OPENCODE_MODELS, FALLBACK_OPENROUTER_MODELS } from "@/lib/curated";

describe("modelUrl builders", () => {
  it("routes each provider to the right base", () => {
    expect(nvidiaModelUrl("meta/llama-3.3-70b-instruct")).toBe(
      "https://build.nvidia.com/meta/llama-3.3-70b-instruct"
    );
    expect(openrouterModelUrl("openrouter/z-ai/glm-5.2:free")).toBe(
      "https://openrouter.ai/z-ai/glm-5.2:free"
    );
    expect(modelUrl({ id: "opencode/big-pickle", provider: "opencode" })).toContain("opencode.ai");
  });
});

describe("fetchOpenCodeModels", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("keeps only free ids and big-pickle from the Zen listing", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: "big-pickle", owned_by: "opencode" },
            { id: "mimo-v2.5-free", owned_by: "opencode" },
            { id: "gpt-6-astra", owned_by: "openai" },
            { id: "claude-opus-5", owned_by: "anthropic" },
          ],
        }),
        { status: 200 }
      )
    ) as typeof fetch;

    const models = await fetchOpenCodeModels();
    const ids = models.map((m) => m.id);
    expect(ids).toContain("opencode/big-pickle");
    expect(ids).toContain("opencode/mimo-v2.5-free");
    expect(ids).not.toContain("opencode/gpt-6-astra");
    expect(ids).not.toContain("opencode/claude-opus-5");
  });

  it("falls back to the curated list when the gateway fails", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as typeof fetch;

    const models = await fetchOpenCodeModels();
    expect(models).toEqual(FALLBACK_OPENCODE_MODELS);
  });
});

describe("fetchOpenRouterModels", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("keeps only :free variants and maps context_length", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: "z-ai/glm-5.2:free", name: "GLM 5.2 (free)", context_length: 256000 },
            { id: "z-ai/glm-5.2", name: "GLM 5.2", context_length: 256000 },
          ],
        }),
        { status: 200 }
      )
    ) as typeof fetch;

    const models = await fetchOpenRouterModels();
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe("openrouter/z-ai/glm-5.2:free");
    expect(models[0].displayName).toBe("GLM 5.2");
    expect(models[0].contextLength).toBe(256000);
  });

  it("falls back to the curated free list when the API is down", async () => {
    globalThis.fetch = vi.fn(async () => new Response("nope", { status: 500 })) as typeof fetch;

    const models = await fetchOpenRouterModels();
    expect(models).toEqual(FALLBACK_OPENROUTER_MODELS);
  });
});

describe("fetchAllProviderModels", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("reports a per-provider error when OpenCode or OpenRouter fail, not just NVIDIA", async () => {
    // Every provider (NVIDIA included) and the ranking lookup share one fetch
    // mock: NVIDIA's URL succeeds, everything else (Zen, OpenRouter, BenchLM)
    // fails, so this exercises the fallback path for all three at once.
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("integrate.api.nvidia.com")) {
        return new Response(
          JSON.stringify({ data: [{ id: "nvidia/x", owned_by: "nvidia" }] }),
          { status: 200 }
        );
      }
      throw new Error("network down");
    }) as typeof fetch;

    const { errors } = await fetchAllProviderModels("fake-key");
    expect(errors.nvidia).toBeNull();
    expect(errors.opencode).toBe("network down");
    expect(errors.openrouter).toBe("network down");
  });
});
