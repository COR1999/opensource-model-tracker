import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TtlCache } from "@/lib/cache";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("TtlCache", () => {
  it("loads once and serves the cached value until the TTL expires", async () => {
    const load = vi.fn().mockResolvedValue("v1");
    const cache = new TtlCache<string>(1000);

    expect(await cache.get(load)).toEqual({ value: "v1", hit: false, stale: false });
    expect(await cache.get(load)).toEqual({ value: "v1", hit: true, stale: false });
    expect(load).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 1001);
    load.mockResolvedValue("v2");
    expect(await cache.get(load)).toEqual({ value: "v2", hit: false, stale: false });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent misses into a single upstream call", async () => {
    let resolve!: (v: string) => void;
    const load = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const cache = new TtlCache<string>(1000);

    const all = Promise.all([cache.get(load), cache.get(load), cache.get(load)]);
    resolve("shared");
    const results = await all;

    // A cold start under load must not fan out one upstream fetch per request.
    expect(load).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.value)).toEqual(["shared", "shared", "shared"]);
  });

  it("serves the stale entry when a refresh fails inside the grace window", async () => {
    const load = vi.fn().mockResolvedValue("good");
    const cache = new TtlCache<string>(1000, 10_000);
    await cache.get(load);

    vi.setSystemTime(Date.now() + 1500);
    load.mockRejectedValue(new Error("upstream down"));
    const res = await cache.get(load);

    expect(res).toEqual({ value: "good", hit: true, stale: true });
  });

  it("propagates the error once the stale entry ages past the grace window", async () => {
    const load = vi.fn().mockResolvedValue("good");
    const cache = new TtlCache<string>(1000, 5000);
    await cache.get(load);

    vi.setSystemTime(Date.now() + 6000);
    load.mockRejectedValue(new Error("upstream down"));
    await expect(cache.get(load)).rejects.toThrow("upstream down");
  });

  it("propagates the error when there is nothing cached to fall back to", async () => {
    const cache = new TtlCache<string>(1000);
    await expect(cache.get(() => Promise.reject(new Error("cold failure")))).rejects.toThrow(
      "cold failure"
    );
  });

  it("recovers after a failure rather than latching the rejected promise", async () => {
    const cache = new TtlCache<string>(1000);
    await expect(cache.get(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    // inFlight must be cleared in `finally`, or every later call would reuse
    // the rejected promise and the cache would be permanently poisoned.
    expect(await cache.get(() => Promise.resolve("recovered"))).toEqual({
      value: "recovered",
      hit: false,
      stale: false,
    });
  });

  it("reports age and freshness without triggering a load", async () => {
    const cache = new TtlCache<string>(1000);
    expect(cache.peek()).toBeNull();
    expect(cache.age).toBeNull();

    await cache.get(() => Promise.resolve("v"));
    expect(cache.peek()).toEqual({ value: "v", fresh: true });

    vi.setSystemTime(Date.now() + 1500);
    expect(cache.peek()).toEqual({ value: "v", fresh: false });
    expect(cache.age).toBe(1500);
  });

  it("clear() forces the next read to reload", async () => {
    const load = vi.fn().mockResolvedValue("v");
    const cache = new TtlCache<string>(10_000);
    await cache.get(load);
    cache.clear();
    await cache.get(load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
