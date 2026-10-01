import { describe, it, expect } from "vitest";
import { matchesStatusFilter, STATUS_FILTER_OPTIONS } from "@/lib/filters";
import type { ModelInfo } from "@/lib/types";

function model(partial: Partial<ModelInfo> & { id: string }): ModelInfo {
  return {
    displayName: partial.id,
    provider: "nvidia",
    ownedBy: "x",
    category: "chat",
    ...partial,
  };
}

const nvidiaModel = model({ id: "meta/codellama-70b", provider: "nvidia" });
const zenFree = model({ id: "opencode/big-pickle", provider: "opencode" });

describe("matchesStatusFilter", () => {
  it("passes everything through for 'all'", () => {
    for (const status of ["working", "removed", "error"] as const) {
      expect(matchesStatusFilter(nvidiaModel, status, "all")).toBe(true);
    }
    expect(matchesStatusFilter(nvidiaModel, undefined, "all")).toBe(true);
  });

  it("treats slow as working, since a slow model is still usable", () => {
    expect(matchesStatusFilter(nvidiaModel, "working", "working")).toBe(true);
    expect(matchesStatusFilter(nvidiaModel, "slow", "working")).toBe(true);
    expect(matchesStatusFilter(nvidiaModel, "error", "working")).toBe(false);
  });

  it("folds timeout into Down", () => {
    expect(matchesStatusFilter(nvidiaModel, "timeout", "error")).toBe(true);
    expect(matchesStatusFilter(nvidiaModel, "error", "error")).toBe(true);
    expect(matchesStatusFilter(nvidiaModel, "rate-limited", "error")).toBe(false);
  });

  it("matches removed models on the 'removed' filter", () => {
    // NVIDIA keeps ~15% of its catalog listed while the inference endpoint
    // 404s them, so there is a real population of removed rows to isolate.
    expect(matchesStatusFilter(nvidiaModel, "removed", "removed")).toBe(true);
    expect(matchesStatusFilter(nvidiaModel, "working", "removed")).toBe(false);
    expect(matchesStatusFilter(nvidiaModel, undefined, "removed")).toBe(false);
  });

  it("derives opencode-only from the model, not from a result", () => {
    // Automated probes skip Zen free ids, so they never get a result to match.
    expect(matchesStatusFilter(zenFree, undefined, "opencode-only")).toBe(true);
    expect(matchesStatusFilter(nvidiaModel, undefined, "opencode-only")).toBe(false);
  });

  it("matches only models with no result for untested", () => {
    expect(matchesStatusFilter(nvidiaModel, undefined, "untested")).toBe(true);
    expect(matchesStatusFilter(nvidiaModel, "removed", "untested")).toBe(false);
  });
});

describe("STATUS_FILTER_OPTIONS", () => {
  it("offers a Removed option, sorted before Down", () => {
    const labels = STATUS_FILTER_OPTIONS.map((o) => o.label);
    expect(labels).toContain("Removed");
    expect(labels.indexOf("Removed")).toBeLessThan(labels.indexOf("Down"));
  });

  it("lists every option exactly once", () => {
    const values = STATUS_FILTER_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values).toContain("all");
  });
});
