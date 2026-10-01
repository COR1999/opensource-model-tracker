// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StrictMode, type ReactNode } from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useModelTesting } from "@/hooks/useModelTesting";
import type { ModelInfo } from "@/lib/types";

const sampleModel: ModelInfo = {
  id: "opencode/big-pickle",
  displayName: "Big Pickle",
  provider: "opencode",
  ownedBy: "opencode",
  category: "chat",
};

const originalFetch = globalThis.fetch;
const WEBHOOK = "https://hooks.example.com/alert";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <StrictMode>{children}</StrictMode>
);

describe("useModelTesting webhook dispatch", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("dispatches each status-change webhook exactly once under StrictMode", async () => {
    // Previous run said "working"; this run reports "error", which is an
    // interesting status and must alert the subscriber.
    localStorage.setItem(
      "model-tracker-last-results",
      JSON.stringify([
        {
          modelId: "opencode/big-pickle",
          provider: "opencode",
          status: "working",
          httpCode: 200,
          responseTimeMs: 100,
          supportsFunctionCalling: false,
        },
      ])
    );
    localStorage.setItem(
      "model-tracker-subscriptions",
      JSON.stringify([
        { id: "wh_1", url: WEBHOOK, modelIds: [], createdAt: 1 },
      ])
    );

    const webhookCalls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("hooks.example.com")) {
        webhookCalls.push(url);
        return jsonResponse({ ok: true });
      }
      if (url.includes("/api/uptime")) return jsonResponse({ days: {} });
      if (url.includes("/api/test")) {
        return jsonResponse({
          modelId: "opencode/big-pickle",
          provider: "opencode",
          status: "error",
          httpCode: 500,
          responseTimeMs: 50,
          supportsFunctionCalling: false,
          error: "boom",
        });
      }
      return jsonResponse({});
    }) as typeof fetch;

    const { result } = renderHook(() => useModelTesting(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    await act(async () => {
      await result.current.testOne(sampleModel);
    });

    await waitFor(() => expect(result.current.results.get("opencode/big-pickle")?.status).toBe("error"));
    // Give any duplicate dispatch a chance to land before asserting.
    await new Promise((r) => setTimeout(r, 50));

    // Webhook dispatch runs inside a setState updater today. React re-invokes
    // updaters, so the subscriber gets the same alert more than once.
    expect(webhookCalls).toHaveLength(1);
  });
});
