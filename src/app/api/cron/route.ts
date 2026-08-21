import { NextResponse } from "next/server";
import { testModel, fetchNvidiaModels, fetchOpenCodeModels } from "@/lib/models";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.NVIDIA_API_KEY || "";

  const [nvidiaModels, openCodeModels] = await Promise.allSettled([
    fetchNvidiaModels(apiKey),
    fetchOpenCodeModels(),
  ]);

  const models = [
    ...(nvidiaModels.status === "fulfilled" ? nvidiaModels.value : []),
    ...(openCodeModels.status === "fulfilled" ? openCodeModels.value : []),
  ];

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

  const working = results.filter((r) => r.status === "working").length;
  const errors = results.filter((r) => r.status === "error" || r.status === "timeout").length;
  const removed = results.filter((r) => r.status === "removed").length;

  const summary = {
    timestamp: Date.now(),
    total: results.length,
    working,
    errors,
    removed,
    results,
  };

  return NextResponse.json(summary);
}
