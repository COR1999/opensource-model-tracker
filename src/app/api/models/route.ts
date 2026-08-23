import { NextResponse } from "next/server";
import { fetchNvidiaModels, fetchOpenCodeModels, fetchOpenRouterModels } from "@/lib/models";

export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.NVIDIA_API_KEY || "";

  try {
    const [nvidiaModels, openCodeModels, openRouterModels] = await Promise.allSettled([
      fetchNvidiaModels(apiKey),
      fetchOpenCodeModels(),
      fetchOpenRouterModels(),
    ]);

    const models = [
      ...(nvidiaModels.status === "fulfilled" ? nvidiaModels.value : []),
      ...(openCodeModels.status === "fulfilled" ? openCodeModels.value : []),
      ...(openRouterModels.status === "fulfilled" ? openRouterModels.value : []),
    ];

    return NextResponse.json({
      models,
      errors: {
        nvidia: nvidiaModels.status === "rejected" ? nvidiaModels.reason?.message : null,
        opencode: openCodeModels.status === "rejected" ? openCodeModels.reason?.message : null,
        openrouter: openRouterModels.status === "rejected" ? openRouterModels.reason?.message : null,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
