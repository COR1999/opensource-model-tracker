"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ModelInfo, Provider } from "@/lib/models";
import { diffCatalog } from "@/lib/models";
import {
  loadChangelog,
  loadKnownModels,
  saveChangelog,
  saveKnownModels,
  type ChangelogEntry,
} from "@/lib/storage";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export interface CatalogState {
  models: ModelInfo[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  providerErrors: Partial<Record<Provider, string>>;
  lastRefresh: Date | null;
  newModels: Set<string>;
  changelog: ChangelogEntry[];
}

export function useModelCatalog() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerErrors, setProviderErrors] = useState<Partial<Record<Provider, string>>>({});
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [newModels, setNewModels] = useState<Set<string>>(new Set());
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
  const [freeTierGone, setFreeTierGone] = useState<Set<string>>(new Set());

  const mounted = useRef(true);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is browser-only; reading during render breaks SSR prerender
    setChangelog(loadChangelog());
  }, []);

  /**
   * Fetches the catalog and diffs it against the last known set.
   *
   * Deliberately has no reactive dependencies: changelog updates go through a
   * functional setState. When this closed over `changelog`, every recorded
   * change produced a new callback identity, which tore down and re-armed the
   * refresh interval and fired an immediate extra fetch.
   */
  const refresh = useCallback(async (opts: { silent?: boolean } = {}) => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    if (opts.silent) setRefreshing(true);
    setError(null);

    try {
      const res = await fetch("/api/models", { signal: controller.signal });
      if (!res.ok) throw new Error(`Catalog request failed (${res.status})`);
      const data = await res.json();
      if (!mounted.current || controller.signal.aborted) return;

      if (data.error) {
        setError(data.error);
        return;
      }

      const fetched: ModelInfo[] = Array.isArray(data.models) ? data.models : [];
      setModels(fetched);
      setLastRefresh(new Date());

      const failed: Partial<Record<Provider, string>> = {};
      for (const [provider, message] of Object.entries(data.errors ?? {})) {
        if (typeof message === "string" && message) failed[provider as Provider] = message;
      }
      setProviderErrors(failed);

      const known = loadKnownModels();
      const currentIds = fetched.map((m) => m.id);
      const displayNames = new Map(fetched.map((m) => [m.id, m.displayName]));
      if (known.size > 0) {
        const changes = diffCatalog(known, currentIds, displayNames);
        const added = changes.filter((c) => c.type === "added").map((c) => c.modelId);
        const goneFree = changes.filter((c) => c.type === "free-tier-gone");
        const removedIds = changes.filter((c) => c.type === "removed").map((c) => c.modelId);

        if (added.length > 0) setNewModels(new Set(added));
        if (goneFree.length > 0) {
          setFreeTierGone(new Set(goneFree.map((c) => c.modelId)));
        }

        if (changes.length > 0) {
          setChangelog((prev) => {
            const next = [
              ...prev,
              ...changes.map((c) => ({
                timestamp: c.timestamp,
                type: c.type,
                modelId: c.modelId,
                displayName: c.displayName,
              })),
            ];
            saveChangelog(next);
            return next;
          });
        }
        void removedIds;
      }
      saveKnownModels(currentIds);
    } catch (err) {
      if (controller.signal.aborted || !mounted.current) return;
      setError(err instanceof Error ? err.message : "Failed to fetch models");
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial catalog fetch on mount; later refreshes are timer-driven
    refresh();
    const interval = setInterval(() => refresh({ silent: true }), REFRESH_INTERVAL_MS);
    return () => {
      mounted.current = false;
      clearInterval(interval);
      inFlight.current?.abort();
    };
  }, [refresh]);

  const dismissNewModels = useCallback(() => setNewModels(new Set()), []);

  return {
    models,
    loading,
    refreshing,
    error,
    providerErrors,
    lastRefresh,
    newModels,
    changelog,
    freeTierGone,
    refresh,
    dismissNewModels,
  };
}
