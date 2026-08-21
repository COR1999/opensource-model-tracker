import { NextRequest, NextResponse } from "next/server";
import { testModel, ModelInfo } from "@/lib/models";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const apiKey = process.env.NVIDIA_API_KEY || "";
  const { model } = await req.json();

  if (!model) {
    return NextResponse.json({ error: "model required" }, { status: 400 });
  }

  const result = await testModel(apiKey, model as ModelInfo);
  return NextResponse.json(result);
}
