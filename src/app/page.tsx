"use client";

import { useState, useEffect, useCallback } from "react";

interface ModelInfo {
  id: string;
  displayName: string;
  provider: "nvidia" | "opencode";
  ownedBy: string;
}

interface TestResult {
  modelId: string;
  provider: string;
  status: "working" | "slow" | "error" | "timeout" | "removed";
  httpCode: number;
  responseTimeMs: number;
  supportsFunctionCalling: boolean;
  error?: string;
}

type SortKey = "displayName" | "provider" | "status" | "responseTimeMs";

export default function Dashboard() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [results, setResults] = useState<Map<string, TestResult>>(new Map());
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("provider");
  const [sortAsc, setSortAsc] = useState(true);
  const [loadingModels, setLoadingModels] = useState(true);
  const [testingAll, setTestingAll] = useState(false);
  const [testingSingle, setTestingSingle] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadModels = useCallback(async () => {
    setLoadingModels(true);
    setError(null);
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setModels(data.models);
        setLastRefresh(new Date());
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

  const testOne = async (model: ModelInfo) => {
    setTestingSingle(model.id);
    try {
      const res = await fetch("/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      const result: TestResult = await res.json();
      setResults((prev) => new Map(prev).set(model.id, result));
    } catch {
      setResults(
        (prev) =>
          new Map(prev).set(model.id, {
            modelId: model.id,
            provider: model.provider,
            status: "error",
            httpCode: 0,
            responseTimeMs: 0,
            supportsFunctionCalling: false,
            error: "Request failed",
          })
      );
    }
    setTestingSingle(null);
  };

  const testAll = async () => {
    setTestingAll(true);
    try {
      const res = await fetch("/api/test-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.results) {
        const map = new Map<string, TestResult>();
        for (const r of data.results) map.set(r.modelId, r);
        setResults(map);
      }
    } catch {
      setError("Failed to test all models");
    }
    setTestingAll(false);
  };

  const filtered = models
    .filter(
      (m) =>
        (providerFilter === "all" || m.provider === providerFilter) &&
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

  const counts = {
    total: models.length,
    nvidia: models.filter((m) => m.provider === "nvidia").length,
    opencode: models.filter((m) => m.provider === "opencode").length,
    working: [...results.values()].filter((r) => r.status === "working").length,
    slow: [...results.values()].filter((r) => r.status === "slow").length,
    error: [...results.values()].filter((r) => r.status === "error" || r.status === "timeout").length,
    removed: [...results.values()].filter((r) => r.status === "removed").length,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Open Source Model Tracker</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track free AI models across NVIDIA NIM and OpenCode
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
              Testing...
            </span>
          ) : (
            "Test All Models"
          )}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6 text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        {[
          { label: "Total", value: counts.total, color: "text-white" },
          { label: "NVIDIA", value: counts.nvidia, color: "text-green-400" },
          { label: "OpenCode", value: counts.opencode, color: "text-purple-400" },
          { label: "Working", value: counts.working, color: "text-emerald-400" },
          { label: "Slow", value: counts.slow, color: "text-yellow-400" },
          { label: "Error", value: counts.error, color: "text-red-400" },
          { label: "Removed", value: counts.removed, color: "text-gray-500" },
        ].map((s) => (
          <div key={s.label} className="bg-gray-900 rounded-lg p-3 text-center border border-gray-800">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
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
                  { key: "status" as SortKey, label: "Status" },
                  { key: "responseTimeMs" as SortKey, label: "Response" },
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
                      <div className="font-medium text-sm">{m.displayName}</div>
                      <div className="text-xs text-gray-500 font-mono">{m.id}</div>
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
                        <span className={r.responseTimeMs > 15000 ? "text-yellow-400" : ""}>
                          {r.responseTimeMs}ms
                        </span>
                      ) : (
                        "-"
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
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
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
