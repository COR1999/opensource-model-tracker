import { NextRequest, NextResponse } from "next/server";
import { testModel, ModelInfo, Provider } from "@/lib/models";
import { isAuthorized } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function parseModel(value: unknown): ModelInfo | null {
  if (typeof value !== "object" || value === null) return null;
  const m = value as Record<string, unknown>;
  if (typeof m.id !== "string" || !m.id) return null;
  if (m.provider !== "nvidia" && m.provider !== "opencode") return null;
  return {
    id: m.id,
    displayName: typeof m.displayName === "string" ? m.displayName : m.id,
    provider: m.provider as Provider,
    ownedBy: typeof m.ownedBy === "string" ? m.ownedBy : "unknown",
    category:
      m.category === "chat" || m.category === "code" || m.category === "vision"
        || m.category === "embedding" || m.category === "audio" || m.category === "other"
        ? m.category
        : "other",
  };
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.NVIDIA_API_KEY || "";
  const body = await req.json().catch(() => null);
  const model = parseModel(body?.model);

  if (!model) {
    return NextResponse.json(
      { error: "model required with string id and provider of nvidia or opencode" },
      { status: 400 }
    );
  }

  const result = await testModel(apiKey, model);
  return NextResponse.json(result);
}
