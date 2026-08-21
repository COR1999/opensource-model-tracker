const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";

export type Provider = "nvidia" | "opencode";

export type ModelCategory = "chat" | "code" | "vision" | "embedding" | "audio" | "other";

export interface ModelInfo {
  id: string;
  displayName: string;
  provider: Provider;
  ownedBy: string;
  category: ModelCategory;
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

export interface UptimeRecord {
  timestamp: number;
  status: TestResult["status"];
  responseTimeMs: number;
}

// Models known to break with T3 Code (Chat Completions endpoint)
// GPT-OSS models only support Responses API (v1/responses), not Chat Completions
export const T3_KNOWN_BREAKING = new Set([
  "openai/gpt-oss-20b",
]);

// Manual category mapping for known NVIDIA models
const CATEGORY_MAP: Record<string, ModelCategory> = {
  // Chat / General
  "meta/llama-3.3-70b-instruct": "chat",
  "meta/llama-3.1-8b-instruct": "chat",
  "meta/llama-3.1-70b-instruct": "chat",
  "meta/llama-3.1-405b-instruct": "chat",
  "mistralai/mistral-large-2-instruct": "chat",
  "mistralai/mistral-nemo-12b-instruct": "chat",
  "google/gemma-2-9b-it": "chat",
  "google/gemma-4-31b-it": "chat",
  "nvidia/nemotron-3-super-120b-a12b": "chat",
  "nvidia/nemotron-3.5-lightning-30b-a3b": "chat",
  "nvidia/llama-3.3-nemotron-super-49b-v1.5": "chat",
  "thinkingmachines/inkling": "chat",
  "minimaxai/minimax-m3": "chat",
  "moonshotai/kimi-k3": "chat",
  "deepseek-ai/deepseek-r1": "chat",
  "deepseek-ai/deepseek-v3-0324": "chat",
  "openai/gpt-oss-120b": "chat",
  "openai/gpt-oss-20b": "chat",
  "poolside/laguna-xs-2.1": "chat",

  // Code
  "deepseek-ai/deepseek-coder-6.7b-instruct": "code",
  "nvidia/llama-3.1-nemotron-ultra-253b-v1": "code",

  // Vision
  "nvidia/neva-22b": "vision",
  "meta/llama-3.2-11b-vision-instruct": "vision",
  "meta/llama-3.2-90b-vision-instruct": "vision",

  // Embedding
  "nvidia/nv-embedqa-e5-v5": "embedding",
  "nvidia/nv-embed-v1": "embedding",
  "snowflake/arctic-embed-l": "embedding",

  // Audio
  "nvidia/fastpitch-hifigan-tts": "audio",
  "nvidia/riva-tts": "audio",
};

function inferCategory(id: string): ModelCategory {
  if (CATEGORY_MAP[id]) return CATEGORY_MAP[id];
  const lower = id.toLowerCase();
  if (lower.includes("embed")) return "embedding";
  if (lower.includes("vision") || lower.includes("neva")) return "vision";
  if (lower.includes("coder") || lower.includes("code")) return "code";
  if (lower.includes("tts") || lower.includes("speech") || lower.includes("audio") || lower.includes("whisper")) return "audio";
  return "other";
}

// OpenCode free tier models — discovered from API
export async function fetchOpenCodeModels(): Promise<ModelInfo[]> {
  try {
    const res = await fetch("https://opencode-ai.vercel.app/api/v1/models", {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return FALLBACK_OPENCODE_MODELS;
    const data = await res.json();
    const models: ModelInfo[] = (data.data || [])
      .filter((m: { id: string }) => m.id && !m.id.includes("embedding"))
      .map((m: { id: string; owned_by?: string }) => ({
        id: `opencode/${m.id}`,
        displayName: m.id.split("/").pop() || m.id,
        provider: "opencode" as Provider,
        ownedBy: m.owned_by || "opencode",
        category: inferCategory(m.id),
      }));
    return models.length > 0 ? models : FALLBACK_OPENCODE_MODELS;
  } catch {
    return FALLBACK_OPENCODE_MODELS;
  }
}

const FALLBACK_OPENCODE_MODELS: ModelInfo[] = [
  { id: "opencode/mimo-v2.5-free", displayName: "MiMo V2.5 Free", provider: "opencode", ownedBy: "opencode", category: "code" },
  { id: "opencode/hy3-free", displayName: "Hy3 Free", provider: "opencode", ownedBy: "opencode", category: "chat" },
  { id: "opencode/big-pickle", displayName: "Big Pickle", provider: "opencode", ownedBy: "opencode", category: "chat" },
];

export async function fetchNvidiaModels(apiKey: string): Promise<ModelInfo[]> {
  const res = await fetch(`${NVIDIA_BASE}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
  const data = await res.json();
  return data.data.map((m: { id: string; owned_by: string }) => ({
    id: m.id,
    displayName: m.id.split("/").pop() || m.id,
    provider: "nvidia" as Provider,
    ownedBy: m.owned_by,
    category: inferCategory(m.id),
  }));
}

export function nvidiaModelUrl(modelId: string): string {
  return `https://build.nvidia.com/${modelId}`;
}

export function isT3Breaking(modelId: string): boolean {
  return T3_KNOWN_BREAKING.has(modelId);
}

// Tools definition for function-calling detection
const TOOLS_PAYLOAD = [
  {
    type: "function" as const,
    function: {
      name: "get_weather",
      description: "Get current weather for a location",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "City name" },
        },
        required: ["location"],
      },
    },
  },
];

export async function testModel(
  apiKey: string,
  model: ModelInfo
): Promise<TestResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
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
        tools: TOOLS_PAYLOAD,
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
      status: elapsed > 5000 ? "slow" : "working",
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
