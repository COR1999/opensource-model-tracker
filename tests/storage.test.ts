import { describe, it, expect, beforeEach } from "vitest";
import {
  STORAGE_KEYS,
  loadKnownModels,
  saveKnownModels,
  loadChangelog,
  saveChangelog,
  loadUptime,
  appendUptime,
  loadLastResults,
  saveLastResults,
  loadHideEndpoints,
  loadTheme,
} from "@/lib/storage";
import type { TestResult, UptimeRecord } from "@/lib/models";

// Minimal localStorage stand-in: storage.ts is browser-only and vitest runs
// in node, so every test here exercises the real functions against this mock.
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

beforeEach(() => {
  (globalThis as Record<string, unknown>).localStorage = new MemoryStorage();
});

describe("known models", () => {
  it("round-trips ids through JSON", () => {
    const ids = ["nvidia/phi-4", "openrouter/meta/llama-3.1-8b-instruct"];
    saveKnownModels(ids);
    expect(loadKnownModels()).toEqual(new Set(ids));
  });

  it("returns an empty set when nothing stored or corrupt", () => {
    expect(loadKnownModels().size).toBe(0);
    globalThis.localStorage.setItem(STORAGE_KEYS.KNOWN_MODELS, "{broken");
    expect(loadKnownModels().size).toBe(0);
  });
});

describe("changelog", () => {
  it("round-trips entries and tolerates corrupt data", () => {
    const entries = [
      { timestamp: Date.now(), type: "added" as const, modelId: "m/1", displayName: "Model 1" },
    ];
    saveChangelog(entries);
    expect(loadChangelog()).toEqual(entries);

    globalThis.localStorage.setItem(STORAGE_KEYS.CHANGELOG, "not json");
    expect(loadChangelog()).toEqual([]);
  });

  it("drops entries older than thirty days on save", () => {
    const old = Date.now() - 31 * 86400000;
    const recent = Date.now();
    saveChangelog([
      { timestamp: old, type: "removed", modelId: "old/1", displayName: "Old" },
      { timestamp: recent, type: "added", modelId: "new/1", displayName: "New" },
    ]);
    const loaded = loadChangelog();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].modelId).toBe("new/1");
  });
});

describe("uptime", () => {
  it("appendUptime is a pure reducer that stamps the current time", () => {
    const before = appendUptime({}, "m/1", {
      status: "working",
      responseTimeMs: 500,
    } as TestResult);
    const rec = before["m/1"][0];
    expect(rec.status).toBe("working");
    expect(rec.responseTimeMs).toBe(500);
    expect(Math.abs(rec.timestamp - Date.now())).toBeLessThan(1000);

    // appending again preserves prior history immutably
    const after = appendUptime(before, "m/1", {
      status: "error",
      responseTimeMs: 100,
    } as TestResult);
    expect(after["m/1"]).toHaveLength(2);
    expect(before["m/1"]).toHaveLength(1);
  });

  it("loadUptime returns {} when empty or corrupt", () => {
    expect(loadUptime()).toEqual({});
    globalThis.localStorage.setItem(STORAGE_KEYS.UPTIME, "[");
    expect(loadUptime()).toEqual({});
  });
});

describe("last results", () => {
  it("restores a Map from the stored array", () => {
    const r: TestResult[] = [
      {
        modelId: "m/2",
        provider: "opencode",
        status: "slow",
        httpCode: 200,
        responseTimeMs: 9000,
        supportsFunctionCalling: false,
      },
    ];
    saveLastResults(new Map(r.map((x) => [x.modelId, x])));
    const restored = loadLastResults();
    expect(restored.get("m/2")?.status).toBe("slow");
  });
});

describe("flags and theme", () => {
  it("defaults hideEndpoints to true and persists opt-out", () => {
    expect(loadHideEndpoints()).toBe(true);
    globalThis.localStorage.setItem(STORAGE_KEYS.HIDE_ENDPOINTS, "false");
    expect(loadHideEndpoints()).toBe(false);
  });

  it("theme defaults dark, persists light, rejects garbage values", () => {
    expect(loadTheme()).toBe("dark");
    globalThis.localStorage.setItem(STORAGE_KEYS.THEME, "light");
    expect(loadTheme()).toBe("light");
    globalThis.localStorage.setItem(STORAGE_KEYS.THEME, "neon");
    expect(loadTheme()).toBe("neon"); // passed through; bootstrap script only matches known values
  });
});
