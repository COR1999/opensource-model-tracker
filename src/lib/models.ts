const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
const OPENCODE_BASE = "https://opencode-ai.vercel.app/api/v1";

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

// Models known to be consistently slow (>8s) — skip during test-all to save time
export const KNOWN_SLOW = new Set([
  "openai/gpt-oss-120b",
  "google/gemma-4-31b-it",
  "deepseek-ai/deepseek-v4-flash-0731",
  "minimaxai/minimax-m3",
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
    const res = await fetch(`${OPENCODE_BASE}/models`, {
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
    signal: AbortSignal.timeout(10000),
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

export function isKnownSlow(modelId: string): boolean {
  return KNOWN_SLOW.has(modelId);
}

// T3 Code model slugs from opencode.json cache
// T3 slugs: nvidia/org/model -> API id: org/model
// T3 slugs: opencode/model -> API id: opencode/model (unchanged)
export function normalizeT3Slug(slug: string): string {
  if (slug.startsWith("nvidia/")) {
    // nvidia/nvidia/llama-3.3-70b-instruct -> nvidia/llama-3.3-70b-instruct
    return slug.replace(/^nvidia\//, "");
  }
  return slug;
}

// Manually maintained list of T3-available model API IDs
// Derived from opencode.json cache — these are the models T3 actually exposes
export const T3_AVAILABLE_MODELS = new Set([
  "nvidia/nvidia/active-speaker-detection",
  "nvidia/baai/bge-m3",
  "opencode/big-pickle",
  "nvidia/bytedance/seed-oss-36b-instruct",
  "nvidia/nvidia/cosmos-reason2-8b",
  "nvidia/nvidia/cosmos-predict1-5b",
  "nvidia/nvidia/cosmos-transfer1-7b",
  "nvidia/nvidia/cosmos-transfer2_5-2b",
  "nvidia/deepseek-ai/deepseek-v4-flash",
  "nvidia/deepseek-ai/deepseek-v4-pro",
  "nvidia/abacusai/dracarys-llama-3.1-70b-instruct",
  "nvidia/meta/esm2-650m",
  "nvidia/meta/esmfold",
  "nvidia/black-forest-labs/flux.1-dev",
  "nvidia/black-forest-labs/flux_1-kontext-dev",
  "nvidia/black-forest-labs/flux_1-schnell",
  "nvidia/black-forest-labs/flux_2-klein-4b",
  "nvidia/google/gemma-2-2b-it",
  "nvidia/google/gemma-3-12b-it",
  "nvidia/google/gemma-3-4b-it",
  "nvidia/google/gemma-3n-e2b-it",
  "nvidia/google/gemma-3n-e4b-it",
  "nvidia/google/gemma-4-31b-it",
  "nvidia/nvidia/gliner-pii",
  "nvidia/z-ai/glm-5.2",
  "nvidia/openai/gpt-oss-20b",
  "nvidia/openai/gpt-oss-120b",
  "opencode/hy3-free",
  "nvidia/thinkingmachines/inkling",
  "nvidia/moonshotai/kimi-k3",
  "nvidia/poolside/laguna-xs-2.1",
  "nvidia/meta/llama-3.1-70b-instruct",
  "nvidia/meta/llama-3.1-8b-instruct",
  "nvidia/nvidia/llama-3.1-nemotron-70b-instruct",
  "nvidia/nvidia/llama-3.1-nemotron-nano-8b-v1",
  "nvidia/nvidia/llama-3.1-nemotron-nano-vl-8b-v1",
  "nvidia/nvidia/llama-3.1-nemotron-ultra-253b-v1",
  "nvidia/meta/llama-3.2-1b-instruct",
  "nvidia/meta/llama-3.2-3b-instruct",
  "nvidia/meta/llama-3.3-70b-instruct",
  "nvidia/nvidia/llama-3.3-nemotron-super-49b-v1",
  "nvidia/nvidia/llama-3.3-nemotron-super-49b-v1.5",
  "nvidia/meta/llama-4-maverick-17b-128e-instruct",
  "nvidia/nvidia/llama_3_2-nemoretriever-300m-embed-v1",
  "nvidia/nvidia/llama-nemotron-embed-vl-1b-v2",
  "nvidia/mistralai/magistral-small-2506",
  "nvidia/nvidia/magpie-tts-zeroshot",
  "opencode/mimo-v2.5-free",
  "nvidia/minimaxai/minimax-m2.7",
  "nvidia/minimaxai/minimax-m3",
  "nvidia/mistralai/ministral-14b-instruct-2512",
  "nvidia/mistralai/mistral-large-3-675b-instruct-2512",
  "nvidia/mistralai/mistral-medium-3-instruct",
  "nvidia/mistralai/mistral-medium-3.5-128b",
  "nvidia/mistralai/mistral-7b-instruct-v0.3",
  "nvidia/mistralai/mistral-nemotron",
  "nvidia/mistralai/mistral-small-4-119b-2603",
  "nvidia/mistralai/mixtral-8x22b-instruct",
  "nvidia/mistralai/mixtral-8x7b-instruct",
  "nvidia/meta/muse-glimmer-30b",
  "opencode/muse-spark-1.2-contributor-free",
  "nvidia/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
  "nvidia/nvidia/nemotron-3-super-120b-a12b",
  "nvidia/nvidia/nemotron-3-ultra-550b-a55b",
  "opencode/nemotron-3-ultra-free",
  "nvidia/nvidia/nemotron-3.5-lightning-30b-a3b",
  "opencode/nemotron-3.5-lightning-free",
  "nvidia/nvidia/nemotron-nano-12b-v2-vl",
  "nvidia/nvidia/nemotron-3-nano-30b-a3b",
  "nvidia/nvidia/nemotron-mini-4b-instruct",
  "nvidia/nvidia/nemotron-voicechat",
  "nvidia/nvidia/nv-embed-v1",
  "nvidia/nvidia/nv-embedcode-7b-v1",
  "nvidia/nvidia/nvidia-nemotron-nano-9b-v2",
  "opencode/x-preview-f-free",
  "nvidia/google/google-paligemma",
  "nvidia/microsoft/phi-4-multimodal-instruct",
  "nvidia/microsoft/phi-4-mini-instruct",
  "nvidia/qwen/qwen-image",
  "nvidia/qwen/qwen-image-edit",
  "nvidia/qwen/qwen2.5-coder-32b-instruct",
  "nvidia/qwen/qwen3-coder-480b-a35b-instruct",
  "nvidia/qwen/qwen3-next-80b-a3b-instruct",
  "nvidia/qwen/qwen3.5-122b-a10b",
  "nvidia/qwen/qwen3.5-397b-a17b",
  "nvidia/nvidia/riva-translate-4b-instruct-v1.1",
  "nvidia/sarvamai/sarvam-m",
  "nvidia/upstage/solar-10.7b-instruct",
  "nvidia/nvidia/sparsedrive",
  "nvidia/stepfun-ai/step-3.5-flash",
  "nvidia/stepfun-ai/step-3.7-flash",
  "nvidia/nvidia/streampetr",
  "nvidia/nvidia/studiovoice",
  "nvidia/nvidia/synthetic-video-detector",
  "nvidia/nvidia/usdcode",
  "nvidia/nvidia/usdvalidate",
  "nvidia/openai/whisper-large-v3",
  // Fallback for API IDs that don't have the double prefix
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/nemotron-3-ultra-550b-a55b",
  "nvidia/nemotron-3-nano-30b-a3b",
  "nvidia/nemotron-mini-4b-instruct",
  "meta/llama-3.3-70b-instruct",
  "meta/llama-3.1-70b-instruct",
  "meta/llama-3.1-8b-instruct",
  "meta/llama-3.2-1b-instruct",
  "meta/llama-3.2-3b-instruct",
  "meta/llama-3.1-8b-instruct",
  "meta/llama-4-maverick-17b-128e-instruct",
  "mistralai/mistral-nemotron",
  "mistralai/mistral-medium-3.5-128b",
  "mistralai/mistral-large-3-675b-instruct-2512",
  "mistralai/magistral-small-2506",
  "deepseek-ai/deepseek-v4-flash",
  "deepseek-ai/deepseek-v4-pro",
  "google/gemma-4-31b-it",
  "google/gemma-3-12b-it",
  "google/gemma-3-4b-it",
  "qwen/qwen3-coder-480b-a35b-instruct",
  "qwen/qwen3.5-397b-a17b",
  "qwen/qwen2.5-coder-32b-instruct",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "moonshotai/kimi-k3",
  "minimaxai/minimax-m3",
  "minimaxai/minimax-m2.7",
  "thinkingmachines/inkling",
  "poolside/laguna-xs-2.1",
  "microsoft/phi-4-mini-instruct",
  "bytedance/seed-oss-36b-instruct",
  "abacusai/dracarys-llama-3.1-70b-instruct",
  "stepfun-ai/step-3.5-flash",
  "stepfun-ai/step-3.7-flash",
  "z-ai/glm-5.2",
  "sarvamai/sarvam-m",
  "upstage/solar-10.7b-instruct",
]);

export function isT3Available(modelId: string): boolean {
  // Check direct match
  if (T3_AVAILABLE_MODELS.has(modelId)) return true;
  // Check with nvidia/ prefix (T3 slugs)
  if (T3_AVAILABLE_MODELS.has(`nvidia/${modelId}`)) return true;
  // Check without nvidia/ prefix (API IDs)
  if (modelId.startsWith("nvidia/") && T3_AVAILABLE_MODELS.has(modelId.replace(/^nvidia\//, ""))) return true;
  return false;
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
    const baseUrl = model.provider === "opencode" ? OPENCODE_BASE : NVIDIA_BASE;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (model.provider === "nvidia" && apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    // Step 1: Test without tools — just check if model responds
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
      // Handle "auto" tool choice error — means model exists but tools not configured
      const isToolError = body.includes("tool choice") || body.includes("tool-call-parser");
      return {
        modelId: model.id,
        provider: model.provider,
        status: isToolError ? "working" : "error",
        httpCode: res.status,
        responseTimeMs: elapsed,
        supportsFunctionCalling: false,
        error: isToolError ? undefined : body.slice(0, 200),
      };
    }

    // Parse (and thus validate) the response even though the body is unused
    await res.json();

    // Step 2: Probe function calling separately (best-effort, don't fail the test)
    let hasTools = false;
    try {
      const toolRes = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: model.provider === "opencode" ? model.id.replace("opencode/", "") : model.id,
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 5,
          tools: TOOLS_PAYLOAD,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (toolRes.ok) {
        const toolData = await toolRes.json();
        hasTools = !!toolData.choices?.[0]?.message?.tool_calls?.length;
      }
      // If tools probe fails with 400, model just doesn't support tools — that's fine
    } catch {
      // Tools probe failed — model doesn't support function calling
    }

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
    // controller.abort() throws AbortError; AbortSignal.timeout() throws
    // TimeoutError — both mean the model didn't answer in time. Message
    // sniffing misses TimeoutError ("The operation timed out").
    const isTimeout =
      err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
    return {
      modelId: model.id,
      provider: model.provider,
      status: isTimeout ? "timeout" : "error",
      httpCode: 0,
      responseTimeMs: elapsed,
      supportsFunctionCalling: false,
      error: msg,
    };
  }
}
