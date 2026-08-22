"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ModelInfo,
  TestResult,
  ModelCategory,
  UptimeRecord,
  nvidiaModelUrl,
  isT3Breaking,
} from "@/lib/models";

type SortKey = "displayName" | "provider" | "status" | "responseTimeMs" | "category";

const STORAGE_KEYS = {
  KNOWN_MODELS: "model-tracker-known-models",
  UPTIME: "model-tracker-uptime",
  LAST_RESULTS: "model-tracker-last-results",
} as const;

const CATEGORY_OPTIONS: { value: ModelCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "chat", label: "Chat" },
  { value: "code", label: "Code" },
  { value: "vision", label: "Vision" },
  { value: "embedding", label: "Embed" },
  { value: "audio", label: "Audio" },
  { value: "other", label: "Other" },
];

function loadKnownModels(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.KNOWN_MODELS);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveKnownModels(ids: string[]) {
  localStorage.setItem(STORAGE_KEYS.KNOWN_MODELS, JSON.stringify(ids));
}

function loadUptime(): Record<string, UptimeRecord[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.UPTIME);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveUptime(data: Record<string, UptimeRecord[]>) {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const trimmed: Record<string, UptimeRecord[]> = {};
  for (const [k, v] of Object.entries(data)) {
    trimmed[k] = v.filter((r) => r.timestamp > sevenDaysAgo);
  }
  localStorage.setItem(STORAGE_KEYS.UPTIME, JSON.stringify(trimmed));
}

function appendUptime(
  prev: Record<string, UptimeRecord[]>,
  modelId: string,
  result: TestResult
): Record<string, UptimeRecord[]> {
  const next = { ...prev };
  const existing = next[modelId] || [];
  next[modelId] = [
    ...existing,
    { timestamp: Date.now(), status: result.status, responseTimeMs: result.responseTimeMs },
  ];
  return next;
}

function computeUptimePercent(records: UptimeRecord[]): number {
  if (records.length === 0) return 0;
  const working = records.filter((r) => r.status === "working" || r.status === "slow").length;
  return Math.round((working / records.length) * 100);
}

function loadLastResults(): Map<string, TestResult> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LAST_RESULTS);
    if (!raw) return new Map();
    const arr: TestResult[] = JSON.parse(raw);
    return new Map(arr.map((r) => [r.modelId, r]));
  } catch {
    return new Map();
  }
}

function saveLastResults(results: Map<string, TestResult>) {
  localStorage.setItem(STORAGE_KEYS.LAST_RESULTS, JSON.stringify([...results.values()]));
}

const BATCH_SIZE = 10;

export default function Dashboard() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [results, setResults] = useState<Map<string, TestResult>>(loadLastResults);
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<ModelCategory | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("provider");
  const [sortAsc, setSortAsc] = useState(true);
  const [loadingModels, setLoadingModels] = useState(true);
  const [testingAll, setTestingAll] = useState(false);
  const [testingSingle, setTestingSingle] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newModels, setNewModels] = useState<Set<string>>(new Set());
  const [uptime, setUptime] = useState<Record<string, UptimeRecord[]>>(loadUptime);
  const [shareTooltip, setShareTooltip] = useState(false);
  const [testProgress, setTestProgress] = useState({ done: 0, total: 0 });

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

        // Detect new models
        const known = loadKnownModels();
        const currentIds = fetchedModels.map((m: ModelInfo) => m.id);
        if (known.size > 0) {
          const newOnes = new Set(currentIds.filter((id: string) => !known.has(id)));
          if (newOnes.size > 0) setNewModels(newOnes);
        }
        saveKnownModels(currentIds);

        if (data.errors?.nvidia) setError(`NVIDIA: ${data.errors.nvidia}`);
      }
    } catch {
      setError("Failed to fetch models");
    }
    setLoadingModels(false);
  }, []);

  useEffect(() => {
    loadModels();
    const interval = setInterval(loadModels, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadModels]);

  const updateResults = (newResults: Map<string, TestResult>) => {
    setResults(newResults);
    saveLastResults(newResults);
    // Append to uptime history
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

  const testAll = async () => {
    setTestingAll(true);
    setTestProgress({ done: 0, total: models.length });
    const allResults = new Map<string, TestResult>();

    for (let i = 0; i < models.length; i += BATCH_SIZE) {
      const batch = models.slice(i, i + BATCH_SIZE);
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
          setTestProgress({ done: Math.min(i + BATCH_SIZE, models.length), total: models.length });
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

    let updatedUptime = uptime;
    for (const [id, result] of allResults) {
      updatedUptime = appendUptime(updatedUptime, id, result);
    }
    saveUptime(updatedUptime);
    setUptime(loadUptime());

    setTestProgress({ done: models.length, total: models.length });
    setTestingAll(false);
  };

  const filtered = models
    .filter(
      (m) =>
        (providerFilter === "all" || m.provider === providerFilter) &&
        (categoryFilter === "all" || m.category === categoryFilter) &&
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

  const statusColor = (s: string) => {
    switch (s) {
      case "working": return "text-emerald-400";
      case "slow": return "text-yellow-400";
      case "error": return "text-red-400";
      case "timeout": return "text-orange-400";
      case "removed": return "text-gray-500";
      default: return "text-gray-400";
    }
  };

  const statusBg = (s: string) => {
    switch (s) {
      case "working": return "bg-emerald-400/10";
      case "slow": return "bg-yellow-400/10";
      case "error": return "bg-red-400/10";
      case "timeout": return "bg-orange-400/10";
      case "removed": return "bg-gray-500/10";
      default: return "";
    }
  };

  const providerBadge = (p: string) => {
    switch (p) {
      case "nvidia": return "bg-green-900/40 text-green-300 border-green-700/50";
      case "opencode": return "bg-purple-900/40 text-purple-300 border-purple-700/50";
      default: return "bg-gray-800 text-gray-400 border-gray-700";
    }
  };

  const categoryBadge = (c: ModelCategory) => {
    switch (c) {
      case "chat": return "bg-blue-900/40 text-blue-300";
      case "code": return "bg-orange-900/40 text-orange-300";
      case "vision": return "bg-pink-900/40 text-pink-300";
      case "embedding": return "bg-cyan-900/40 text-cyan-300";
      case "audio": return "bg-violet-900/40 text-violet-300";
      default: return "bg-gray-800 text-gray-400";
    }
  };

  const shareResults = () => {
    const data = { ts: Date.now(), results: [...results.values()] };
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    const encoded = btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const url = `${window.location.origin}/results/${encoded}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareTooltip(true);
      setTimeout(() => setShareTooltip(false), 2000);
    });
  };

  const counts = {
    total: models.length,
    nvidia: models.filter((m) => m.provider === "nvidia").length,
    opencode: models.filter((m) => m.provider === "opencode").length,
    working: [...results.values()].filter((r) => r.status === "working").length,
    slow: [...results.values()].filter((r) => r.status === "slow").length,
    error: [...results.values()].filter((r) => r.status === "error" || r.status === "timeout").length,
    removed: [...results.values()].filter((r) => r.status === "removed").length,
    new: newModels.size,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Open Source Model Tracker</h1>
          <p className="text-sm text-gray-500 mt-1">
            Check which free AI models are live on NVIDIA NIM and OpenCode
          </p>
          {lastRefresh && (
            <p className="text-xs text-gray-600 mt-1">
              Last refresh: {lastRefresh.toLocaleTimeString()}
            </p>
          )}
        </div>
        <button
          onClick={testAll}
          disabled={testingAll || models.length === 0}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-medium transition-colors text-sm"
        >
          {testingAll ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Testing {testProgress.done}/{testProgress.total}
            </span>
          ) : (
            "Test All Models"
          )}
        </button>
        <div className="relative">
          <button
            onClick={shareResults}
            disabled={results.size === 0}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 disabled:cursor-not-allowed rounded-lg font-medium transition-colors text-sm border border-gray-700"
          >
            Share Results
          </button>
          {shareTooltip && (
            <div className="absolute -bottom-8 right-0 text-xs text-emerald-400 bg-gray-900 px-2 py-1 rounded border border-gray-700 whitespace-nowrap">
              Copied to clipboard!
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6 text-red-300 text-sm">
          {error}
        </div>
      )}

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

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
        {[
          { label: "Total", value: counts.total, color: "text-white" },
          { label: "NVIDIA", value: counts.nvidia, color: "text-green-400" },
          { label: "OpenCode", value: counts.opencode, color: "text-purple-400" },
          { label: "Working", value: counts.working, color: "text-emerald-400" },
          { label: "Slow", value: counts.slow, color: "text-yellow-400" },
          { label: "Error", value: counts.error, color: "text-red-400" },
          { label: "Removed", value: counts.removed, color: "text-gray-500" },
          { label: "New", value: counts.new, color: "text-cyan-400" },
        ].map((s) => (
          <div key={s.label} className="bg-gray-900 rounded-lg p-3 text-center border border-gray-800">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          placeholder="Search models..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
        <div className="flex gap-2">
          {["all", "nvidia", "opencode"].map((p) => (
            <button
              key={p}
              onClick={() => setProviderFilter(p)}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                providerFilter === p
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500"
              }`}
            >
              {p === "all" ? "All" : p === "nvidia" ? "NVIDIA" : "OpenCode"}
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
                : "bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loadingModels ? (
        <div className="text-center py-20 text-gray-500">
          <svg className="animate-spin h-8 w-8 mx-auto mb-4 text-gray-600" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading models...
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/50 text-gray-400">
                {[
                  { key: "provider" as SortKey, label: "Provider" },
                  { key: "displayName" as SortKey, label: "Model" },
                  { key: "category" as SortKey, label: "Category" },
                  { key: "status" as SortKey, label: "Status" },
                  { key: "responseTimeMs" as SortKey, label: "Response" },
                  { key: null, label: "Uptime" },
                  { key: null, label: "Tools" },
                  { key: null, label: "" },
                ].map((col) => (
                  <th
                    key={col.label}
                    className={`text-left px-4 py-3 ${col.key ? "cursor-pointer hover:text-white select-none" : ""}`}
                    onClick={() => col.key && toggleSort(col.key)}
                  >
                    {col.label}
                    {col.key === sortKey && (sortAsc ? " ▲" : " ▼")}
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
                return (
                  <tr
                    key={m.id}
                    className={`border-b border-gray-800/50 hover:bg-gray-900/30 ${r ? statusBg(r.status) : ""}`}
                  >
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${providerBadge(m.provider)}`}>
                        {m.provider}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <a
                          href={m.provider === "nvidia" ? nvidiaModelUrl(m.id) : undefined}
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
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-900/60 text-amber-300 border border-amber-700/50 font-medium" title="Breaks with T3 Code — only supports Responses API, not Chat Completions">
                            T3 ⚠
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 font-mono">{m.id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${categoryBadge(m.category)}`}>
                        {m.category}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r ? (
                        <div>
                          <span className={`font-medium text-sm ${statusColor(r.status)}`}>
                            {r.status}
                          </span>
                          {r.error && (
                            <div className="text-xs text-gray-500 max-w-xs truncate mt-0.5" title={r.error}>
                              {r.error}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-600 text-sm">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {r ? (
                        <span className={r.responseTimeMs > 5000 ? "text-yellow-400" : ""}>
                          {r.responseTimeMs}ms
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {uptimePercent > 0 ? (
                        <span className={uptimePercent >= 90 ? "text-emerald-400" : uptimePercent >= 50 ? "text-yellow-400" : "text-red-400"}>
                          {uptimePercent}%
                        </span>
                      ) : (
                        <span className="text-gray-700">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r?.supportsFunctionCalling ? (
                        <span className="text-emerald-400">Yes</span>
                      ) : r ? (
                        <span className="text-gray-600">No</span>
                      ) : (
                        <span className="text-gray-700">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => testOne(m)}
                        disabled={isTesting}
                        className="px-3 py-1 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 disabled:cursor-not-allowed rounded text-xs transition-colors border border-gray-700"
                      >
                        {isTesting ? (
                          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
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
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                    No models found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
