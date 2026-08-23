"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ModelInfo,
  TestResult,
  ModelCategory,
  Provider,
  UptimeRecord,
  nvidiaModelUrl,
  openrouterModelUrl,
  isT3Breaking,
  isKnownSlow,
  isT3Available,
} from "@/lib/models";

type SortKey = "displayName" | "provider" | "status" | "responseTimeMs" | "category";

const STORAGE_KEYS = {
  KNOWN_MODELS: "model-tracker-known-models",
  UPTIME: "model-tracker-uptime",
  LAST_RESULTS: "model-tracker-last-results",
  CHANGELOG: "model-tracker-changelog",
  THEME: "model-tracker-theme",
  HIDE_ENDPOINTS: "model-tracker-hide-endpoints",
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

interface ChangelogEntry {
  timestamp: number;
  type: "added" | "removed";
  modelId: string;
  displayName: string;
}

function loadKnownModels(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.KNOWN_MODELS);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

// Default true: embeddings/TTS/image/classifier endpoints are noise unless you
// specifically want them; opting out persists.
function loadHideEndpoints(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.HIDE_ENDPOINTS) !== "false";
  } catch {
    return true;
  }
}

function saveKnownModels(ids: string[]) {
  localStorage.setItem(STORAGE_KEYS.KNOWN_MODELS, JSON.stringify(ids));
}

function loadChangelog(): ChangelogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CHANGELOG);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveChangelog(entries: ChangelogEntry[]) {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const trimmed = entries.filter((e) => e.timestamp > thirtyDaysAgo);
  localStorage.setItem(STORAGE_KEYS.CHANGELOG, JSON.stringify(trimmed));
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

// One bucket per calendar day, oldest first; ratio is healthy checks / total
function dailyBuckets(records: UptimeRecord[]): { ratio: number; count: number }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = Array.from({ length: 7 }, () => ({ healthy: 0, total: 0 }));
  for (const r of records) {
    const day = new Date(r.timestamp);
    day.setHours(0, 0, 0, 0);
    const idx = 6 - Math.floor((today.getTime() - day.getTime()) / 86400000);
    if (idx < 0 || idx > 6) continue;
    buckets[idx].total++;
    if (r.status === "working" || r.status === "slow") buckets[idx].healthy++;
  }
  return buckets.map((b) => ({ ratio: b.total ? b.healthy / b.total : 0, count: b.total }));
}

function UptimeSparkline({ records, theme }: { records: UptimeRecord[]; theme: "dark" | "light" }) {
  const buckets = dailyBuckets(records);
  const emptyCls = theme === "dark" ? "bg-gray-700" : "bg-gray-200";
  return (
    <div className="flex items-end gap-[2px]" aria-hidden="true">
      {buckets.map((b, i) => {
        const cls =
          b.count === 0
            ? emptyCls
            : b.ratio >= 0.9
              ? "bg-emerald-400"
              : b.ratio >= 0.5
                ? "bg-yellow-400"
                : "bg-red-400";
        const title =
          b.count === 0
            ? "no checks"
            : `${Math.round(b.ratio * 100)}% up · ${b.count} check${b.count > 1 ? "s" : ""}`;
        return <div key={i} className={`w-1 h-3.5 rounded-sm ${cls}`} title={title} />;
      })}
    </div>
  );
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

function loadTheme(): "dark" | "light" {
  try {
    return (localStorage.getItem(STORAGE_KEYS.THEME) as "dark" | "light") || "dark";
  } catch {
    return "dark";
  }
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
  const [theme, setTheme] = useState<"dark" | "light">(loadTheme);
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [changelog, setChangelog] = useState<ChangelogEntry[]>(loadChangelog);
  const [hideEndpoints, setHideEndpoints] = useState<boolean>(loadHideEndpoints);

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

  const testAll = async () => {
    setTestingAll(true);
    // Skip known-slow models during test-all
    const testable = models.filter((m) => !isKnownSlow(m.id));
    const skipped = models.filter((m) => isKnownSlow(m.id));
    setTestProgress({ done: 0, total: testable.length });
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

    let updatedUptime = uptime;
    for (const [id, result] of allResults) {
      updatedUptime = appendUptime(updatedUptime, id, result);
    }
    saveUptime(updatedUptime);
    setUptime(loadUptime());

    setTestProgress({ done: testable.length, total: testable.length });
    setTestingAll(false);
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

  const filtered = models
    .filter(
      (m) =>
        (providerFilter === "all" || m.provider === providerFilter) &&
        (categoryFilter === "all" || m.category === categoryFilter) &&
        (!hideEndpoints ||
          m.category === "chat" ||
          m.category === "code" ||
          m.category === "vision") &&
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
      case "working": return theme === "dark" ? "text-emerald-400" : "text-emerald-600";
      case "slow": return theme === "dark" ? "text-yellow-400" : "text-yellow-600";
      case "error": return theme === "dark" ? "text-red-400" : "text-red-600";
      case "timeout": return theme === "dark" ? "text-orange-400" : "text-orange-600";
      case "removed": return theme === "dark" ? "text-gray-500" : "text-gray-400";
      default: return theme === "dark" ? "text-gray-400" : "text-gray-500";
    }
  };

  const statusBg = (s: string) => {
    if (theme === "light") {
      switch (s) {
        case "working": return "bg-emerald-50";
        case "slow": return "bg-yellow-50";
        case "error": return "bg-red-50";
        case "timeout": return "bg-orange-50";
        case "removed": return "bg-gray-50";
        default: return "";
      }
    }
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
    if (theme === "light") {
      switch (p) {
        case "nvidia": return "bg-green-50 text-green-700 border-green-200";
        case "opencode": return "bg-purple-50 text-purple-700 border-purple-200";
        case "openrouter": return "bg-blue-50 text-blue-700 border-blue-200";
        default: return "bg-gray-100 text-gray-600 border-gray-200";
      }
    }
    switch (p) {
      case "nvidia": return "bg-green-900/40 text-green-300 border-green-700/50";
      case "opencode": return "bg-purple-900/40 text-purple-300 border-purple-700/50";
      case "openrouter": return "bg-blue-900/40 text-blue-300 border-blue-700/50";
      default: return "bg-gray-800 text-gray-400 border-gray-700";
    }
  };

  const categoryBadge = (c: ModelCategory) => {
    if (theme === "light") {
      switch (c) {
        case "chat": return "bg-blue-50 text-blue-700";
        case "code": return "bg-orange-50 text-orange-700";
        case "vision": return "bg-pink-50 text-pink-700";
        case "embedding": return "bg-cyan-50 text-cyan-700";
        case "audio": return "bg-violet-50 text-violet-700";
        default: return "bg-gray-100 text-gray-600";
      }
    }
    switch (c) {
      case "chat": return "bg-blue-900/40 text-blue-300";
      case "code": return "bg-orange-900/40 text-orange-300";
      case "vision": return "bg-pink-900/40 text-pink-300";
      case "embedding": return "bg-cyan-900/40 text-cyan-300";
      case "audio": return "bg-violet-900/40 text-violet-300";
      default: return "bg-gray-800 text-gray-400";
    }
  };

  const counts = {
    total: models.length,
    nvidia: models.filter((m) => m.provider === "nvidia").length,
    opencode: models.filter((m) => m.provider === "opencode").length,
    openrouter: models.filter((m) => m.provider === "openrouter").length,
    working: [...results.values()].filter((r) => r.status === "working").length,
    slow: [...results.values()].filter((r) => r.status === "slow").length,
    error: [...results.values()].filter((r) => r.status === "error" || r.status === "timeout").length,
    removed: [...results.values()].filter((r) => r.status === "removed").length,
    new: newModels.size,
  };

  const PROVIDERS: Provider[] = ["nvidia", "opencode", "openrouter"];
  const providerHealth = PROVIDERS.map((p) => {
    const pr = [...results.values()].filter((r) => r.provider === p);
    const working = pr.filter((r) => r.status === "working").length;
    const slow = pr.filter((r) => r.status === "slow").length;
    const down = pr.filter((r) => r.status === "error" || r.status === "timeout").length;
    const tested = working + slow + down;
    const times = pr.filter((r) => r.status === "working").map((r) => r.responseTimeMs);
    const avgMs = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
    return { provider: p, total: models.filter((m) => m.provider === p).length, tested, working, slow, down, avgMs };
  });

  const compared = models.filter((m) => compareIds.has(m.id));
  const bg = theme === "dark" ? "bg-gray-950" : "bg-gray-50";
  const cardBg = theme === "dark" ? "bg-gray-900" : "bg-white";
  const border = theme === "dark" ? "border-gray-800" : "border-gray-200";
  const text = theme === "dark" ? "text-white" : "text-gray-900";
  const textMuted = theme === "dark" ? "text-gray-500" : "text-gray-400";
  const inputBg = theme === "dark" ? "bg-gray-900" : "bg-white";

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
              className={`px-3 py-2 rounded-lg text-sm border transition-colors ${cardBg} ${border} ${textMuted} hover:${text}`}
            >
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            <button
              onClick={() => { setShowChangelog(!showChangelog); setShowCompare(false); }}
              className={`px-3 py-2 rounded-lg text-sm border transition-colors ${cardBg} ${border} ${textMuted} hover:${text}`}
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
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Testing {testProgress.done}/{testProgress.total}
                </span>
              ) : (
                "Test All"
              )}
            </button>
            <div className="relative">
              <button
                onClick={shareResults}
                disabled={results.size === 0}
                className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm border ${cardBg} ${border} disabled:opacity-50 disabled:cursor-not-allowed ${textMuted} hover:${text}`}
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
        {showChangelog && (
          <div className={`mb-6 p-4 rounded-lg border ${cardBg} ${border}`}>
            <h2 className="font-bold mb-3">Model Changelog (30 days)</h2>
            {changelog.length === 0 ? (
              <p className={`text-sm ${textMuted}`}>No changes recorded yet. Changes are tracked as you visit.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {[...changelog].reverse().map((e, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className={e.type === "added" ? "text-emerald-400" : "text-red-400"}>
                      {e.type === "added" ? "+" : "-"}
                    </span>
                    <span className="font-mono text-xs">{e.displayName}</span>
                    <span className={`text-xs ${textMuted}`}>
                      {new Date(e.timestamp).toLocaleDateString()} {new Date(e.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Compare Panel */}
        {showCompare && compared.length > 0 && (
          <div className={`mb-6 p-4 rounded-lg border ${cardBg} ${border}`}>
            <h2 className="font-bold mb-3">Model Comparison</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b ${border}`}>
                    <th className="text-left px-3 py-2">Metric</th>
                    {compared.map((m) => (
                      <th key={m.id} className="text-left px-3 py-2">{m.displayName}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className={`border-b ${border}`}>
                    <td className={`px-3 py-2 ${textMuted}`}>Provider</td>
                    {compared.map((m) => (
                      <td key={m.id} className="px-3 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${providerBadge(m.provider)}`}>{m.provider}</span>
                      </td>
                    ))}
                  </tr>
                  <tr className={`border-b ${border}`}>
                    <td className={`px-3 py-2 ${textMuted}`}>Category</td>
                    {compared.map((m) => (
                      <td key={m.id} className="px-3 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${categoryBadge(m.category)}`}>{m.category}</span>
                      </td>
                    ))}
                  </tr>
                  <tr className={`border-b ${border}`}>
                    <td className={`px-3 py-2 ${textMuted}`}>In T3 Code</td>
                    {compared.map((m) => (
                      <td key={m.id} className="px-3 py-2 text-xs">
                        {isT3Available(m.id) ? <span className="text-emerald-400">Yes</span> : <span className={textMuted}>No</span>}
                      </td>
                    ))}
                  </tr>
                  <tr className={`border-b ${border}`}>
                    <td className={`px-3 py-2 ${textMuted}`}>Status</td>
                    {compared.map((m) => {
                      const r = results.get(m.id);
                      return (
                        <td key={m.id} className={`px-3 py-2 font-medium ${statusColor(r?.status || "error")}`}>
                          {r?.status || "not tested"}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className={`border-b ${border}`}>
                    <td className={`px-3 py-2 ${textMuted}`}>Response</td>
                    {compared.map((m) => {
                      const r = results.get(m.id);
                      return (
                        <td key={m.id} className="px-3 py-2 font-mono text-xs">
                          {r ? `${r.responseTimeMs}ms` : "-"}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className={`border-b ${border}`}>
                    <td className={`px-3 py-2 ${textMuted}`}>Function Calling</td>
                    {compared.map((m) => {
                      const r = results.get(m.id);
                      return (
                        <td key={m.id} className="px-3 py-2 text-xs">
                          {r?.supportsFunctionCalling ? "Yes" : "No"}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td className={`px-3 py-2 ${textMuted}`}>Uptime</td>
                    {compared.map((m) => {
                      const pct = computeUptimePercent(uptime[m.id] || []);
                      return (
                        <td key={m.id} className="px-3 py-2 text-xs">
                          {pct > 0 ? `${pct}%` : "-"}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
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
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-3 mb-6">
          {[
            { label: "Total", value: counts.total, color: theme === "dark" ? "text-white" : "text-gray-900" },
            { label: "NVIDIA", value: counts.nvidia, color: "text-green-400" },
            { label: "OpenCode", value: counts.opencode, color: "text-purple-400" },
            { label: "OpenRouter", value: counts.openrouter, color: "text-blue-400" },
            { label: "Working", value: counts.working, color: "text-emerald-400" },
            { label: "Slow", value: counts.slow, color: "text-yellow-400" },
            { label: "Error", value: counts.error, color: "text-red-400" },
            { label: "Removed", value: counts.removed, color: "text-gray-500" },
            { label: "New", value: counts.new, color: "text-cyan-400" },
          ].map((s) => (
            <div key={s.label} className={`${cardBg} rounded-lg p-3 text-center border ${border}`}>
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className={`text-xs ${textMuted}`}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Provider health */}
        <div className="grid sm:grid-cols-3 gap-3 mb-6">
          {providerHealth.map((h) => {
            const ok = h.tested > 0 && h.down === 0;
            const partial = h.tested > 0 && h.working + h.slow > 0;
            const dot = h.tested === 0 ? "bg-gray-500" : ok ? "bg-emerald-400" : partial ? "bg-yellow-400" : "bg-red-400";
            const accent = h.tested === 0 ? textMuted : ok ? "text-emerald-400" : partial ? "text-yellow-400" : "text-red-400";
            return (
              <div key={h.provider} className={`${cardBg} rounded-lg p-3 border ${border}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
                  <span className="font-medium text-sm capitalize">{h.provider}</span>
                  <span className={`ml-auto text-xs ${accent}`}>
                    {h.tested === 0 ? "not tested" : `${h.working + h.slow}/${h.tested} up`}
                  </span>
                </div>
                <div className={`text-xs ${textMuted}`}>
                  {h.tested === 0
                    ? `${h.total} models · run Test All to check`
                    : `${h.working} working · ${h.slow} slow · ${h.down} down${h.avgMs ? ` · avg ${h.avgMs}ms` : ""}`}
                </div>
              </div>
            );
          })}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="text"
            placeholder="Search models..."
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
            <svg className="animate-spin h-8 w-8 mx-auto mb-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
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
                      { key: null, label: "T3" },
                      { key: "status" as SortKey, label: "Status" },
                      { key: "responseTimeMs" as SortKey, label: "Response" },
                      { key: null, label: "Uptime" },
                      { key: null, label: "Tools" },
                      { key: null, label: "" },
                    ].map((col) => (
                      <th
                        key={col.label}
                        className={`text-left px-4 py-3 ${col.key ? "cursor-pointer hover:" + text + " select-none" : ""}`}
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
                        className={`border-b ${border}/50 hover:${theme === "dark" ? "bg-gray-900/30" : "bg-gray-50"} ${r ? statusBg(r.status) : ""}`}
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
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${providerBadge(m.provider)}`}>
                            {m.provider}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <a
                              href={m.provider === "nvidia" ? nvidiaModelUrl(m.id) : m.provider === "openrouter" ? openrouterModelUrl(m.id) : undefined}
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
                          <div className={`text-xs ${textMuted} font-mono`}>{m.id}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${categoryBadge(m.category)}`}>
                            {m.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {t3Avail ? (
                            <span className="text-emerald-400" title="Available in T3 Code">Yes</span>
                          ) : (
                            <span className={textMuted}>No</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r ? (
                            <div>
                              <span className={`font-medium text-sm ${statusColor(r.status)}`}>
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
                            <span className={r.responseTimeMs > 5000 ? "text-yellow-400" : ""}>
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
                              <span className={uptimePercent >= 90 ? "text-emerald-400" : uptimePercent >= 50 ? "text-yellow-400" : "text-red-400"}>
                                {uptimePercent}%
                              </span>
                            </div>
                          ) : (
                            <span className={textMuted}>-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {r?.supportsFunctionCalling ? (
                            <span className="text-emerald-400">Yes</span>
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
                            className={`px-3 py-1 ${cardBg} hover:${theme === "dark" ? "bg-gray-700" : "bg-gray-100"} disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs transition-colors border ${border}`}
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
                    className={`${cardBg} rounded-lg border ${border} p-4 ${r ? statusBg(r.status) : ""}`}
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
                          href={m.provider === "nvidia" ? nvidiaModelUrl(m.id) : m.provider === "openrouter" ? openrouterModelUrl(m.id) : undefined}
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
                      <button
                        onClick={() => testOne(m)}
                        disabled={testingSingle === m.id}
                        className={`px-3 py-1 ${cardBg} rounded text-xs border ${border} disabled:opacity-50`}
                      >
                        {testingSingle === m.id ? "..." : "Test"}
                      </button>
                    </div>
                    <div className={`text-xs ${textMuted} font-mono mb-2`}>{m.id}</div>
                    {uptimePercent > 0 && (
                      <div className="flex items-center gap-2 mb-2">
                        <UptimeSparkline records={uptime[m.id] || []} theme={theme} />
                        <span className={`text-xs ${textMuted}`}>{uptimePercent}% uptime (7d)</span>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className={`px-2 py-0.5 rounded-full border ${providerBadge(m.provider)}`}>{m.provider}</span>
                      <span className={`px-2 py-0.5 rounded-full ${categoryBadge(m.category)}`}>{m.category}</span>
                      <span className={t3Avail ? "text-emerald-400" : `${textMuted}`}>
                        T3: {t3Avail ? "Yes" : "No"}
                      </span>
                      {r && (
                        <>
                          <span className={statusColor(r.status)}>{r.status}</span>
                          <span className="font-mono">{r.responseTimeMs}ms</span>
                          {r.supportsFunctionCalling && <span className="text-emerald-400">tools</span>}
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
