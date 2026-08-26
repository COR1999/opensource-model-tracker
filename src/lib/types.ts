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
