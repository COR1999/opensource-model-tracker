import { NextRequest, NextResponse } from "next/server";
import { testModel, fetchNvidiaModels, fetchOpenCodeModels, fetchOpenRouterModels, ModelInfo } from "@/lib/models";
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
  const modelIds = Array.isArray(body?.modelIds)
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

  const [nvidiaModels, openCodeModels, openRouterModels] = await Promise.allSettled([
    fetchNvidiaModels(apiKey),
    fetchOpenCodeModels(),
    fetchOpenRouterModels(),
  ]);
  const all = [
    ...(nvidiaModels.status === "fulfilled" ? nvidiaModels.value : []),
    ...(openCodeModels.status === "fulfilled" ? openCodeModels.value : []),
    ...(openRouterModels.status === "fulfilled" ? openRouterModels.value : []),
  ];
  const models: ModelInfo[] = all.filter((m) => modelIds.includes(m.id));

  const CONCURRENCY = 10;
  const results = [];
  for (let i = 0; i < models.length; i += CONCURRENCY) {
    const batch = models.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map((m) => testModel(apiKey, m))
    );
    for (let j = 0; j < batchResults.length; j++) {
      const r = batchResults[j];
      if (r.status === "fulfilled") {
        results.push(r.value);
      } else {
        results.push({
          modelId: batch[j].id,
          provider: batch[j].provider,
          status: "error" as const,
          httpCode: 0,
          responseTimeMs: 0,
          supportsFunctionCalling: false,
          error: r.reason?.message || "Test failed",
        });
      }
    }
  }

  return NextResponse.json({ results });
}
