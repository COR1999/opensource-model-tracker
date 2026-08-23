import { describe, it, expect } from "vitest";
import {
  inferCategory,
  isT3Breaking,
  isKnownSlow,
  isT3Available,
  nvidiaModelUrl,
  openrouterModelUrl,
  opencodeModelUrl,
  T3_AVAILABLE_MODELS,
} from "@/lib/models";

describe("inferCategory", () => {
  it("classifies by explicit map entry before keywords", () => {
    // laguna carries no keyword; only the suffix-aware lookup can find it
    expect(inferCategory("openrouter/poolside/laguna-s-2.1")).toBe("code");
    expect(inferCategory("z-ai/glm-5.2")).toBe("chat");
  });

  it("falls back to keyword heuristics", () => {
    expect(inferCategory("nvidia/nv-embedqa-e5-v5")).toBe("embedding");
    expect(inferCategory("openai/whisper-large-v3")).toBe("audio");
    expect(inferCategory("qwen/qwen3-coder-30b")).toBe("code");
    expect(inferCategory("something/vision-lm-1")).toBe("vision");
    // ids with no map entry and no keyword land in "other" (-instruct alone
    // is not treated as a chat hint)
    expect(inferCategory("nvidia/llama-3.1-nemotron-70b-instruct")).toBe("other");
  });

  it("never throws on odd ids", () => {
    expect(["chat", "code", "vision", "embedding", "audio", "other"]).toContain(
      inferCategory("weird/id/with/many/slashes")
    );
    expect(inferCategory("x")).toBeTruthy();
  });
});

describe("T3 set helpers", () => {
  it("isT3Available handles nvidia prefix both ways", () => {
    const anyId = [...T3_AVAILABLE_MODELS][0];
    expect(isT3Available(anyId)).toBe(true);
    if (!anyId.startsWith("nvidia/") && !isT3Available(`nvidia/${anyId}`)) {
      // prefixed form must resolve unless the raw id itself starts with nvidia/
      throw new Error(`prefixed lookup failed for ${anyId}`);
    }
  });

  it("breaking/slow membership is boolean", () => {
    expect(typeof isT3Breaking("anything")).toBe("boolean");
    expect(typeof isKnownSlow("anything")).toBe("boolean");
  });
});

describe("url builders", () => {
  it("strips the openrouter provider prefix", () => {
    expect(openrouterModelUrl("openrouter/meta/llama-3.1-8b-instruct")).toBe(
      "https://openrouter.ai/meta/llama-3.1-8b-instruct"
    );
    expect(nvidiaModelUrl("microsoft/phi-4")).toBe("https://build.nvidia.com/microsoft/phi-4");
    expect(opencodeModelUrl()).toContain("opencode.ai");
  });
});
