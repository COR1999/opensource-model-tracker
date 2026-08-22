import { NextRequest, NextResponse } from "next/server";
import { testModel, ModelInfo } from "@/lib/models";
import { isAuthorized } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let model: ModelInfo | undefined;
  try {
    ({ model } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const apiKey = process.env.NVIDIA_API_KEY || "";

  if (!model || typeof model.id !== "string" || typeof model.provider !== "string") {
    return NextResponse.json({ error: "model required" }, { status: 400 });
  }

  const result = await testModel(apiKey, model as ModelInfo);
  return NextResponse.json(result);
}
