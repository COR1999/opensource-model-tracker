import { NextResponse } from "next/server";
import { fetchAllProviderModels, type ModelInfo, type Provider } from "@/lib/models";
import { TtlCache } from "@/lib/cache";

export const dynamic = "force-dynamic";

interface Catalog {
  models: ModelInfo[];
  errors: Record<Provider, string | null>;
}

// Provider catalogs change on the order of days. Serving every visitor's
// 5-minute poll straight through meant three upstream calls per poll per tab,
// each spending the server's API key, with no protection against a trivial
// request loop. One upstream read per TTL per instance is ample.
const CATALOG_TTL_MS = 5 * 60 * 1000;
const catalogCache = new TtlCache<Catalog>(CATALOG_TTL_MS);

export async function GET() {
  const apiKey = process.env.NVIDIA_API_KEY || "";

  try {
    const { value, hit, stale } = await catalogCache.get(async () => {
      const result = await fetchAllProviderModels(apiKey);
      // Never cache a wholly empty catalog: that is an outage, not an answer,
      // and caching it would keep the dashboard blank for the full TTL.
      if (result.models.length === 0) {
        throw new Error("No models returned by any provider");
      }
      return result;
    });

    return NextResponse.json(
      { ...value, cached: hit, stale },
      {
        headers: {
          // Let the CDN absorb bursts too, and keep serving the last good copy
          // while a refresh is in flight.
          "Cache-Control": `public, s-maxage=${Math.floor(CATALOG_TTL_MS / 1000)}, stale-while-revalidate=600`,
          "X-Cache": hit ? (stale ? "STALE" : "HIT") : "MISS",
        },
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
