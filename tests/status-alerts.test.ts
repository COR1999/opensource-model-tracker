import { describe, it, expect } from "vitest";
import { statusChangeAlerts, INTERESTING_STATUSES } from "@/lib/subscriptions";
import type { TestResult } from "@/lib/types";

function r(partial: Partial<TestResult> & { modelId: string }): TestResult {
  return {
    provider: "openrouter",
    status: "working",
    httpCode: 200,
    responseTimeMs: 100,
    supportsFunctionCalling: false,
    ...partial,
  };
}

describe("statusChangeAlerts", () => {
  it("emits alerts when a model moves into an interesting status", () => {
    const prev = new Map([
      ["a", r({ modelId: "a", status: "working" })],
      ["b", r({ modelId: "b", status: "working" })],
      ["c", r({ modelId: "c", status: "working" })],
    ]);
    const next = new Map([
      ["a", r({ modelId: "a", status: "timeout" })],
      ["b", r({ modelId: "b", status: "working" })],
      ["c", r({ modelId: "c", status: "removed" })],
    ]);
    const alerts = statusChangeAlerts(prev, next);
    expect(alerts.map((a) => a.modelId).sort()).toEqual(["a", "c"]);
    const timeout = alerts.find((a) => a.modelId === "a");
    expect(timeout?.previousStatus).toBe("working");
    expect(timeout?.currentStatus).toBe("timeout");
  });

  it("ignores brand-new models that never had a prior result", () => {
    const prev = new Map<string, TestResult>();
    const next = new Map([["new", r({ modelId: "new", status: "removed" })]]);
    expect(statusChangeAlerts(prev, next)).toHaveLength(0);
  });

  it("does not alert on working↔slow noise", () => {
    const prev = new Map([["a", r({ modelId: "a", status: "working" })]]);
    const next = new Map([["a", r({ modelId: "a", status: "slow" })]]);
    expect(statusChangeAlerts(prev, next)).toHaveLength(0);
  });

  it("lists the statuses worth notifying about", () => {
    expect(INTERESTING_STATUSES).toContain("timeout");
    expect(INTERESTING_STATUSES).toContain("rate-limited");
    expect(INTERESTING_STATUSES).toContain("removed");
    expect(INTERESTING_STATUSES).not.toContain("working");
    expect(INTERESTING_STATUSES).not.toContain("slow");
  });
});
