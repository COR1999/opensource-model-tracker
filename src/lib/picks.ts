import type { ModelInfo, TestResult } from "./types";

export type ChipKind = "code" | "reason" | "know" | "agent" | "long-ctx" | "fast" | "unranked";

export interface BestForChip {
  kind: ChipKind;
  label: string;
}

const LONG_CTX = 256_000;
const FAST_MS = 2000;

/** Human chips for a model row, derived from live scores + last test result. */
export function bestForChips(model: ModelInfo, result?: TestResult): BestForChip[] {
  const chips: BestForChip[] = [];
  const coding = model.codingScore;
  const agentic = model.agenticScore;
  const knowledge = model.knowledgeScore;
  const intelligence = model.intelligenceScore;
  const score = model.benchmarkScore;

  if (typeof coding === "number" && coding >= 55) chips.push({ kind: "code", label: "code" });
  if (typeof intelligence === "number" && intelligence >= 25) {
    chips.push({ kind: "reason", label: "reason" });
  } else if (typeof score === "number" && score >= 60) {
    chips.push({ kind: "reason", label: "reason" });
  }
  if (typeof knowledge === "number" && knowledge >= 60) chips.push({ kind: "know", label: "know" });
  if (typeof agentic === "number" && agentic >= 40) chips.push({ kind: "agent", label: "agent" });
  if ((model.contextLength ?? 0) >= LONG_CTX) chips.push({ kind: "long-ctx", label: "long ctx" });
  if (
    result &&
    (result.status === "working" || result.status === "slow") &&
    result.responseTimeMs > 0 &&
    result.responseTimeMs < FAST_MS
  ) {
    chips.push({ kind: "fast", label: "fast" });
  }
  if (chips.length === 0 && typeof score !== "number" && typeof coding !== "number") {
    chips.push({ kind: "unranked", label: "unranked" });
  }
  return chips;
}

/**
 * Recommend one model from a catalog: prefer BenchLM score, then AA coding,
 * then a recently working test result. Never returns an error/timeout model
 * if a working alternative exists.
 */
export function recommendModel(
  models: ModelInfo[],
  results: Map<string, TestResult>
): ModelInfo | null {
  if (models.length === 0) return null;

  const working = (m: ModelInfo) => {
    const r = results.get(m.id);
    return r?.status === "working" || r?.status === "slow";
  };

  const rankKey = (m: ModelInfo): [number, number, number, number] => {
    const r = results.get(m.id);
    const testBonus =
      r?.status === "working" ? 3 : r?.status === "slow" ? 2 : r?.status === "rate-limited" ? 1 : 0;
    return [
      typeof m.benchmarkScore === "number" ? m.benchmarkScore : -1,
      typeof m.codingScore === "number" ? m.codingScore : -1,
      typeof m.agenticScore === "number" ? m.agenticScore : -1,
      testBonus,
    ];
  };

  const better = (a: ModelInfo, b: ModelInfo) => {
    const ka = rankKey(a);
    const kb = rankKey(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) return ka[i] - kb[i];
    }
    return a.id.localeCompare(b.id);
  };

  const workingModels = models.filter(working);
  const pool = workingModels.length > 0 ? workingModels : models;
  return [...pool].sort((a, b) => better(b, a))[0] ?? null;
}
