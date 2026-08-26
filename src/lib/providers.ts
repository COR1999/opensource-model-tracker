import type { ModelInfo, Provider } from "./types";
import { inferCategory } from "./categories";
import { FALLBACK_OPENCODE_MODELS, FALLBACK_OPENROUTER_MODELS } from "./curated";

const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
const OPENCODE_BASE = "https://opencode.ai/zen/v1";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export { NVIDIA_BASE, OPENCODE_BASE, OPENROUTER_BASE };

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

// Single dispatch point for the per-provider link builders, so callers do not
// each re-implement the provider ternary.
export function modelUrl(model: Pick<ModelInfo, "id" | "provider">): string {
  switch (model.provider) {
    case "nvidia":
      return nvidiaModelUrl(model.id);
    case "openrouter":
      return openrouterModelUrl(model.id);
    default:
      return opencodeModelUrl();
  }
}

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

export async function fetchOpenRouterModels(): Promise<ModelInfo[]> {
  try {
    const res = await fetch(`${OPENROUTER_BASE}/models`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return FALLBACK_OPENROUTER_MODELS;
    const data = await res.json();
    const models: ModelInfo[] = (data.data || [])
      .filter((m: { id?: string }) => typeof m.id === "string" && m.id.endsWith(":free"))
      .map((m: { id: string; name?: string; context_length?: number }) => ({
        id: `openrouter/${m.id}`,
        displayName:
          typeof m.name === "string" && m.name.trim()
            ? m.name.replace(/\s*\(free\)\s*$/i, "")
            : m.id.split("/").pop() || m.id,
        provider: "openrouter" as Provider,
        ownedBy: m.id.split("/")[0],
        category: inferCategory(m.id),
        ...(typeof m.context_length === "number" && m.context_length > 0
          ? { contextLength: m.context_length }
          : {}),
      }));
    return models.length > 0 ? models : FALLBACK_OPENROUTER_MODELS;
  } catch {
    return FALLBACK_OPENROUTER_MODELS;
  }
}

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
