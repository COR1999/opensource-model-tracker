"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ModelInfo,
  TestResult,
  ModelCategory,
  UptimeRecord,
  nvidiaModelUrl,
  openrouterModelUrl,
  opencodeModelUrl,
  isT3Breaking,
  isKnownSlow,
  isT3Available,
} from "@/lib/models";
import { encodeSnapshot } from "@/lib/share";
import {
  statusColor,
  statusBg,
  providerBadge,
  categoryBadge,
  computeUptimePercent,
  accents,
  styles,
  type Theme,
} from "@/lib/display";
import ChangelogPanel from "@/components/ChangelogPanel";
import ComparePanel from "@/components/ComparePanel";
import StatsGrid, { computeCounts } from "@/components/StatsGrid";
import ProviderHealthStrip, { computeProviderHealth } from "@/components/ProviderHealthStrip";
import {
  STORAGE_KEYS,
  type ChangelogEntry,
  loadKnownModels,
  saveKnownModels,
  loadChangelog,
  saveChangelog,
  loadUptime,
  saveUptime,
  appendUptime,
  loadLastResults,
  saveLastResults,
  loadHideEndpoints,
  loadTheme,
} from "@/lib/storage";
import Spinner from "@/components/Spinner";
import UptimeSparkline from "@/components/UptimeSparkline";

type SortKey = "displayName" | "provider" | "status" | "responseTimeMs" | "category";

const CATEGORY_OPTIONS: { value: ModelCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "chat", label: "Chat" },
  { value: "code", label: "Code" },
  { value: "vision", label: "Vision" },
  { value: "embedding", label: "Embed" },
  { value: "audio", label: "Audio" },
  { value: "other", label: "Other" },
];

const BATCH_SIZE = 10;

export default function Dashboard() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  // Persisted UI state loads in the mount effect below, never in state
  // initializers: localStorage exists only on the client, so initializer
  // reads produce SSR markup that disagrees with the client's first render
  // (the same hydration-mismatch class as URL-seeded filter state).
  const [results, setResults] = useState<Map<string, TestResult>>(new Map());
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<ModelCategory | "all">("all");
  const [workingOnly, setWorkingOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("provider");
  const [sortAsc, setSortAsc] = useState(true);
  const [loadingModels, setLoadingModels] = useState(true);
  const [testingAll, setTestingAll] = useState(false);
  const [testingVisible, setTestingVisible] = useState(false);
  const [testingSingle, setTestingSingle] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newModels, setNewModels] = useState<Set<string>>(new Set());
  const [uptime, setUptime] = useState<Record<string, UptimeRecord[]>>({});
  const [shareTooltip, setShareTooltip] = useState(false);
  const [testProgress, setTestProgress] = useState({ done: 0, total: 0 });
  const [theme, setTheme] = useState<Theme>("dark");
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
  const [hideEndpoints, setHideEndpoints] = useState<boolean>(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedList, setCopiedList] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Filters seed from the URL (?provider=&category=&q=&working=1) so views are
  // shareable. Applied in a post-mount effect, never in state initializers:
  // reading window there makes the SSR markup disagree with the client's first
  // render and React's hydration recovery leaves stale classes behind.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const provider = params.get("provider");
    if (provider === "nvidia" || provider === "opencode" || provider === "openrouter") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- seeding from URL after mount is deliberate: reading it during render breaks SSR prerender
      setProviderFilter(provider);
    }
    const category = params.get("category");
    if (category && ["chat", "code", "vision", "embedding", "audio", "other"].includes(category)) {
      setCategoryFilter(category as ModelCategory);
    }
    const q = params.get("q");
    if (q) setSearch(q);
    if (params.get("working") === "1") setWorkingOnly(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is browser-only; loading in an effect (not render) is what keeps SSR output stable
    setResults(loadLastResults());
    setUptime(loadUptime());
    setChangelog(loadChangelog());
    setHideEndpoints(loadHideEndpoints());
    // html class was already corrected pre-paint by the bootstrap script in
    // layout.tsx; this only syncs React's copy of the value
    setTheme(loadTheme());
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (providerFilter !== "all") params.set("provider", providerFilter);
    if (categoryFilter !== "all") params.set("category", categoryFilter);
    if (search) params.set("q", search);
    if (workingOnly) params.set("working", "1");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `/?${qs}` : "/");
  }, [providerFilter, categoryFilter, search, workingOnly]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const modelUrl = (m: ModelInfo): string =>
    m.provider === "nvidia"
      ? nvidiaModelUrl(m.id)
      : m.provider === "openrouter"
        ? openrouterModelUrl(m.id)
        : opencodeModelUrl();

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.HIDE_ENDPOINTS, hideEndpoints ? "true" : "false");
  }, [hideEndpoints]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  }, [theme]);

  const loadModels = useCallback(async () => {
    setLoadingModels(true);
    setError(null);
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        const fetchedModels: ModelInfo[] = data.models;
        setModels(fetchedModels);
        setLastRefresh(new Date());

        const known = loadKnownModels();
        const currentIds = fetchedModels.map((m: ModelInfo) => m.id);
        if (known.size > 0) {
          const newOnes = new Set(currentIds.filter((id: string) => !known.has(id)));
          const removedOnes = [...known].filter((id) => !currentIds.includes(id));

          if (newOnes.size > 0) setNewModels(newOnes);

          // Record changelog
          const newEntries: ChangelogEntry[] = [];
          for (const id of newOnes) {
            const m = fetchedModels.find((x) => x.id === id);
            newEntries.push({
              timestamp: Date.now(),
              type: "added",
              modelId: id,
              displayName: m?.displayName || id,
            });
          }
          for (const id of removedOnes) {
            newEntries.push({
              timestamp: Date.now(),
              type: "removed",
              modelId: id,
              displayName: id.split("/").pop() || id,
            });
          }
          if (newEntries.length > 0) {
            const updated = [...changelog, ...newEntries];
            setChangelog(updated);
            saveChangelog(updated);
          }
        }
        saveKnownModels(currentIds);

        if (data.errors?.nvidia) setError(`NVIDIA: ${data.errors.nvidia}`);
      }
    } catch {
      setError("Failed to fetch models");
    }
    setLoadingModels(false);
  }, [changelog]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial catalog fetch on mount; refreshes are timer-driven, not render-driven
    loadModels();
    const interval = setInterval(loadModels, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadModels]);

  const updateResults = (newResults: Map<string, TestResult>) => {
    setResults(newResults);
    saveLastResults(newResults);
    let updated = uptime;
    for (const [id, result] of newResults) {
      updated = appendUptime(updated, id, result);
    }
    saveUptime(updated);
    setUptime(loadUptime());
  };

  const testOne = async (model: ModelInfo) => {
    setTestingSingle(model.id);
    try {
      const res = await fetch("/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      const result: TestResult = await res.json();
      const next = new Map(results).set(model.id, result);
      updateResults(next);
    } catch {
      const next = new Map(results).set(model.id, {
        modelId: model.id,
        provider: model.provider,
        status: "error",
        httpCode: 0,
        responseTimeMs: 0,
        supportsFunctionCalling: false,
        error: "Request failed",
      });
      updateResults(next);
    }
    setTestingSingle(null);
  };

  const runBatches = async (testable: ModelInfo[]) => {
    setTestProgress({ done: 0, total: testable.length });
    const allResults = new Map<string, TestResult>();

    for (let i = 0; i < testable.length; i += BATCH_SIZE) {
      const batch = testable.slice(i, i + BATCH_SIZE);
      const modelIds = batch.map((m) => m.id);

      try {
        const res = await fetch("/api/test-all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelIds }),
        });
        const data = await res.json();
        if (data.results) {
          for (const r of data.results) {
            allResults.set(r.modelId, r);
          }
          setTestProgress({ done: Math.min(i + BATCH_SIZE, testable.length), total: testable.length });
        }
      } catch {
        for (const m of batch) {
          allResults.set(m.id, {
            modelId: m.id,
            provider: m.provider,
            status: "error",
            httpCode: 0,
            responseTimeMs: 0,
            supportsFunctionCalling: false,
            error: "Batch request failed",
          });
        }
      }

      setResults(new Map(allResults));
      saveLastResults(new Map(allResults));
    }
    return allResults;
  };

  const finishTesting = async (allResults: Map<string, TestResult>) => {
    let updatedUptime = uptime;
    for (const [id, result] of allResults) {
      updatedUptime = appendUptime(updatedUptime, id, result);
    }
    saveUptime(updatedUptime);
    setUptime(loadUptime());
  };

  const testAll = async () => {
    setTestingAll(true);
    // Skip known-slow models during test-all
    const testable = models.filter((m) => !isKnownSlow(m.id));
    const skipped = models.filter((m) => isKnownSlow(m.id));
    const allResults = new Map<string, TestResult>();

    // Mark skipped as slow
    for (const m of skipped) {
      allResults.set(m.id, {
        modelId: m.id,
        provider: m.provider,
        status: "slow",
        httpCode: 0,
        responseTimeMs: 99999,
        supportsFunctionCalling: false,
        error: "Skipped (known slow)",
      });
    }

    const batched = await runBatches(testable);
    for (const [id, result] of batched) allResults.set(id, result);
    await finishTesting(allResults);

    setTestProgress({ done: testable.length, total: testable.length });
    setTestingAll(false);
  };

  // Tests only what the current filters leave on screen — chat/code/vision by
  // default, so this stays cheap; capped batches keep each request under the
  // server's per-request limit.
  const testVisible = async () => {
    setTestingVisible(true);
    const scoped = filtered.filter((m) => !isKnownSlow(m.id));
    const batched = await runBatches(scoped);
    await finishTesting(batched);
    setTestProgress({ done: scoped.length, total: scoped.length });
    setTestingVisible(false);
  };

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 3) next.add(id);
      return next;
    });
  };

  const shareResults = () => {
    const encoded = encodeSnapshot({ ts: Date.now(), results: [...results.values()] });
    const url = `${window.location.origin}/results/${encoded}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareTooltip(true);
      setTimeout(() => setShareTooltip(false), 2000);
    });
  };

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // clipboard unavailable (insecure context); no-op
    }
  };

  const usableIds = models
    .filter((m) => {
      const s = results.get(m.id)?.status;
      return s === "working" || s === "slow";
    })
    .map((m) => m.id);

  const copyWorkingIds = async () => {
    if (usableIds.length === 0) return;
    try {
      await navigator.clipboard.writeText(usableIds.join("\n"));
      setCopiedList(true);
      setTimeout(() => setCopiedList(false), 2000);
    } catch {
      // clipboard unavailable; no-op
    }
  };

  const filtered = models
    .filter(
      (m) =>
        (providerFilter === "all" || m.provider === providerFilter) &&
        (categoryFilter === "all" || m.category === categoryFilter) &&
        (!hideEndpoints ||
          m.category === "chat" ||
          m.category === "code" ||
          m.category === "vision") &&
        (!workingOnly ||
          results.get(m.id)?.status === "working" ||
          results.get(m.id)?.status === "slow") &&
        (m.id.toLowerCase().includes(search.toLowerCase()) ||
          m.displayName.toLowerCase().includes(search.toLowerCase()) ||
          m.ownedBy.toLowerCase().includes(search.toLowerCase()))
    )
    .sort((a, b) => {
      const ra = results.get(a.id);
      const rb = results.get(b.id);

      let cmp = 0;
      switch (sortKey) {
        case "displayName":
          cmp = a.displayName.localeCompare(b.displayName);
          break;
        case "provider":
          cmp = a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id);
          break;
        case "category":
          cmp = a.category.localeCompare(b.category);
          break;
        case "status": {
          const order = { working: 0, slow: 1, error: 2, timeout: 3, removed: 4 };
          cmp = (order[ra?.status ?? "error"] ?? 5) - (order[rb?.status ?? "error"] ?? 5);
          break;
        }
        case "responseTimeMs":
          cmp = (ra?.responseTimeMs ?? 99999) - (rb?.responseTimeMs ?? 99999);
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const accent = accents(theme);
  const { bg, cardBg, border, text, textMuted, inputBg } = styles(theme);
  const counts = computeCounts(models, results, newModels.size);
  const providerHealth = computeProviderHealth(models, results);
  const compared = models.filter((m) => compareIds.has(m.id));

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors`}>
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Open Source Model Tracker</h1>
            <p className={`text-sm ${textMuted} mt-1`}>
              Check which free AI models are live on NVIDIA NIM, OpenCode, and OpenRouter
            </p>
            {lastRefresh && (
              <p className={`text-xs ${textMuted} mt-1`}>
                Last refresh: {lastRefresh.toLocaleTimeString()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className={`px-3 py-2 rounded-lg text-sm border transition-colors ${cardBg} ${border} ${textMuted} ${theme === "dark" ? "hover:text-gray-100" : "hover:text-gray-700"}`}
            >
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            <button
              onClick={() => { setShowChangelog(!showChangelog); setShowCompare(false); }}
              className={`px-3 py-2 rounded-lg text-sm border transition-colors ${cardBg} ${border} ${textMuted} ${theme === "dark" ? "hover:text-gray-100" : "hover:text-gray-700"}`}
            >
              Changelog ({changelog.length})
            </button>
            {compareIds.size > 0 && (
              <button
                onClick={() => { setShowCompare(!showCompare); setShowChangelog(false); }}
                className="px-3 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-500 transition-colors"
              >
                Compare ({compareIds.size})
              </button>
            )}
            <button
              onClick={testAll}
              disabled={testingAll || models.length === 0}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-medium transition-colors text-sm text-white"
            >
              {testingAll ? (
                <span className="flex items-center gap-2">
                  <Spinner className="h-4 w-4" />
                  Testing {testProgress.done}/{testProgress.total}
                </span>
              ) : (
                "Test All"
              )}
            </button>
            <button
              onClick={testVisible}
              disabled={testingVisible || testingAll || filtered.length === 0}
              className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm border ${cardBg} ${border} disabled:opacity-50 disabled:cursor-not-allowed ${textMuted}`}
            >
              {testingVisible ? (
                <span className="flex items-center gap-2">
                  <Spinner className="h-4 w-4" />
                  {testProgress.done}/{testProgress.total}
                </span>
              ) : (
                `Test Visible (${filtered.length})`
              )}
            </button>
            <button
              onClick={copyWorkingIds}
              disabled={usableIds.length === 0}
              className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm border ${cardBg} ${border} disabled:opacity-50 disabled:cursor-not-allowed ${textMuted}`}
            >
              {copiedList ? "Copied!" : `Copy Working (${usableIds.length})`}
            </button>
            <div className="relative">
              <button
                onClick={shareResults}
                disabled={results.size === 0}
                className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm border ${cardBg} ${border} disabled:opacity-50 disabled:cursor-not-allowed ${textMuted} ${theme === "dark" ? "hover:text-gray-100" : "hover:text-gray-700"}`}
              >
                Share
              </button>
              {shareTooltip && (
                <div className="absolute -bottom-8 right-0 text-xs text-emerald-400 bg-gray-900 px-2 py-1 rounded border border-gray-700 whitespace-nowrap z-50">
                  Copied!
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Changelog Panel */}
        {showChangelog && <ChangelogPanel entries={changelog} theme={theme} />}

        {/* Compare Panel */}
        {showCompare && compared.length > 0 && (
          <ComparePanel models={compared} results={results} uptime={uptime} theme={theme} />
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* New models alert */}
        {newModels.size > 0 && (
          <div className="bg-emerald-900/30 border border-emerald-700 rounded-lg p-4 mb-6 text-emerald-300 text-sm flex items-center gap-2">
            <span className="text-lg">+</span>
            <span>
              <strong>{newModels.size} new model{newModels.size > 1 ? "s" : ""}</strong> detected since your last visit!
            </span>
            <button
              onClick={() => setNewModels(new Set())}
              className="ml-auto text-emerald-400 hover:text-emerald-300 text-xs underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Stats */}
        <StatsGrid counts={counts} theme={theme} />

        {/* Provider health */}
        <ProviderHealthStrip health={providerHealth} theme={theme} />

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="text"
            placeholder="Search models... (press / to focus)"
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`flex-1 ${inputBg} border ${border} rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500 ${text}`}
          />
          <div className="flex gap-2">
            {["all", "nvidia", "opencode", "openrouter"].map((p) => (
              <button
                key={p}
                onClick={() => setProviderFilter(p)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  providerFilter === p
                    ? "bg-blue-600 border-blue-500 text-white"
                    : `${inputBg} ${border} ${textMuted} hover:border-gray-500`
                }`}
              >
                {p === "all" ? "All" : p === "nvidia" ? "NVIDIA" : p === "opencode" ? "OpenCode" : "OpenRouter"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {CATEGORY_OPTIONS.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategoryFilter(c.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
                categoryFilter === c.value
                  ? "bg-blue-600 border-blue-500 text-white"
                  : `${inputBg} ${border} ${textMuted} hover:border-gray-500`
              }`}
            >
                {c.label}
              </button>
            ))}
            <button
              onClick={() => setWorkingOnly(!workingOnly)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
                workingOnly
                  ? "bg-emerald-600 border-emerald-500 text-white"
                  : `${inputBg} ${border} ${textMuted} hover:border-gray-500`
              }`}
            >
              Working only
            </button>
          </div>

        {/* Hide unusable endpoints */}
        <div className="mb-6">
          <label className={`inline-flex items-center gap-2 text-sm ${textMuted} cursor-pointer select-none`}>
            <input
              type="checkbox"
              checked={hideEndpoints}
              onChange={(e) => setHideEndpoints(e.target.checked)}
              className="rounded"
            />
            Hide non-chat endpoints (embeddings, audio, image/classifiers)
          </label>
        </div>

        {/* Loading */}
        {loadingModels ? (
          <div className={`text-center py-20 ${textMuted}`}>
            <Spinner className="h-8 w-8 mx-auto mb-4" />
            Loading models...
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className={`hidden md:block overflow-x-auto rounded-lg border ${border}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b ${border} ${cardBg}/50 ${textMuted}`}>
                    <th className="w-8 px-3 py-3"></th>
                    {[
                      { key: "provider" as SortKey, label: "Provider" },
                      { key: "displayName" as SortKey, label: "Model" },
                      { key: "category" as SortKey, label: "Category" },
                      { key: null, label: "Context" },
                      { key: null, label: "T3" },
                      { key: "status" as SortKey, label: "Status" },
                      { key: "responseTimeMs" as SortKey, label: "Response" },
                      { key: null, label: "Uptime" },
                      { key: null, label: "Tools" },
                      { key: null, label: "" },
                    ].map((col) => (
                      <th
                        key={col.label}
                        className={`text-left px-4 py-3 ${col.key ? `cursor-pointer select-none ${theme === "dark" ? "hover:text-gray-100" : "hover:text-gray-700"}` : ""}`}
                        onClick={() => col.key && toggleSort(col.key)}
                      >
                        {col.label}
                        {col.key === sortKey && (sortAsc ? " \u25B2" : " \u25BC")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => {
                    const r = results.get(m.id);
                    const isTesting = testingSingle === m.id;
                    const isNew = newModels.has(m.id);
                    const uptimePercent = computeUptimePercent(uptime[m.id] || []);
                    const t3Breaks = isT3Breaking(m.id);
                    const t3Avail = isT3Available(m.id);
                    const isSelected = compareIds.has(m.id);
                    return (
                      <tr
                        key={m.id}
                        className={`border-b ${border}/50 ${theme === "dark" ? "hover:bg-gray-900/30" : "hover:bg-gray-50"} ${r ? statusBg(r.status, theme) : ""}`}
                      >
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleCompare(m.id)}
                            className="rounded"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${providerBadge(m.provider, theme)}`}>
                            {m.provider}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <a
                              href={modelUrl(m)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-sm text-blue-400 hover:text-blue-300 underline-offset-2 hover:underline"
                            >
                              {m.displayName}
                            </a>
                            {isNew && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-900/60 text-cyan-300 border border-cyan-700/50 font-medium">
                                NEW
                              </span>
                            )}
                            {t3Breaks && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-900/60 text-amber-300 border border-amber-700/50 font-medium" title="Breaks with T3 Code">
                                T3 &#9888;
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className={`text-xs ${textMuted} font-mono`}>{m.id}</div>
                            <button
                              onClick={() => copyId(m.id)}
                              title={`Copy ${m.id}`}
                              aria-label={`Copy model ID ${m.id}`}
                              className={`text-[10px] px-1 rounded transition-colors ${
                                copiedId === m.id ? accent.ok : `${textMuted} hover:underline`
                              }`}
                            >
                              {copiedId === m.id ? "copied" : "copy"}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${categoryBadge(m.category, theme)}`}>
                            {m.category}
                          </span>
                        </td>
                        <td className={`px-4 py-3 font-mono text-xs ${textMuted}`} title={m.contextLength ? `${m.contextLength.toLocaleString()} token context` : undefined}>
                          {m.contextLength
                            ? m.contextLength >= 1000
                              ? `${Math.round(m.contextLength / 1000)}k`
                              : m.contextLength
                            : "-"}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {t3Avail ? (
                            <span className={accent.ok} title="Available in T3 Code">Yes</span>
                          ) : (
                            <span className={textMuted}>No</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r ? (
                            <div>
                              <span className={`font-medium text-sm ${statusColor(r.status, theme)}`}>
                                {r.status}
                              </span>
                              {r.error && (
                                <div className={`text-xs ${textMuted} max-w-xs truncate mt-0.5`} title={r.error}>
                                  {r.error}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className={`text-sm ${textMuted}`}>-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {r ? (
                            <span className={r.responseTimeMs > 5000 ? accent.warn : ""}>
                              {r.responseTimeMs}ms
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {uptimePercent > 0 ? (
                            <div className="flex items-center gap-2">
                              <UptimeSparkline records={uptime[m.id] || []} theme={theme} />
                              <span className={uptimePercent >= 90 ? accent.ok : uptimePercent >= 50 ? accent.warn : accent.bad}>
                                {uptimePercent}%
                              </span>
                            </div>
                          ) : (
                            <span className={textMuted}>-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {r?.supportsFunctionCalling ? (
                            <span className={accent.ok}>Yes</span>
                          ) : r ? (
                            <span className={textMuted}>No</span>
                          ) : (
                            <span className={textMuted}>-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => testOne(m)}
                            disabled={isTesting}
                            className={`px-3 py-1 ${cardBg} ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-100"} disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs transition-colors border ${border}`}
                          >
                            {isTesting ? (
                              <Spinner className="h-3 w-3" />
                            ) : (
                              "Test"
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={10} className={`px-4 py-10 text-center ${textMuted}`}>
                        No models found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {filtered.map((m) => {
                const r = results.get(m.id);
                const isNew = newModels.has(m.id);
                const t3Breaks = isT3Breaking(m.id);
                const t3Avail = isT3Available(m.id);
                const uptimePercent = computeUptimePercent(uptime[m.id] || []);
                return (
                  <div
                    key={m.id}
                    className={`${cardBg} rounded-lg border ${border} p-4 ${r ? statusBg(r.status, theme) : ""}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          type="checkbox"
                          checked={compareIds.has(m.id)}
                          onChange={() => toggleCompare(m.id)}
                          className="rounded"
                        />
                        <a
                          href={modelUrl(m)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-sm text-blue-400 hover:underline"
                        >
                          {m.displayName}
                        </a>
                        {isNew && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-900/60 text-cyan-300 border border-cyan-700/50 font-medium">
                            NEW
                          </span>
                        )}
                        {t3Breaks && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-900/60 text-amber-300 border border-amber-700/50 font-medium">
                            T3 &#9888;
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyId(m.id)}
                          title={`Copy ${m.id}`}
                          aria-label={`Copy model ID ${m.id}`}
                          className={`px-2 py-1 rounded text-xs border ${border} ${
                            copiedId === m.id ? accent.ok : textMuted
                          }`}
                        >
                          {copiedId === m.id ? "copied" : "copy id"}
                        </button>
                        <button
                          onClick={() => testOne(m)}
                          disabled={testingSingle === m.id}
                          className={`px-3 py-1 ${cardBg} rounded text-xs border ${border} disabled:opacity-50`}
                        >
                          {testingSingle === m.id ? "..." : "Test"}
                        </button>
                      </div>
                    </div>
                    <div className={`text-xs ${textMuted} font-mono mb-2`}>{m.id}</div>
                    {uptimePercent > 0 && (
                      <div className="flex items-center gap-2 mb-2">
                        <UptimeSparkline records={uptime[m.id] || []} theme={theme} />
                        <span className={`text-xs ${textMuted}`}>{uptimePercent}% uptime (7d)</span>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className={`px-2 py-0.5 rounded-full border ${providerBadge(m.provider, theme)}`}>{m.provider}</span>
                      <span className={`px-2 py-0.5 rounded-full ${categoryBadge(m.category, theme)}`}>{m.category}</span>
                      <span className={t3Avail ? accent.ok : `${textMuted}`}>
                        T3: {t3Avail ? "Yes" : "No"}
                      </span>
                      {r && (
                        <>
                          <span className={statusColor(r.status, theme)}>{r.status}</span>
                          <span className="font-mono">{r.responseTimeMs}ms</span>
                          {r.supportsFunctionCalling && <span className={accent.ok}>tools</span>}
                          {uptimePercent > 0 && <span className={textMuted}>{uptimePercent}% uptime</span>}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className={`text-center py-10 ${textMuted}`}>No models found</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
