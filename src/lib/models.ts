const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
const OPENCODE_BASE = "https://opencode.ai/zen/v1";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export type Provider = "nvidia" | "opencode" | "openrouter";

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

  // Chat / Code models seen on OpenRouter and Zen whose ids carry no
  // inferable keyword; keyed by org/model so one entry serves every provider
  "z-ai/glm-5.2": "chat",
  "dots-studio/dots-3-note-preview": "chat",
  "liquid/lfm-2.5-2.6b": "chat",
  "thinkingmachines/inkling-small": "chat",
  "stepfun-ai/step-3.5-flash": "chat",
  "stepfun-ai/step-3.7-flash": "chat",
  "sarvamai/sarvam-m": "chat",
  "upstage/solar-10.7b-instruct": "chat",
  "google/gemma-4-26b-a4b-it": "chat",
  "nvidia/nemotron-nano-9b-v2": "chat",
  "nvidia/nemotron-3-ultra-550b-a55b": "chat",
  "nvidia/nemotron-3-nano-30b-a3b": "chat",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning": "chat",
  "minimaxai/minimax-m2.7": "chat",
  "qwen/qwen3-next-80b-a3b-instruct": "chat",
  "qwen/qwen3.5-122b-a10b": "chat",
  "qwen/qwen3.5-397b-a17b": "chat",
  "poolside/laguna-s-2.1": "code",
  "cohere/north-mini-code": "code",
};

export function inferCategory(rawId: string): ModelCategory {
  // OpenRouter free ids carry a ":free" suffix that would hide category hints
  const id = rawId.replace(/:free$/, "");
  // Providers namespace the same model differently ("z-ai/glm-5.2" vs
  // "nvidia/z-ai/glm-5.2"); fall back to progressively shorter suffixes so a
  // mapping for one provider also classifies the others.
  const parts = id.split("/");
  const candidates = [id, parts.slice(-2).join("/"), parts[parts.length - 1]];
  for (const key of candidates) {
    if (CATEGORY_MAP[key]) return CATEGORY_MAP[key];
  }
  const lower = id.toLowerCase();
  if (lower.includes("embed")) return "embedding";
  if (lower.includes("vision") || lower.includes("neva")) return "vision";
  if (lower.includes("-vl") || lower.endsWith("vl")) return "vision";
  if (lower.includes("coder") || lower.includes("code")) return "code";
  if (lower.includes("tts") || lower.includes("speech") || lower.includes("audio") || lower.includes("whisper")) return "audio";
  return "other";
}

// OpenCode Zen free tier — gateway lists paid models too; keep only
// "-free"-suffixed ids plus big-pickle (the unsuffixed free agent model)
export async function fetchOpenCodeModels(): Promise<ModelInfo[]> {
  try {
    const res = await fetch(`${OPENCODE_BASE}/models`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return FALLBACK_OPENCODE_MODELS;
    const data = await res.json();
    const models: ModelInfo[] = (data.data || [])
      .filter(
        (m: { id: string }) =>
          m.id && (m.id.endsWith("-free") || m.id === "big-pickle")
      )
      .map((m: { id: string; owned_by?: string }) => {
        const id = `opencode/${m.id}`;
        // Zen's listing carries no metadata; reuse the curated fallback
        // category where the id is known rather than defaulting to "other"
        const known = FALLBACK_OPENCODE_MODELS.find((f) => f.id === id);
        return {
          id,
          displayName: (m.id.split("/").pop() || m.id).replace(/-free$/, ""),
          provider: "opencode" as Provider,
          ownedBy: m.owned_by || "opencode",
          category: known ? known.category : inferCategory(m.id),
        };
      });
    return models.length > 0 ? models : FALLBACK_OPENCODE_MODELS;
  } catch {
    return FALLBACK_OPENCODE_MODELS;
  }
}

const FALLBACK_OPENCODE_MODELS: ModelInfo[] = [
  { id: "opencode/big-pickle", displayName: "Big Pickle", provider: "opencode", ownedBy: "opencode", category: "chat" },
  { id: "opencode/deepseek-v4-flash-free", displayName: "DeepSeek V4 Flash", provider: "opencode", ownedBy: "opencode", category: "chat" },
  { id: "opencode/x-preview-f-free", displayName: "X Preview F", provider: "opencode", ownedBy: "opencode", category: "chat" },
  { id: "opencode/muse-spark-1.2-contributor-free", displayName: "Muse Spark 1.2 Contributor", provider: "opencode", ownedBy: "opencode", category: "chat" },
  { id: "opencode/mimo-v2.5-free", displayName: "MiMo V2.5", provider: "opencode", ownedBy: "opencode", category: "code" },
  { id: "opencode/hy3-free", displayName: "Hy3", provider: "opencode", ownedBy: "opencode", category: "chat" },
  { id: "opencode/nemotron-3-ultra-free", displayName: "Nemotron 3 Ultra", provider: "opencode", ownedBy: "opencode", category: "chat" },
  { id: "opencode/nemotron-3.5-lightning-free", displayName: "Nemotron 3.5 Lightning", provider: "opencode", ownedBy: "opencode", category: "chat" },
  { id: "opencode/laguna-s-2.1-free", displayName: "Laguna S 2.1", provider: "opencode", ownedBy: "opencode", category: "code" },
];

// OpenRouter free tier — ids ending ":free". Listing models needs no auth;
// running inference does (OPENROUTER_API_KEY), so tests report a config
// error until the key is set rather than a misleading upstream 401.
export async function fetchOpenRouterModels(): Promise<ModelInfo[]> {
  try {
    const res = await fetch(`${OPENROUTER_BASE}/models`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return FALLBACK_OPENROUTER_MODELS;
    const data = await res.json();
    const models: ModelInfo[] = (data.data || [])
      .filter((m: { id?: string }) => typeof m.id === "string" && m.id.endsWith(":free"))
      .map((m: { id: string; name?: string }) => ({
        id: `openrouter/${m.id}`,
        displayName:
          typeof m.name === "string" && m.name.trim()
            ? m.name.replace(/\s*\(free\)\s*$/i, "")
            : m.id.split("/").pop() || m.id,
        provider: "openrouter" as Provider,
        ownedBy: m.id.split("/")[0],
        category: inferCategory(m.id),
      }));
    return models.length > 0 ? models : FALLBACK_OPENROUTER_MODELS;
  } catch {
    return FALLBACK_OPENROUTER_MODELS;
  }
}

const FALLBACK_OPENROUTER_MODELS: ModelInfo[] = [
  { id: "openrouter/dots-studio/dots-3-note-preview:free", displayName: "Dots.3 Note Preview", provider: "openrouter", ownedBy: "dots-studio", category: "chat" },
  { id: "openrouter/liquid/lfm-2.5-2.6b:free", displayName: "LFM 2.5 2.6B", provider: "openrouter", ownedBy: "liquid", category: "chat" },
  { id: "openrouter/nvidia/nemotron-3.5-lightning:free", displayName: "Nemotron 3.5 Lightning", provider: "openrouter", ownedBy: "nvidia", category: "chat" },
  { id: "openrouter/thinkingmachines/inkling-small:free", displayName: "Inkling Small", provider: "openrouter", ownedBy: "thinkingmachines", category: "chat" },
  { id: "openrouter/poolside/laguna-s-2.1:free", displayName: "Laguna S 2.1", provider: "openrouter", ownedBy: "poolside", category: "code" },
  { id: "openrouter/thinkingmachines/inkling:free", displayName: "Inkling", provider: "openrouter", ownedBy: "thinkingmachines", category: "chat" },
  { id: "openrouter/poolside/laguna-xs-2.1:free", displayName: "Laguna XS 2.1", provider: "openrouter", ownedBy: "poolside", category: "code" },
  { id: "openrouter/cohere/north-mini-code:free", displayName: "North Mini Code", provider: "openrouter", ownedBy: "cohere", category: "code" },
  { id: "openrouter/z-ai/glm-5.2:free", displayName: "GLM 5.2", provider: "openrouter", ownedBy: "z-ai", category: "chat" },
  { id: "openrouter/nvidia/nemotron-3.5-content-safety:free", displayName: "Nemotron 3.5 Content Safety", provider: "openrouter", ownedBy: "nvidia", category: "other" },
  { id: "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free", displayName: "Nemotron 3 Ultra 550B", provider: "openrouter", ownedBy: "nvidia", category: "chat" },
  { id: "openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", displayName: "Nemotron 3 Nano Omni 30B Reasoning", provider: "openrouter", ownedBy: "nvidia", category: "chat" },
  { id: "openrouter/google/gemma-4-26b-a4b-it:free", displayName: "Gemma 4 26B A4B IT", provider: "openrouter", ownedBy: "google", category: "chat" },
  { id: "openrouter/google/gemma-4-31b-it:free", displayName: "Gemma 4 31B IT", provider: "openrouter", ownedBy: "google", category: "chat" },
  { id: "openrouter/nvidia/nemotron-3-super-120b-a12b:free", displayName: "Nemotron 3 Super 120B", provider: "openrouter", ownedBy: "nvidia", category: "chat" },
  { id: "openrouter/nvidia/nemotron-3-nano-30b-a3b:free", displayName: "Nemotron 3 Nano 30B", provider: "openrouter", ownedBy: "nvidia", category: "chat" },
  { id: "openrouter/nvidia/nemotron-nano-12b-v2-vl:free", displayName: "Nemotron Nano 12B V2 VL", provider: "openrouter", ownedBy: "nvidia", category: "vision" },
  { id: "openrouter/nvidia/nemotron-nano-9b-v2:free", displayName: "Nemotron Nano 9B V2", provider: "openrouter", ownedBy: "nvidia", category: "chat" },
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

export function openrouterModelUrl(modelId: string): string {
  return `https://openrouter.ai/${modelId.replace(/^openrouter\//, "")}`;
}

// Zen has no public per-model page; point at the gateway docs instead
export function opencodeModelUrl(): string {
  return "https://opencode.ai/docs/zen";
}

// Aggregated discovery across all three providers; a failing provider is
// reported per-key instead of failing the whole listing.
export async function fetchAllProviderModels(apiKey: string): Promise<{
  models: ModelInfo[];
  errors: Record<Provider, string | null>;
}> {
  const [nvidia, opencode, openrouter] = await Promise.allSettled([
    fetchNvidiaModels(apiKey),
    fetchOpenCodeModels(),
    fetchOpenRouterModels(),
  ]);
  const pick = (r: PromiseSettledResult<ModelInfo[]>) =>
    r.status === "fulfilled" ? r.value : [];
  const reason = (r: PromiseSettledResult<ModelInfo[]>) =>
    r.status === "rejected" ? r.reason?.message || "Unknown error" : null;
  return {
    models: [...pick(nvidia), ...pick(opencode), ...pick(openrouter)],
    errors: {
      nvidia: reason(nvidia),
      opencode: reason(opencode),
      openrouter: reason(openrouter),
    },
  };
}

export async function runModelTests(
  apiKey: string,
  models: ModelInfo[],
  concurrency = 10
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  for (let i = 0; i < models.length; i += concurrency) {
    const batch = models.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map((m) => testModel(apiKey, m)));
    for (let j = 0; j < settled.length; j++) {
      const r = settled[j];
      if (r.status === "fulfilled") {
        results.push(r.value);
      } else {
        results.push({
          modelId: batch[j].id,
          provider: batch[j].provider,
          status: "error",
          httpCode: 0,
          responseTimeMs: 0,
          supportsFunctionCalling: false,
          error: r.reason?.message || "Test failed",
        });
      }
    }
  }
  return results;
}

export function isT3Breaking(modelId: string): boolean {
  return T3_KNOWN_BREAKING.has(modelId);
}

export function isKnownSlow(modelId: string): boolean {
  return KNOWN_SLOW.has(modelId);
}

// Manually maintained list of T3-available model API IDs
// Derived from opencode.json cache — these are the models T3 actually exposes
export const T3_AVAILABLE_MODELS = new Set([
  "nvidia/nvidia/active-speaker-detection",
  "nvidia/baai/bge-m3",
  "opencode/big-pickle",
  "zen/big-pickle",
  "zen/deepseek-v4-flash-free",
  "zen/laguna-s-2.1-free",
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
    const baseUrl =
      model.provider === "opencode" ? OPENCODE_BASE
      : model.provider === "openrouter" ? OPENROUTER_BASE
      : NVIDIA_BASE;

    // Tracker ids are provider-namespaced; upstream APIs expect them bare
    const upstreamId = model.id.replace(/^(opencode|openrouter)\//, "");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (model.provider === "nvidia" && apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    if (model.provider === "openrouter") {
      const openrouterKey = process.env.OPENROUTER_API_KEY || "";
      if (!openrouterKey) {
        clearTimeout(timeout);
        return {
          modelId: model.id,
          provider: model.provider,
          status: "error",
          httpCode: 0,
          responseTimeMs: Date.now() - start,
          supportsFunctionCalling: false,
          error: "OPENROUTER_API_KEY not configured on server - free models still require auth",
        };
      }
      headers["Authorization"] = `Bearer ${openrouterKey}`;
    }

    // Step 1: Test without tools — just check if model responds
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: upstreamId,
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
          model: upstreamId,
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
