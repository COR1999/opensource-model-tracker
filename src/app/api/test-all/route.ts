import { NextRequest, NextResponse } from "next/server";
import { testModel, fetchNvidiaModels, fetchOpenCodeModels, ModelInfo } from "@/lib/models";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const apiKey = process.env.NVIDIA_API_KEY || "";
  const { modelIds } = await req.json();

  let models: ModelInfo[] = [];
  if (modelIds && modelIds.length > 0) {
    const [nvidiaModels, openCodeModels] = await Promise.allSettled([
      fetchNvidiaModels(apiKey),
      fetchOpenCodeModels(),
    ]);
    const all = [
      ...(nvidiaModels.status === "fulfilled" ? nvidiaModels.value : []),
      ...(openCodeModels.status === "fulfilled" ? openCodeModels.value : []),
    ];
    models = all.filter((m) => modelIds.includes(m.id));
  } else {
    const [nvidiaModels, openCodeModels] = await Promise.allSettled([
      fetchNvidiaModels(apiKey),
      fetchOpenCodeModels(),
    ]);
    models = [
      ...(nvidiaModels.status === "fulfilled" ? nvidiaModels.value : []),
      ...(openCodeModels.status === "fulfilled" ? openCodeModels.value : []),
    ];
  }

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
