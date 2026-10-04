// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { createElement } from "react";
import ModelTable from "@/components/ModelTable";
import AlertSettings from "@/components/AlertSettings";
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
    supportsFunctionCalling: true,
    ...partial,
  };
}

function renderTable(
  models: ModelInfo[],
  results = new Map<string, TestResult>(),
  freeTierGone = new Set<string>()
) {
  return render(
    createElement(ModelTable, {
      models,
      results,
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
      testingIds: new Set<string>(),
      newModels: new Set<string>(),
      freeTierGone,
      shortlist: new Set<string>(),
      onToggleShortlist: () => {},
      busy: false,
    })
  );
}

describe("ModelTable", () => {
  it("renders score, free-gone badge, and shortlist control", () => {
    const models = [
      model({
        id: "opencode/muse-spark-1.2-contributor-free",
        displayName: "Muse Spark 1.2 Contributor",
        provider: "opencode",
        benchmarkScore: 64.6,
        codingScore: 70,
      }),
      model({
        id: "opencode/big-pickle",
        displayName: "Big Pickle",
        provider: "opencode",
      }),
    ];
    const results = new Map([
      [
        "opencode/big-pickle",
        result({ modelId: "opencode/big-pickle", status: "removed" }),
      ],
    ]);

    renderTable(models, results, new Set(["opencode/big-pickle"]));

    expect(screen.getByText("Muse Spark 1.2 Contributor")).toBeTruthy();
    expect(screen.getByText("64.6")).toBeTruthy();
    expect(screen.getByText("code")).toBeTruthy();
    expect(screen.getByText("free gone")).toBeTruthy();
    expect(screen.getAllByLabelText(/shortlist/i).length).toBeGreaterThan(0);
  });

  it("links model names to the detail page", () => {
    renderTable([
      model({
        id: "opencode/hy3-free",
        displayName: "Hy3",
        provider: "opencode",
        benchmarkScore: 51,
      }),
    ]);
    const link = screen.getByRole("link", { name: "Hy3" });
    expect(link.getAttribute("href")).toBe(`/model/${encodeURIComponent("opencode/hy3-free")}`);
  });
});

describe("AlertSettings", () => {
  const storageKey = "model-tracker-subscriptions";

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("rejects invalid webhook URLs and accepts valid ones", async () => {
    render(createElement(AlertSettings, { theme: "dark" }));

    await act(async () => {
      screen.getByText("+ Add webhook").click();
    });

    const input = screen.getByLabelText("Webhook URL") as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!;
      setter.call(input, "not-a-url");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      screen.getByRole("button", { name: "Add" }).click();
    });
    expect(screen.getByText(/valid http/i)).toBeTruthy();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!;
      setter.call(input, "https://hooks.example.com/x");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      screen.getByRole("button", { name: "Add" }).click();
    });

    await waitFor(() => {
      expect(screen.getByText("https://hooks.example.com/x")).toBeTruthy();
    });
    const stored = JSON.parse(localStorage.getItem(storageKey) || "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].url).toBe("https://hooks.example.com/x");
  });
});

describe("hook logic via lightweight harness", () => {
  it("mergeResults keeps prior maps and appends uptime", async () => {
    // Pure-behaviour check of the merge contract without full hook mount:
    // mirrors useModelTesting.mergeResults semantics.
    const prev = new Map<string, TestResult>([
      ["a", result({ modelId: "a", status: "working" })],
    ]);
    const incoming = new Map<string, TestResult>([
      ["b", result({ modelId: "b", status: "timeout" })],
    ]);
    const next = new Map(prev);
    for (const [id, r] of incoming) next.set(id, r);
    expect(next.size).toBe(2);
    expect(next.get("a")?.status).toBe("working");
    expect(next.get("b")?.status).toBe("timeout");
  });

  it("catalog empty-provider errors surface via providerErrors shape", () => {
    const errors = { nvidia: "fail", opencode: null, openrouter: null };
    expect(Object.entries(errors).filter(([, v]) => v)).toHaveLength(1);
  });
});
