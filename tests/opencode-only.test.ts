import { describe, it, expect } from "vitest";
import { isOpenCodeOnlyBody, isOpencodeAppOnlyModel } from "@/lib/testing";
import { statusLabel, statusColor, statusDot } from "@/lib/display";
import { decodeSnapshot, encodeSnapshot } from "@/lib/share";
import type { TestResult } from "@/lib/types";

describe("OpenCode app-only detection", () => {
  it("detects FreeTierError bodies from Zen", () => {
    expect(
      isOpenCodeOnlyBody(
        JSON.stringify({
          type: "error",
          error: { type: "FreeTierError", message: "OpenCode's free tier can only be used from within OpenCode" },
        })
      )
    ).toBe(true);
    expect(isOpenCodeOnlyBody("rate limit exceeded")).toBe(false);
  });

  it("marks Zen free ids as app-only for automated skips", () => {
    expect(isOpencodeAppOnlyModel({ id: "opencode/big-pickle", provider: "opencode" })).toBe(true);
    expect(
      isOpencodeAppOnlyModel({ id: "opencode/mimo-v2.5-free", provider: "opencode" })
    ).toBe(true);
    expect(
      isOpencodeAppOnlyModel({ id: "opencode/space-bunny-free", provider: "opencode" })
    ).toBe(true);
    expect(
      isOpencodeAppOnlyModel({ id: "openrouter/z-ai/glm-5.2:free", provider: "openrouter" })
    ).toBe(false);
    expect(
      isOpencodeAppOnlyModel({ id: "meta/llama-3.3-70b-instruct", provider: "nvidia" })
    ).toBe(false);
  });
});

describe("opencode-only display + share", () => {
  it("labels distinctly from generic error", () => {
    expect(statusLabel("opencode-only")).toBe("OpenCode only");
    expect(statusColor("opencode-only", "dark")).not.toBe(statusColor("error", "dark"));
    expect(statusDot("opencode-only")).not.toBe(statusDot("error"));
  });

  it("round-trips through share snapshots", () => {
    const result: TestResult = {
      modelId: "opencode/big-pickle",
      provider: "opencode",
      status: "opencode-only",
      httpCode: 403,
      responseTimeMs: 100,
      supportsFunctionCalling: false,
      error: "FreeTierError",
    };
    const decoded = decodeSnapshot(encodeSnapshot({ ts: 1, results: [result] }));
    expect(decoded.valid).toBe(true);
    expect(decoded.results[0]?.status).toBe("opencode-only");
  });
});
