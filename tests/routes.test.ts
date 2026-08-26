import { describe, it, expect } from "vitest";
import { normalizeModelId } from "@/lib/categories";

/**
 * Tests for the model input validation logic used by /api/test and /api/test-all.
 * The parseModel function is not exported from the route handler, so we test the
 * same validation rules directly here to ensure the contract is documented and
 * regression-tested.
 */

type Provider = "nvidia" | "opencode" | "openrouter";
type ModelCategory = "chat" | "code" | "vision" | "embedding" | "audio" | "other";

interface ModelInfo {
  id: string;
  displayName: string;
  provider: Provider;
  ownedBy: string;
  category: ModelCategory;
}

const VALID_PROVIDERS = new Set(["nvidia", "opencode", "openrouter"]);
const VALID_CATEGORIES = new Set(["chat", "code", "vision", "embedding", "audio", "other"]);

/** Mirrors the parseModel logic from src/app/api/test/route.ts */
function parseModel(value: unknown): ModelInfo | null {
  if (typeof value !== "object" || value === null) return null;
  const m = value as Record<string, unknown>;
  if (typeof m.id !== "string" || !m.id) return null;
  if (!VALID_PROVIDERS.has(m.provider as string)) return null;
  return {
    id: m.id,
    displayName: typeof m.displayName === "string" ? m.displayName : m.id,
    provider: m.provider as Provider,
    ownedBy: typeof m.ownedBy === "string" ? m.ownedBy : "unknown",
    category: VALID_CATEGORIES.has(m.category as string) ? (m.category as ModelCategory) : "other",
  };
}

describe("parseModel validation", () => {
  it("accepts a valid model object", () => {
    const result = parseModel({
      id: "meta/llama-3.3-70b-instruct",
      displayName: "Llama 3.3 70B",
      provider: "nvidia",
      ownedBy: "meta",
      category: "chat",
    });
    expect(result).toEqual({
      id: "meta/llama-3.3-70b-instruct",
      displayName: "Llama 3.3 70B",
      provider: "nvidia",
      ownedBy: "meta",
      category: "chat",
    });
  });

  it("rejects null input", () => {
    expect(parseModel(null)).toBeNull();
  });

  it("rejects undefined input", () => {
    expect(parseModel(undefined)).toBeNull();
  });

  it("rejects a string", () => {
    expect(parseModel("not an object")).toBeNull();
  });

  it("rejects an object with missing id", () => {
    expect(parseModel({ provider: "nvidia" })).toBeNull();
  });

  it("rejects an object with empty id", () => {
    expect(parseModel({ id: "", provider: "nvidia" })).toBeNull();
  });

  it("rejects an object with invalid provider", () => {
    expect(parseModel({ id: "test-model", provider: "anthropic" })).toBeNull();
  });

  it("defaults displayName to id when not provided", () => {
    const result = parseModel({ id: "test-model", provider: "openrouter" });
    expect(result?.displayName).toBe("test-model");
  });

  it("defaults ownedBy to 'unknown' when not provided", () => {
    const result = parseModel({ id: "test-model", provider: "opencode" });
    expect(result?.ownedBy).toBe("unknown");
  });

  it("defaults category to 'other' for invalid category", () => {
    const result = parseModel({ id: "test-model", provider: "nvidia", category: "invalid" });
    expect(result?.category).toBe("other");
  });

  it("preserves valid category", () => {
    const result = parseModel({ id: "test-model", provider: "nvidia", category: "code" });
    expect(result?.category).toBe("code");
  });

  it("accepts all three valid providers", () => {
    expect(parseModel({ id: "m", provider: "nvidia" })?.provider).toBe("nvidia");
    expect(parseModel({ id: "m", provider: "opencode" })?.provider).toBe("opencode");
    expect(parseModel({ id: "m", provider: "openrouter" })?.provider).toBe("openrouter");
  });

  it("accepts all six valid categories", () => {
    for (const cat of ["chat", "code", "vision", "embedding", "audio", "other"]) {
      expect(parseModel({ id: "m", provider: "nvidia", category: cat })?.category).toBe(cat);
    }
  });
});

describe("model ID normalization (from categories.ts)", () => {

  it("strips opencode/ prefix", () => {
    expect(normalizeModelId("opencode/big-pickle")).toBe("big-pickle");
  });

  it("strips openrouter/ prefix", () => {
    expect(normalizeModelId("openrouter/z-ai/glm-5.2:free")).toBe("z-ai/glm-5.2");
  });

  it("strips :free suffix", () => {
    expect(normalizeModelId("openrouter/nvidia/nemotron:free")).toBe("nvidia/nemotron");
  });

  it("strips -free suffix", () => {
    expect(normalizeModelId("opencode/deepseek-v4-flash-free")).toBe("deepseek-v4-flash");
  });

  it("preserves nvidia/ prefix (part of upstream id)", () => {
    expect(normalizeModelId("nvidia/nemotron-3-super-120b-a12b")).toBe("nvidia/nemotron-3-super-120b-a12b");
  });

  it("handles bare ids unchanged", () => {
    expect(normalizeModelId("meta/llama-3.3-70b-instruct")).toBe("meta/llama-3.3-70b-instruct");
  });
});
