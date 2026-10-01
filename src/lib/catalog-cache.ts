import { fetchAllProviderModels } from "./providers";
import { TtlCache } from "./cache";
import type { ModelInfo, Provider } from "./types";

export interface Catalog {
  models: ModelInfo[];
  errors: Record<Provider, string | null>;
  rankingMeta: { asOf: string | null; sources: string[] };
}

// Provider catalogs change on the order of days. Serving every visitor's
// 5-minute poll straight through meant three upstream calls per poll per tab,
// each spending the server's API key, with no protection against a trivial
// request loop. One upstream read per TTL per instance is ample.
export const CATALOG_TTL_MS = 5 * 60 * 1000;

// Module-scoped on purpose: it survives across warm serverless invocations, so
// /api/models and /api/test-all share one upstream read per TTL per instance.
// Without the share, a "Test All" run's batches each re-fetched all three
// provider catalogs and the benchmark index.
const catalogCache = new TtlCache<Catalog>(CATALOG_TTL_MS);

/**
 * Returns the cached catalog, loading it on a miss. A wholly empty catalog is
 * an outage rather than an answer, so it is never cached.
 */
export async function getCachedCatalog(
  apiKey: string
): Promise<{ value: Catalog; hit: boolean; stale: boolean }> {
  return catalogCache.get(async () => {
    const result = await fetchAllProviderModels(apiKey);
    if (result.models.length === 0) {
      throw new Error("No models returned by any provider");
    }
    return result;
  });
}
