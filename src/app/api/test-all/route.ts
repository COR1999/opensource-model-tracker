import { NextRequest, NextResponse } from "next/server";
import { fetchAllProviderModels, runModelTests } from "@/lib/models";
import { isAuthorized } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Testing every model costs the server API key ~2 upstream calls per model, so
// cap how many models a single request may test.
const MAX_MODELS_PER_REQUEST = 25;

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const modelIds: unknown[] = Array.isArray(body?.modelIds)
    ? body.modelIds.filter((id: unknown) => typeof id === "string")
    : [];

  if (modelIds.length === 0) {
    return NextResponse.json(
      { error: "modelIds (non-empty array of strings) required" },
      { status: 400 }
    );
  }
  if (modelIds.length > MAX_MODELS_PER_REQUEST) {
    return NextResponse.json(
      { error: `Too many models per request (max ${MAX_MODELS_PER_REQUEST})` },
      { status: 400 }
    );
  }

  const apiKey = process.env.NVIDIA_API_KEY || "";
  const { models: all } = await fetchAllProviderModels(apiKey);
  const requested = new Set(modelIds as string[]);
  const models = all.filter((m) => requested.has(m.id));

  const results = await runModelTests(apiKey, models);
  return NextResponse.json({ results });
}
