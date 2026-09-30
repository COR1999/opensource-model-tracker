export type Provider = "nvidia" | "opencode" | "openrouter";

export type ModelCategory = "chat" | "code" | "vision" | "embedding" | "audio" | "other";

export interface ModelInfo {
  id: string;
  displayName: string;
  provider: Provider;
  ownedBy: string;
  category: ModelCategory;
  // Max context window in tokens; only OpenRouter's discovery API exposes it
  contextLength?: number;
  // Live benchmark annotations, filled server-side from BenchLM / OpenRouter
  benchmarkScore?: number;
  benchmarkRank?: number;
  codingScore?: number;
  agenticScore?: number;
  knowledgeScore?: number;
  intelligenceScore?: number;
  // OpenRouter usage rank (1 = most tokens); only set when known
  usageRank?: number;
}

export interface TestResult {
  modelId: string;
  provider: Provider;
  // "rate-limited" = HTTP 429 / provider throttling — model may still be fine
  status: "working" | "slow" | "rate-limited" | "error" | "timeout" | "removed";
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
