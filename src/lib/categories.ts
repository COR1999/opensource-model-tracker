import type { ModelCategory } from "./types";
import { CATEGORY_MAP, T3_KNOWN_BREAKING, KNOWN_SLOW, T3_AVAILABLE_MODELS } from "./curated";

/**
 * Candidate keys for a curated lookup, longest first: the normalised id, then
 * progressively shorter path suffixes, so a mapping entered for one provider
 * also matches the same model listed by another.
 */
export function lookupCandidates(rawId: string): string[] {
  const id = normalizeModelId(rawId);
  const parts = id.split("/");
  const candidates = [id];
  if (parts.length > 2) candidates.push(parts.slice(-2).join("/"));
  candidates.push(parts[parts.length - 1]);
  return candidates;
}

// Tracker ids are provider-namespaced ("openrouter/z-ai/glm-5.2:free") while
// every curated lookup table is keyed by the bare upstream id. Normalising in
// one place keeps category inference, known-slow and T3-breaking lookups
// agreeing with each other; they previously disagreed, so a model listed as
// slow under its NVIDIA id was still tested under its OpenRouter id.
// Only "opencode/" and "openrouter/" are namespaces this tracker prepends.
// A leading "nvidia/" is part of the upstream id itself (the owning org, as in
// "nvidia/nemotron-3-super-120b-a12b") and must survive normalisation, or
// every NVIDIA-owned entry in CATEGORY_MAP stops matching.
export function normalizeModelId(rawId: string): string {
  return rawId
    .replace(/^(opencode|openrouter)\//, "")
    .replace(/:free$/, "") // OpenRouter free-tier marker
    .replace(/-free$/, ""); // OpenCode Zen free-tier marker
}

export function inferCategory(rawId: string): ModelCategory {
  const id = normalizeModelId(rawId);
  for (const key of lookupCandidates(rawId)) {
    if (CATEGORY_MAP[key]) return CATEGORY_MAP[key];
  }
  // Keyword fallback runs on the normalised id: matching "code" against the
  // raw id classified every "opencode/..." model as a coding model.
  const lower = id.toLowerCase();
  if (lower.includes("embed")) return "embedding";
  if (lower.includes("vision") || lower.includes("neva")) return "vision";
  if (lower.includes("-vl") || lower.endsWith("vl")) return "vision";
  if (lower.includes("coder") || lower.includes("code")) return "code";
  if (lower.includes("tts") || lower.includes("speech") || lower.includes("audio") || lower.includes("whisper")) return "audio";
  return "other";
}

export function isT3Breaking(modelId: string): boolean {
  return lookupCandidates(modelId).some((key) => T3_KNOWN_BREAKING.has(key));
}

export function isKnownSlow(modelId: string): boolean {
  return lookupCandidates(modelId).some((key) => KNOWN_SLOW.has(key));
}

export function isT3Available(modelId: string): boolean {
  // Check direct match
  if (T3_AVAILABLE_MODELS.has(modelId)) return true;
  // Check with nvidia/ prefix (T3 slugs)
  if (T3_AVAILABLE_MODELS.has(`nvidia/${modelId}`)) return true;
  // Check without nvidia/ prefix (API IDs)
  if (modelId.startsWith("nvidia/") && T3_AVAILABLE_MODELS.has(modelId.replace(/^nvidia\//, ""))) return true;
  return false;
}
