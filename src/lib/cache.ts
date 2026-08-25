/**
 * Minimal single-flight TTL cache for upstream catalog reads.
 *
 * Module state survives across warm serverless invocations, so this collapses
 * the repeated discovery calls every visitor's 5-minute poll used to make into
 * roughly one upstream fetch per TTL per instance. `inFlight` additionally
 * coalesces concurrent misses so a cold start under load issues one fetch
 * rather than one per request.
 */
export interface CacheEntry<T> {
  value: T;
  storedAt: number;
}

export class TtlCache<T> {
  private entry: CacheEntry<T> | null = null;
  private inFlight: Promise<T> | null = null;

  constructor(
    private readonly ttlMs: number,
    /**
     * How long a stale entry may still be served if a refresh fails. Keeps the
     * dashboard populated through an upstream outage instead of emptying it.
     */
    private readonly staleWhileErrorMs = ttlMs * 12
  ) {}

  get age(): number | null {
    return this.entry ? Date.now() - this.entry.storedAt : null;
  }

  peek(): { value: T; fresh: boolean } | null {
    if (!this.entry) return null;
    return { value: this.entry.value, fresh: Date.now() - this.entry.storedAt < this.ttlMs };
  }

  async get(load: () => Promise<T>): Promise<{ value: T; hit: boolean; stale: boolean }> {
    const now = Date.now();
    if (this.entry && now - this.entry.storedAt < this.ttlMs) {
      return { value: this.entry.value, hit: true, stale: false };
    }

    if (!this.inFlight) {
      this.inFlight = load()
        .then((value) => {
          this.entry = { value, storedAt: Date.now() };
          return value;
        })
        .finally(() => {
          this.inFlight = null;
        });
    }

    try {
      const value = await this.inFlight;
      return { value, hit: false, stale: false };
    } catch (err) {
      // Serve stale rather than nothing while the entry is still within the
      // grace window; a transient upstream failure should not blank the UI.
      if (this.entry && Date.now() - this.entry.storedAt < this.staleWhileErrorMs) {
        return { value: this.entry.value, hit: true, stale: true };
      }
      throw err;
    }
  }

  clear(): void {
    this.entry = null;
  }
}
