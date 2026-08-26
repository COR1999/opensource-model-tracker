import type { ModelCategory, ModelInfo } from "./types";

// Models known to break with T3 Code (Chat Completions endpoint)
// GPT-OSS models only support Responses API (v1/responses), not Chat Completions
export const T3_KNOWN_BREAKING = new Set([
  "openai/gpt-oss-20b",
]);

// Models known to be consistently slow (>8s) — skipped during test-all and by
// the cron so a full pass fits Vercel's 60s cap.
//
// Entries are matched via lookupCandidates, so a bare "org/model" key also
// covers that model's OpenRouter listing. OpenCode Zen *renames* models rather
// than namespacing them ("deepseek-v4-flash-free" for what NVIDIA calls
// "deepseek-ai/deepseek-v4-flash-0731"), so those need their own bare-name
// entry — no string rule can bridge a rename.
export const KNOWN_SLOW = new Set([
  "openai/gpt-oss-120b",
  "google/gemma-4-31b-it",
  "deepseek-ai/deepseek-v4-flash-0731",
  "minimaxai/minimax-m3",
  // OpenCode Zen aliases for the above
  "deepseek-v4-flash",
]);

// OpenCode Zen free tier — gateway lists paid models too; keep only
// "-free"-suffixed ids plus big-pickle (the unsuffixed free agent model)
export const FALLBACK_OPENCODE_MODELS: ModelInfo[] = [
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

// Mirrors the live OpenRouter :free catalog (verified 2026-08-23) so the
// dashboard still renders fully - including context lengths - when the
// discovery API is unreachable. Refresh when OpenRouter changes its lineup.
export const FALLBACK_OPENROUTER_MODELS: ModelInfo[] = [
  { id: "openrouter/dots-studio/dots-3-note-preview:free", displayName: "Dots.3 Note Preview", provider: "openrouter", ownedBy: "dots-studio", category: "chat", contextLength: 512000 },
  { id: "openrouter/liquid/lfm-2.5-2.6b:free", displayName: "LFM 2.5 2.6B", provider: "openrouter", ownedBy: "liquid", category: "chat", contextLength: 65536 },
  { id: "openrouter/nvidia/nemotron-3.5-lightning:free", displayName: "Nemotron 3.5 Lightning", provider: "openrouter", ownedBy: "nvidia", category: "chat", contextLength: 1000000 },
  { id: "openrouter/thinkingmachines/inkling-small:free", displayName: "Inkling Small", provider: "openrouter", ownedBy: "thinkingmachines", category: "chat", contextLength: 262144 },
  { id: "openrouter/poolside/laguna-s-2.1:free", displayName: "Laguna S 2.1", provider: "openrouter", ownedBy: "poolside", category: "code", contextLength: 262144 },
  { id: "openrouter/thinkingmachines/inkling:free", displayName: "Inkling", provider: "openrouter", ownedBy: "thinkingmachines", category: "chat", contextLength: 262144 },
  { id: "openrouter/poolside/laguna-xs-2.1:free", displayName: "Laguna XS 2.1", provider: "openrouter", ownedBy: "poolside", category: "code", contextLength: 262144 },
  { id: "openrouter/cohere/north-mini-code:free", displayName: "North Mini Code", provider: "openrouter", ownedBy: "cohere", category: "code", contextLength: 256000 },
  { id: "openrouter/z-ai/glm-5.2:free", displayName: "GLM 5.2", provider: "openrouter", ownedBy: "z-ai", category: "chat", contextLength: 256000 },
  { id: "openrouter/nvidia/nemotron-3.5-content-safety:free", displayName: "Nemotron 3.5 Content Safety", provider: "openrouter", ownedBy: "nvidia", category: "other", contextLength: 128000 },
  { id: "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free", displayName: "Nemotron 3 Ultra 550B", provider: "openrouter", ownedBy: "nvidia", category: "chat", contextLength: 1000000 },
  { id: "openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", displayName: "Nemotron 3 Nano Omni 30B Reasoning", provider: "openrouter", ownedBy: "nvidia", category: "chat", contextLength: 256000 },
  { id: "openrouter/google/gemma-4-26b-a4b-it:free", displayName: "Gemma 4 26B A4B IT", provider: "openrouter", ownedBy: "google", category: "chat", contextLength: 262144 },
  { id: "openrouter/google/gemma-4-31b-it:free", displayName: "Gemma 4 31B IT", provider: "openrouter", ownedBy: "google", category: "chat", contextLength: 262144 },
  { id: "openrouter/nvidia/nemotron-3-super-120b-a12b:free", displayName: "Nemotron 3 Super 120B", provider: "openrouter", ownedBy: "nvidia", category: "chat", contextLength: 262144 },
  { id: "openrouter/nvidia/nemotron-3-nano-30b-a3b:free", displayName: "Nemotron 3 Nano 30B", provider: "openrouter", ownedBy: "nvidia", category: "chat", contextLength: 256000 },
  { id: "openrouter/nvidia/nemotron-nano-12b-v2-vl:free", displayName: "Nemotron Nano 12B V2 VL", provider: "openrouter", ownedBy: "nvidia", category: "vision", contextLength: 128000 },
  { id: "openrouter/nvidia/nemotron-nano-9b-v2:free", displayName: "Nemotron Nano 9B V2", provider: "openrouter", ownedBy: "nvidia", category: "chat", contextLength: 128000 },
];

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

// Manual category mapping for known NVIDIA models
export const CATEGORY_MAP: Record<string, ModelCategory> = {
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
  "poolside/laguna-xs-2.1": "code",

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

  // OpenCode Zen renames models instead of namespacing them, so its ids
  // normalise to a bare name with no org. Keyed bare so lookupCandidates'
  // last candidate resolves them.
  "big-pickle": "chat",
  "mimo-v2.5": "code",
  "hy3": "chat",
  "x-preview-f": "chat",
  "muse-spark-1.2-contributor": "chat",
  "laguna-s-2.1": "code",
  "laguna-xs-2.1": "code",
  "nemotron-3-ultra": "chat",
  "nemotron-3.5-lightning": "chat",
  "deepseek-v4-flash": "chat",
  // OpenRouter lists this without the size suffix NVIDIA uses
  "nvidia/nemotron-3.5-lightning": "chat",
};

// Shared constants used by page, filter bar, and category inference
export const CATEGORY_OPTIONS: { value: ModelCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "chat", label: "Chat" },
  { value: "code", label: "Code" },
  { value: "vision", label: "Vision" },
  { value: "embedding", label: "Embed" },
  { value: "audio", label: "Audio" },
  { value: "other", label: "Other" },
];

export const VALID_CATEGORIES = new Set<string>(
  CATEGORY_OPTIONS.filter((c) => c.value !== "all").map((c) => c.value)
);
