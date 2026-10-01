import { NextResponse } from "next/server";
import { getCachedCatalog, CATALOG_TTL_MS } from "@/lib/catalog-cache";

export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.NVIDIA_API_KEY || "";

  try {
    const { value, hit, stale } = await getCachedCatalog(apiKey);

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
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch model catalog" },
      { status: 502 }
    );
  }
}
