// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import ModelTable from "@/components/ModelTable";
import { computeCounts } from "@/components/StatsGrid";
import { computeProviderHealth } from "@/components/ProviderHealthStrip";
import { isOpenCodeOnlyBody, isOpencodeAppOnlyModel } from "@/lib/testing";
import type { ModelInfo, TestResult } from "@/lib/types";

function model(partial: Partial<ModelInfo> & { id: string }): ModelInfo {
  return {
    displayName: partial.id,
    provider: "openrouter",
    ownedBy: "x",
    category: "chat",
    ...partial,
  };
}

function result(partial: Partial<TestResult> & { modelId: string }): TestResult {
  return {
    provider: "openrouter",
    status: "working",
    httpCode: 200,
    responseTimeMs: 400,
    supportsFunctionCalling: false,
    ...partial,
  };
}

describe("OpenCode app-only UX", () => {
  it("detects FreeTierError from Zen", () => {
    expect(
      isOpenCodeOnlyBody(
        '{"error":{"type":"FreeTierError","message":"can only be used from within OpenCode"}}'
      )
    ).toBe(true);
    expect(isOpencodeAppOnlyModel({ id: "opencode/big-pickle", provider: "opencode" })).toBe(
      true
    );
  });

  it("renders OpenCode only badge on the table", () => {
    render(
      createElement(ModelTable, {
        models: [
          model({
            id: "opencode/big-pickle",
            displayName: "Big Pickle",
            provider: "opencode",
          }),
        ],
        results: new Map(),
        uptime: {},
        theme: "dark",
        density: "comfortable",
        sortKey: "benchmarkScore",
        sortAsc: true,
        onSort: () => {},
        compareIds: new Set<string>(),
        onToggleCompare: () => {},
        onTest: () => {},
        onCopyId: () => {},
        copiedId: null,
        testingSingle: null,
        newModels: new Set<string>(),
        freeTierGone: new Set<string>(),
        shortlist: new Set<string>(),
        onToggleShortlist: () => {},
        busy: false,
      })
    );
    expect(screen.getAllByText("OpenCode only").length).toBeGreaterThan(0);
  });
});

describe("stats include new statuses", () => {
  it("counts opencode-only and rate-limited separately from down", () => {
    const models = [model({ id: "a" }), model({ id: "b" }), model({ id: "c" })];
    const results = new Map([
      ["a", result({ modelId: "a", status: "working" })],
      ["b", result({ modelId: "b", status: "rate-limited" })],
      ["c", result({ modelId: "c", status: "opencode-only", provider: "opencode" })],
    ]);
    const counts = computeCounts(models, results, 0);
    expect(counts.working).toBe(1);
    expect(counts.rateLimited).toBe(1);
    expect(counts.rateLimited).toBeDefined();
    // opencode-only is not counted as error/down
    expect(counts.error).toBe(0);
  });

  it("provider health counts rate-limited separately", () => {
    const models = [model({ id: "or1", provider: "openrouter" })];
    const results = new Map([
      ["or1", result({ modelId: "or1", status: "rate-limited", provider: "openrouter" })],
    ]);
    const health = computeProviderHealth(models, results).find((h) => h.provider === "openrouter");
    expect(health?.rateLimited).toBe(1);
    expect(health?.down).toBe(0);
  });
});
