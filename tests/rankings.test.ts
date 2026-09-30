import { describe, it, expect } from "vitest";
import {
  rankingKey,
  lookupBenchmark,
  annotateAndSortModels,
  type BenchmarkIndex,
} from "@/lib/rankings";
import type { ModelInfo } from "@/lib/types";

function model(partial: Partial<ModelInfo> & { id: string }): ModelInfo {
  return {
    displayName: partial.id,
    provider: "openrouter",
    ownedBy: "x",
    category: "chat",
    ...partial,
  };
}

describe("rankingKey", () => {
  it("strips provider namespaces, free markers and punctuation", () => {
    expect(rankingKey("openrouter/z-ai/glm-5.2:free")).toBe("zaiglm52");
    expect(rankingKey("opencode/muse-spark-1.2-contributor-free")).toBe(
      "musespark12contributor"
    );
    expect(rankingKey("GLM 5.2")).toBe("glm52");
    expect(rankingKey("dots3-note Preview")).toBe("dots3notepreview");
  });
});

describe("annotateAndSortModels", () => {
  const index: BenchmarkIndex = {
    byKey: new Map([
      [
        "musespark12",
        { rank: 32, score: 64.61, coding: 55.25, agentic: 59.27, knowledge: 64.52, source: "benchlm" },
      ],
      [
        "glm52",
        { rank: 41, score: 62.44, coding: 56.29, agentic: 56.44, knowledge: 57.16, source: "benchlm" },
      ],
      ["hy3", { rank: 80, score: 51.15, source: "benchlm" }],
      [
        "deepseekv4flash",
        {
          rank: undefined,
          score: undefined,
          intelligence: 34.3,
          coding: 69.1,
          agentic: 41.0,
          knowledge: undefined,
          source: "openrouter-aa",
        },
      ],
      [
        "northminicode",
        { intelligence: 9.9, coding: 36.5, agentic: 1.1, source: "openrouter-aa" },
      ],
    ]),
    meta: { asOf: "2026-09-29", sources: ["benchlm", "openrouter-aa"] },
  };

  it("annotates matched models with score/rank/category fields", () => {
    const [annotated] = annotateAndSortModels(
      [
        model({
          id: "opencode/muse-spark-1.2-contributor-free",
          displayName: "Muse Spark 1.2 Contributor",
          provider: "opencode",
        }),
      ],
      index
    );
    expect(annotated.benchmarkScore).toBe(64.61);
    expect(annotated.benchmarkRank).toBe(32);
    expect(annotated.codingScore).toBe(55.25);
    expect(annotated.agenticScore).toBe(59.27);
    expect(annotated.knowledgeScore).toBe(64.52);
  });

  it("sorts BenchLM scores first, then AA coding for unlisted models", () => {
    const sorted = annotateAndSortModels(
      [
        model({ id: "opencode/hy3-free", displayName: "Hy3", provider: "opencode" }),
        model({
          id: "opencode/muse-spark-1.2-contributor-free",
          displayName: "Muse Spark 1.2 Contributor",
          provider: "opencode",
        }),
        model({
          id: "openrouter/z-ai/glm-5.2:free",
          displayName: "GLM 5.2",
          provider: "openrouter",
        }),
        model({
          id: "opencode/deepseek-v4-flash-free",
          displayName: "DeepSeek V4 Flash",
          provider: "opencode",
        }),
        model({
          id: "openrouter/cohere/north-mini-code:free",
          displayName: "North Mini Code",
          provider: "openrouter",
        }),
        model({ id: "opencode/big-pickle", displayName: "Big Pickle", provider: "opencode" }),
      ],
      index
    );
    expect(sorted.map((m) => m.id)).toEqual([
      "opencode/muse-spark-1.2-contributor-free",
      "openrouter/z-ai/glm-5.2:free",
      "opencode/hy3-free",
      // AA-only models follow BenchLM-scored ones, ordered by coding index
      "opencode/deepseek-v4-flash-free",
      "openrouter/cohere/north-mini-code:free",
      "opencode/big-pickle",
    ]);
    expect(sorted.find((m) => m.id.includes("deepseek"))?.codingScore).toBe(69.1);
  });

  it("breaks score ties by provider then id for stable order", () => {
    const sorted = annotateAndSortModels(
      [
        model({ id: "openrouter/b", displayName: "B", provider: "openrouter" }),
        model({ id: "opencode/a", displayName: "A", provider: "opencode" }),
      ],
      {
        byKey: new Map([
          ["opencodea", { rank: 1, score: 50, source: "benchlm" }],
          ["openrouterb", { rank: 2, score: 50, source: "benchlm" }],
        ]),
        meta: { asOf: "t", sources: [] },
      }
    );
    expect(sorted.map((m) => m.id)).toEqual(["opencode/a", "openrouter/b"]);
  });
});

describe("lookupBenchmark", () => {
  it("matches free-tier ids to BenchLM family names and AA permaslugs", () => {
    const index: BenchmarkIndex = {
      byKey: new Map([
        ["musespark12", { rank: 32, score: 64.61, source: "benchlm" }],
        [
          "deepseekv4flash20260731",
          { coding: 69.1, agentic: 41.0, source: "openrouter-aa" },
        ],
      ]),
      meta: { asOf: "t", sources: ["benchlm", "openrouter-aa"] },
    };
    expect(
      lookupBenchmark(model({ id: "opencode/muse-spark-1.2-contributor-free" }), index)?.score
    ).toBe(64.61);
    expect(
      lookupBenchmark(model({ id: "opencode/deepseek-v4-flash-free" }), index)?.coding
    ).toBe(69.1);
  });

  it("does not invent a score for models with no public benchmark row", () => {
    const index: BenchmarkIndex = {
      byKey: new Map([
        ["deepseekv41flash", { rank: 58, score: 55.33, source: "benchlm" }],
      ]),
      meta: { asOf: "t", sources: ["benchlm"] },
    };
    // free rename of V4 Flash must not borrow V4.1 Flash's BenchLM score
    expect(lookupBenchmark(model({ id: "opencode/deepseek-v4-flash-free" }), index)).toBeUndefined();
  });
});
