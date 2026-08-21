const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";

export type Provider = "nvidia" | "opencode";

export interface RawModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface ModelInfo {
  id: string;
  displayName: string;
  provider: Provider;
  ownedBy: string;
}

export interface TestResult {
  modelId: string;
  provider: Provider;
  status: "working" | "slow" | "error" | "timeout" | "removed";
  httpCode: number;
  responseTimeMs: number;
  supportsFunctionCalling: boolean;
  error?: string;
}

// OpenCode free tier models (curated list - these are known free models)
export const OPENCODE_FREE_MODELS: ModelInfo[] = [
  { id: "opencode/mimo-v2.5-free", displayName: "MiMo V2.5 Free", provider: "opencode", ownedBy: "opencode" },
  { id: "opencode/hy3-free", displayName: "Hy3 Free", provider: "opencode", ownedBy: "opencode" },
  { id: "opencode/big-pickle", displayName: "Big Pickle", provider: "opencode", ownedBy: "opencode" },
];

export async function fetchNvidiaModels(apiKey: string): Promise<ModelInfo[]> {
  const res = await fetch(`${NVIDIA_BASE}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
  const data = await res.json();
  return data.data.map((m: RawModel) => ({
    id: m.id,
    displayName: m.id.split("/").pop() || m.id,
    provider: "nvidia" as Provider,
    ownedBy: m.owned_by,
  }));
}

// For OpenCode models, we try the OpenCode API endpoint
// These are free community models routed through OpenCode
export async function fetchOpenCodeModels(): Promise<ModelInfo[]> {
  // OpenCode free models are static - we know what they are
  return OPENCODE_FREE_MODELS;
}

export async function testModel(
  apiKey: string,
  model: ModelInfo
): Promise<TestResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    // For OpenCode models, use the OpenCode API
    const baseUrl = model.provider === "opencode"
      ? "https://opencode-ai.vercel.app/api/v1"
      : NVIDIA_BASE;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: model.provider === "opencode" ? model.id.replace("opencode/", "") : model.id,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const elapsed = Date.now() - start;

    if (res.status === 410 || res.status === 404) {
      return {
        modelId: model.id,
        provider: model.provider,
        status: "removed",
        httpCode: res.status,
        responseTimeMs: elapsed,
        supportsFunctionCalling: false,
      };
    }

    if (!res.ok) {
      const body = await res.text();
      return {
        modelId: model.id,
        provider: model.provider,
        status: "error",
        httpCode: res.status,
        responseTimeMs: elapsed,
        supportsFunctionCalling: false,
        error: body.slice(0, 200),
      };
    }

    const data = await res.json();
    const hasTools = !!data.choices?.[0]?.message?.tool_calls?.length;

    return {
      modelId: model.id,
      provider: model.provider,
      status: elapsed > 15000 ? "slow" : "working",
      httpCode: 200,
      responseTimeMs: elapsed,
      supportsFunctionCalling: hasTools,
    };
  } catch (err: unknown) {
    clearTimeout(timeout);
    const elapsed = Date.now() - start;
    const msg = err instanceof Error ? err.message : "Unknown error";
    return {
      modelId: model.id,
      provider: model.provider,
      status: msg.includes("abort") ? "timeout" : "error",
      httpCode: 0,
      responseTimeMs: elapsed,
      supportsFunctionCalling: false,
      error: msg,
    };
  }
}
