// Barrel re-export — split into types.ts, curated.ts, categories.ts,
// providers.ts, and testing.ts for maintainability. This file re-exports
// everything so existing imports continue to work without changes.
export type { Provider, ModelCategory, ModelInfo, TestResult, UptimeRecord } from "./types";
export {
  T3_KNOWN_BREAKING,
  KNOWN_SLOW,
  FALLBACK_OPENCODE_MODELS,
  FALLBACK_OPENROUTER_MODELS,
  T3_AVAILABLE_MODELS,
  CATEGORY_MAP,
  CATEGORY_OPTIONS,
  VALID_CATEGORIES,
} from "./curated";
export {
  normalizeModelId,
  lookupCandidates,
  inferCategory,
  isT3Breaking,
  isKnownSlow,
  isT3Available,
} from "./categories";
export {
  NVIDIA_BASE,
  OPENCODE_BASE,
  OPENROUTER_BASE,
  nvidiaModelUrl,
  openrouterModelUrl,
  opencodeModelUrl,
  modelUrl,
  fetchOpenCodeModels,
  fetchOpenRouterModels,
  fetchNvidiaModels,
  fetchAllProviderModels,
} from "./providers";
export {
  testModel,
  runModelTests,
} from "./testing";
