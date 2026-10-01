"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ModelInfo, TestResult, UptimeRecord } from "@/lib/models";
import { mergeUptimeHistory, parseRemoteUptime } from "@/lib/models";
import { loadSubscriptions, statusChangeAlerts, dispatchAlerts } from "@/lib/subscriptions";
import {
  appendUptime,
  loadLastResults,
  loadUptime,
  saveLastResults,
  saveUptime,
} from "@/lib/storage";

// The /api/test-all handler caps a request at 25 models; stay under it.
const BATCH_SIZE = 10;

export interface TestProgress {
  done: number;
  total: number;
  label: string;
}

function errorResult(model: ModelInfo, message: string): TestResult {
  return {
    modelId: model.id,
    provider: model.provider,
    status: "error",
    httpCode: 0,
    responseTimeMs: 0,
    supportsFunctionCalling: false,
    error: message,
  };
}

export function useModelTesting(onNotify?: (text: string, tone: "success" | "warning" | "error") => void) {
  const [results, setResults] = useState<Map<string, TestResult>>(new Map());
  const [uptime, setUptime] = useState<Record<string, UptimeRecord[]>>({});
  const [progress, setProgress] = useState<TestProgress | null>(null);
  const [testingSingle, setTestingSingle] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Lets an in-flight batch run be cancelled without leaving stale writes.
  const runToken = useRef(0);
  // Latest-callback ref: keeps testMany/testOne free of a notify dependency
  // without writing to a ref during render, which React forbids.
  const notify = useRef(onNotify);
  useEffect(() => {
    notify.current = onNotify;
  }, [onNotify]);

  // State updaters must be pure: React re-invokes them (StrictMode, concurrent
  // re-render). These refs hold the latest value so persistence writes and
  // webhook dispatch can happen outside the updater. Doing them inside made
  // every status-change alert get delivered twice to every subscriber.
  const resultsRef = useRef<Map<string, TestResult>>(new Map());
  const uptimeRef = useRef<Record<string, UptimeRecord[]>>({});

  useEffect(() => {
    // localStorage is browser-only, so persisted state loads after mount to
    // keep the prerendered markup identical to the client's first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setResults(loadLastResults());
    const localUptime = loadUptime();
    setUptime(localUptime);
    resultsRef.current = loadLastResults();
    uptimeRef.current = localUptime;
    setHydrated(true);

    // Shared uptime from cron snapshots; merge into local so sparklines show
    // history even on a fresh browser.
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/uptime", { signal: AbortSignal.timeout(8000) });
        if (!res.ok || cancelled) return;
        const remote = parseRemoteUptime(await res.json());
        if (Object.keys(remote.days).length === 0) return;
        const merged = mergeUptimeHistory(uptimeRef.current, remote);
        uptimeRef.current = merged;
        saveUptime(merged);
        setUptime(merged);
      } catch {
        // offline / API missing — local history still works
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Merges a batch of results into the existing map. The previous
   * implementation replaced state wholesale, so testing a filtered subset
   * silently discarded every result outside that subset — in the UI and in
   * localStorage.
   */
  const mergeResults = useCallback((incoming: Map<string, TestResult>) => {
    if (incoming.size === 0) return;

    const prev = resultsRef.current;
    const next = new Map(prev);
    for (const [id, r] of incoming) next.set(id, r);
    resultsRef.current = next;
    setResults(next);
    saveLastResults(next);

    let nextUptime = uptimeRef.current;
    for (const [id, r] of incoming) nextUptime = appendUptime(nextUptime, id, r);
    uptimeRef.current = nextUptime;
    saveUptime(nextUptime);
    setUptime(nextUptime);

    // Best-effort status-change webhooks; never block the test UI.
    try {
      const subs = loadSubscriptions();
      if (subs.length > 0) {
        for (const payload of statusChangeAlerts(prev, next)) void dispatchAlerts(payload, subs);
      }
    } catch {
      // subscriptions are optional enrichment
    }
  }, []);

  const testOne = useCallback(
    async (model: ModelInfo) => {
      setTestingSingle(model.id);
      try {
        const res = await fetch("/api/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model }),
        });
        if (!res.ok) {
          const detail = await res.json().catch(() => null);
          throw new Error(detail?.error || `Request failed (${res.status})`);
        }
        const result: TestResult = await res.json();
        mergeResults(new Map([[model.id, result]]));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Request failed";
        mergeResults(new Map([[model.id, errorResult(model, message)]]));
        notify.current?.(`${model.displayName}: ${message}`, "error");
      } finally {
        setTestingSingle(null);
      }
    },
    [mergeResults]
  );

  /**
   * Tests `models` in capped batches, merging after each batch so partial
   * progress survives a mid-run failure or cancellation.
   */
  const testMany = useCallback(
    async (models: ModelInfo[], label: string) => {
      if (models.length === 0) return;
      runToken.current += 1;
      const token = runToken.current;
      setProgress({ done: 0, total: models.length, label });

      let failures = 0;
      for (let i = 0; i < models.length; i += BATCH_SIZE) {
        if (runToken.current !== token) return; // cancelled or superseded
        const batch = models.slice(i, i + BATCH_SIZE);
        const batchResults = new Map<string, TestResult>();

        try {
          const res = await fetch("/api/test-all", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ modelIds: batch.map((m) => m.id) }),
          });
          if (!res.ok) {
            const detail = await res.json().catch(() => null);
            throw new Error(detail?.error || `Request failed (${res.status})`);
          }
          const data = await res.json();
          const byId = new Map<string, TestResult>(
            (data.results ?? []).map((r: TestResult) => [r.modelId, r])
          );
          // A model the server silently dropped must still resolve, or its row
          // stays stuck on the previous run's result with no explanation.
          for (const m of batch) {
            const r = byId.get(m.id);
            if (r) batchResults.set(m.id, r);
            else batchResults.set(m.id, errorResult(m, "No result returned"));
          }
        } catch (err) {
          failures += batch.length;
          const message = err instanceof Error ? err.message : "Batch request failed";
          for (const m of batch) batchResults.set(m.id, errorResult(m, message));
        }

        if (runToken.current !== token) return;
        mergeResults(batchResults);
        setProgress({
          done: Math.min(i + BATCH_SIZE, models.length),
          total: models.length,
          label,
        });
      }

      if (runToken.current !== token) return;
      setProgress(null);
      if (failures > 0) {
        notify.current?.(
          `${label} finished with ${failures} model${failures === 1 ? "" : "s"} unreachable`,
          "warning"
        );
      } else {
        notify.current?.(
          `${label} complete — ${models.length} model${models.length === 1 ? "" : "s"} tested`,
          "success"
        );
      }
    },
    [mergeResults]
  );

  const cancel = useCallback(() => {
    runToken.current += 1;
    setProgress(null);
  }, []);

  const clearResults = useCallback(() => {
    resultsRef.current = new Map();
    setResults(new Map());
    saveLastResults(new Map());
  }, []);

  return {
    results,
    uptime,
    progress,
    testingSingle,
    hydrated,
    testOne,
    testMany,
    cancel,
    clearResults,
  };
}
