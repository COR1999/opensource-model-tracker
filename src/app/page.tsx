"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { encodeSnapshot } from "@/lib/share";
import { CATEGORY_OPTIONS } from "@/lib/curated";
import { isKnownSlow } from "@/lib/categories";
import { styles, type Theme } from "@/lib/display";
import {
  loadHideEndpoints,
  loadTheme,
  loadDensity,
  saveDensity,
  type Density,
} from "@/lib/storage";
import { useModelCatalog } from "@/hooks/useModelCatalog";
import { useModelTesting } from "@/hooks/useModelTesting";
import type { SortKey } from "@/components/ModelTable";
import DashboardHeader from "@/components/DashboardHeader";
import StatsGrid from "@/components/StatsGrid";
import ProviderHealthStrip, { computeProviderHealth } from "@/components/ProviderHealthStrip";
import FilterBar, { type Filters } from "@/components/FilterBar";
import ModelTable from "@/components/ModelTable";
import ModelCardList from "@/components/ModelCardList";
import ChangelogPanel from "@/components/ChangelogPanel";
import ComparePanel from "@/components/ComparePanel";
import Toast, { type ToastMessage } from "@/components/Toast";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";

const DEFAULT_FILTERS: Filters = {
  search: "",
  provider: "all",
  category: "all",
  status: "all",
  hideEndpoints: true,
};

export default function Dashboard() {
  // Persisted UI state loads in mount effects, never in state initializers:
  // localStorage exists only on the client, so initializer reads produce SSR
  // markup that disagrees with the client's first render.
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>("provider");
  const [sortAsc, setSortAsc] = useState(true);
  const [theme, setTheme] = useState<Theme>("dark");
  const [density, setDensity] = useState<Density>("comfortable");
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [toastMsg, setToastMsg] = useState<ToastMessage | null>(null);
  const [now, setNow] = useState(() => new Date());
  const searchRef = useRef<HTMLInputElement>(null);
  const lastAutoTested = useRef<Set<string>>(new Set());

  const showToast = useCallback((text: string, tone: ToastMessage["tone"]) => {
    setToastMsg({ id: Date.now(), text, tone });
  }, []);

  // --- Hooks ---
  const catalog = useModelCatalog();
  const testing = useModelTesting((text, tone) => {
    showToast(text, tone);
  });

  // Persisted UI state loads after mount to keep SSR output stable.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is browser-only; loading in an effect keeps SSR output stable
    setFilters({
      ...DEFAULT_FILTERS,
      hideEndpoints: loadHideEndpoints(),
    });
    setTheme(loadTheme());
    setDensity(loadDensity());
  }, []);

  // URL seeding: ?provider=&category=&q=&working=1
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const provider = params.get("provider");
    const category = params.get("category");
    const q = params.get("q");
    const working = params.get("working") === "1";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seeding from URL after mount is deliberate: reading it during render breaks SSR prerender
    setFilters((prev) => ({
      ...prev,
      provider: provider && ["nvidia", "opencode", "openrouter"].includes(provider) ? provider : prev.provider,
      category: category && CATEGORY_OPTIONS.some((c) => c.value === category) ? (category as Filters["category"]) : prev.category,
      search: q || prev.search,
      status: working ? "working" : prev.status,
    }));
  }, []);

  // Sync URL from filters
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.provider !== "all") params.set("provider", filters.provider);
    if (filters.category !== "all") params.set("category", filters.category);
    if (filters.search) params.set("q", filters.search);
    if (filters.status === "working") params.set("working", "1");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `/?${qs}` : "/");
  }, [filters]);

  // Keyboard shortcut: / to focus search
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

  // Tick clock for relative time display
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Auto-test newly detected models so the "NEW" badge is immediately actionable.
  useEffect(() => {
    if (catalog.newModels.size === 0 || testing.progress !== null) return;
    const newIds = [...catalog.newModels].filter((id) => !lastAutoTested.current.has(id));
    if (newIds.length === 0) return;
    const newModels = catalog.models.filter(
      (m) => newIds.includes(m.id) && !isKnownSlow(m.id),
    );
    if (newModels.length === 0) return;
    lastAutoTested.current = new Set([...lastAutoTested.current, ...newIds]);
    testing.testMany(newModels, "Auto-test new models");
  }, [catalog.newModels, catalog.models, testing]);

  // Persist theme + density
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("model-tracker-theme", theme);
  }, [theme]);

  useEffect(() => {
    saveDensity(density);
  }, [density]);

  useEffect(() => {
    localStorage.setItem("model-tracker-hide-endpoints", filters.hideEndpoints ? "true" : "false");
  }, [filters.hideEndpoints]);

  // --- Derived state ---
  const filtered = useMemo(() => {
    return catalog.models
      .filter(
        (m) =>
          (filters.provider === "all" || m.provider === filters.provider) &&
          (filters.category === "all" || m.category === filters.category) &&
          (!filters.hideEndpoints ||
            m.category === "chat" ||
            m.category === "code" ||
            m.category === "vision") &&
          (filters.status === "all" ||
            (filters.status === "working" &&
              (testing.results.get(m.id)?.status === "working" || testing.results.get(m.id)?.status === "slow")) ||
            (filters.status === "slow" && testing.results.get(m.id)?.status === "slow") ||
            (filters.status === "error" &&
              (testing.results.get(m.id)?.status === "error" || testing.results.get(m.id)?.status === "timeout")) ||
            (filters.status === "untested" && !testing.results.has(m.id))) &&
          (filters.search === "" ||
            m.id.toLowerCase().includes(filters.search.toLowerCase()) ||
            m.displayName.toLowerCase().includes(filters.search.toLowerCase()) ||
            m.ownedBy.toLowerCase().includes(filters.search.toLowerCase()))
      )
      .sort((a, b) => {
        const ra = testing.results.get(a.id);
        const rb = testing.results.get(b.id);

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
          case "contextLength":
            cmp = (a.contextLength ?? 0) - (b.contextLength ?? 0);
            break;
        }
        return sortAsc ? cmp : -cmp;
      });
  }, [catalog.models, testing.results, filters, sortKey, sortAsc]);

  const usableIds = useMemo(() => {
    return catalog.models
      .filter((m) => {
        const s = testing.results.get(m.id)?.status;
        return s === "working" || s === "slow";
      })
      .map((m) => m.id);
  }, [catalog.models, testing.results]);

  // --- Callbacks ---
  const handleToggleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) setSortAsc(!sortAsc);
      else { setSortKey(key); setSortAsc(true); }
    },
    [sortKey, sortAsc]
  );

  const handleFilterChange = useCallback((patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleFilterReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const toggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 3) next.add(id);
      return next;
    });
  }, []);

  const shareResults = useCallback(() => {
    const encoded = encodeSnapshot({ ts: Date.now(), results: [...testing.results.values()] });
    const url = `${window.location.origin}/results/${encoded}`;
    navigator.clipboard.writeText(url).then(() => {
      showToast("Share link copied!", "success");
    });
  }, [testing.results, showToast]);

  const copyId = useCallback(async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      showToast(`Copied: ${id}`, "success");
    } catch {
      // clipboard unavailable (insecure context)
    }
  }, [showToast]);

  const copyWorkingIds = useCallback(async () => {
    if (usableIds.length === 0) return;
    try {
      await navigator.clipboard.writeText(usableIds.join("\n"));
      showToast(`Copied ${usableIds.length} model IDs`, "success");
    } catch {
      // clipboard unavailable
    }
  }, [usableIds, showToast]);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const testVisible = useCallback(async () => {
    const scoped = filtered.filter((m) => !isKnownSlow(m.id));
    await testing.testMany(scoped, "Test Visible");
  }, [filtered, testing]);

  const testAll = useCallback(async () => {
    const testable = catalog.models.filter((m) => !isKnownSlow(m.id));
    await testing.testMany(testable, "Test All");
  }, [catalog.models, testing]);

  // --- Render helpers ---
  const counts = useMemo(
    () => ({
      total: catalog.models.length,
      nvidia: catalog.models.filter((m) => m.provider === "nvidia").length,
      opencode: catalog.models.filter((m) => m.provider === "opencode").length,
      openrouter: catalog.models.filter((m) => m.provider === "openrouter").length,
      tested: testing.results.size,
      working: [...testing.results.values()].filter((r) => r.status === "working").length,
      slow: [...testing.results.values()].filter((r) => r.status === "slow").length,
      error: [...testing.results.values()].filter((r) => r.status === "error" || r.status === "timeout").length,
      removed: [...testing.results.values()].filter((r) => r.status === "removed").length,
      new: catalog.newModels.size,
    }),
    [catalog.models, testing.results, catalog.newModels.size]
  );

  const providerHealth = useMemo(
    () => computeProviderHealth(catalog.models, testing.results, catalog.providerErrors),
    [catalog.models, testing.results, catalog.providerErrors]
  );

  const compared = useMemo(
    () => catalog.models.filter((m) => compareIds.has(m.id)),
    [catalog.models, compareIds]
  );

  const headerActions = (
    <>
      <button
        onClick={testAll}
        disabled={testing.progress !== null || catalog.models.length === 0}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-medium transition-colors text-sm text-white"
      >
        Test All
      </button>
      <button
        onClick={testVisible}
        disabled={testing.progress !== null || filtered.length === 0}
        className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm border ${styles(theme).cardBg} ${styles(theme).border} disabled:opacity-50 disabled:cursor-not-allowed ${styles(theme).textMuted}`}
      >
        Test Visible ({filtered.length})
      </button>
      <button
        onClick={copyWorkingIds}
        disabled={usableIds.length === 0}
        className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm border ${styles(theme).cardBg} ${styles(theme).border} disabled:opacity-50 disabled:cursor-not-allowed ${styles(theme).textMuted}`}
      >
        Copy Working ({usableIds.length})
      </button>
      <button
        onClick={shareResults}
        disabled={testing.results.size === 0}
        className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm border ${styles(theme).cardBg} ${styles(theme).border} disabled:opacity-50 disabled:cursor-not-allowed ${styles(theme).textMuted}`}
      >
        Share
      </button>
      {compareIds.size > 0 && (
        <button
          onClick={() => { setShowCompare(!showCompare); setShowChangelog(false); }}
          className="px-4 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-500 transition-colors"
        >
          Compare ({compareIds.size})
        </button>
      )}
      <button
        onClick={() => { setShowChangelog(!showChangelog); setShowCompare(false); }}
        className={`px-3 py-2 rounded-lg text-sm border transition-colors ${styles(theme).cardBg} ${styles(theme).border} ${styles(theme).textMuted}`}
      >
        Changelog ({catalog.changelog.length})
      </button>
    </>
  );

  const { bg, text } = styles(theme);

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors`}>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <DashboardHeader
          theme={theme}
          onToggleTheme={handleToggleTheme}
          lastRefresh={catalog.lastRefresh}
          now={now}
          refreshing={catalog.refreshing}
          onRefresh={() => catalog.refresh()}
          progress={testing.progress}
          onCancel={testing.cancel}
          actions={headerActions}
        />

        {showChangelog && <ChangelogPanel entries={catalog.changelog} theme={theme} />}

        {showCompare && compared.length > 0 && (
          <ComparePanel
            models={compared}
            results={testing.results}
            uptime={testing.uptime}
            theme={theme}
            onRemove={toggleCompare}
          />
        )}

        {catalog.error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6 text-red-300 text-sm">
            {catalog.error}
          </div>
        )}

        {catalog.newModels.size > 0 && (
          <div className="bg-emerald-900/30 border border-emerald-700 rounded-lg p-4 mb-6 text-emerald-300 text-sm flex items-center gap-2">
            <span className="text-lg">+</span>
            <span>
              <strong>{catalog.newModels.size} new model{catalog.newModels.size > 1 ? "s" : ""}</strong> detected since your last visit!
            </span>
            <button
              onClick={catalog.dismissNewModels}
              className="ml-auto text-emerald-400 hover:text-emerald-300 text-xs underline"
            >
              Dismiss
            </button>
          </div>
        )}

        <StatsGrid
          counts={counts}
          theme={theme}
          onSelectStatus={(status) => handleFilterChange({ status: status ?? "all" })}
          activeStatus={filters.status === "all" ? null : filters.status as "working" | "slow" | "error" | null}
        />

        <ProviderHealthStrip
          health={providerHealth}
          theme={theme}
          activeProvider={filters.provider}
          onSelectProvider={(p) => handleFilterChange({ provider: p })}
        />

        <FilterBar
          ref={searchRef}
          filters={filters}
          theme={theme}
          density={density}
          resultCount={filtered.length}
          totalCount={catalog.models.length}
          onChange={handleFilterChange}
          onReset={handleFilterReset}
          onDensityChange={setDensity}
        />

        {catalog.loading ? (
          <TableSkeleton theme={theme} />
        ) : filtered.length === 0 ? (
          <EmptyState
            theme={theme}
            title="No models found"
            description="Try adjusting your filters or search query."
            action={{ label: "Clear filters", onClick: handleFilterReset }}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <ModelTable
                models={filtered}
                results={testing.results}
                uptime={testing.uptime}
                theme={theme}
                density={density}
                sortKey={sortKey}
                sortAsc={sortAsc}
                onSort={handleToggleSort}
                compareIds={compareIds}
                onToggleCompare={toggleCompare}
                onTest={testing.testOne}
                onCopyId={copyId}
                copiedId={null}
                testingSingle={testing.testingSingle}
                newModels={catalog.newModels}
                busy={testing.progress !== null}
              />
            </div>
            <div className="md:hidden">
              <ModelCardList
                models={filtered}
                results={testing.results}
                uptime={testing.uptime}
                theme={theme}
                compareIds={compareIds}
                onToggleCompare={toggleCompare}
                onTest={testing.testOne}
                onCopyId={copyId}
                copiedId={null}
                testingSingle={testing.testingSingle}
                newModels={catalog.newModels}
              />
            </div>
          </>
        )}
      </div>

      {toastMsg && <Toast message={toastMsg} theme={theme} onDismiss={() => setToastMsg(null)} />}
    </div>
  );
}
