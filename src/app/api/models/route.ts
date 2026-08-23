import { NextResponse } from "next/server";
import { fetchAllProviderModels } from "@/lib/models";

export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.NVIDIA_API_KEY || "";

  try {
    const { models, errors } = await fetchAllProviderModels(apiKey);
    return NextResponse.json({ models, errors });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
