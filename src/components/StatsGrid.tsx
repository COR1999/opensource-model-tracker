import type { ModelInfo, TestResult } from "@/lib/models";
import { accents, styles, statusDot } from "@/lib/display";
import type { Theme } from "@/lib/display";

export interface DashboardCounts {
  total: number;
  nvidia: number;
  opencode: number;
  openrouter: number;
  tested: number;
  working: number;
  slow: number;
  error: number;
  removed: number;
  new: number;
}

export function computeCounts(
  models: ModelInfo[],
  results: Map<string, TestResult>,
  newCount: number
): DashboardCounts {
  // Single pass over each source rather than one filter per statistic.
  const byProvider = { nvidia: 0, opencode: 0, openrouter: 0 };
  for (const m of models) byProvider[m.provider]++;

  let working = 0;
  let slow = 0;
  let error = 0;
  let removed = 0;
  for (const r of results.values()) {
    if (r.status === "working") working++;
    else if (r.status === "slow") slow++;
    else if (r.status === "error" || r.status === "timeout") error++;
    else if (r.status === "removed") removed++;
  }

  return {
    total: models.length,
    ...byProvider,
    tested: results.size,
    working,
    slow,
    error,
    removed,
    new: newCount,
  };
}

/**
 * Health first, catalog composition second. The previous nine equal-weight
 * cards in a single row gave a provider count the same visual priority as the
 * working/down split, so nothing read as the headline.
 */
export default function StatsGrid({
  counts,
  theme,
  onSelectStatus,
  activeStatus,
}: {
  counts: DashboardCounts;
  theme: Theme;
  onSelectStatus?: (status: "working" | "slow" | "error" | null) => void;
  activeStatus?: "working" | "slow" | "error" | null;
}) {
  const accent = accents(theme);
  const { cardBg, border, text, textMuted, textSubtle } = styles(theme);

  const health = [
    { key: "working" as const, label: "Working", value: counts.working, tone: accent.ok },
    { key: "slow" as const, label: "Slow", value: counts.slow, tone: accent.warn },
    { key: "error" as const, label: "Down", value: counts.error, tone: accent.bad },
  ];

  const untested = Math.max(0, counts.total - counts.tested);
  const healthyPct = counts.tested > 0 ? Math.round(((counts.working + counts.slow) / counts.tested) * 100) : null;

  return (
    <section aria-label="Catalog summary" className="mb-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Headline card */}
        <div className={`rounded-xl border p-4 ${cardBg} ${border} sm:col-span-2 lg:col-span-1`}>
          <p className={`text-xs font-medium uppercase tracking-wider ${textMuted}`}>
            Models tracked
          </p>
          <p className={`mt-1 text-3xl font-semibold tabular-nums ${text}`}>{counts.total}</p>
          <p className={`mt-1 text-xs ${textSubtle}`}>
            {counts.tested > 0
              ? `${counts.tested} tested · ${untested} not yet tested`
              : "None tested yet"}
            {counts.new > 0 && (
              <>
                {" · "}
                <span className={accent.info}>{counts.new} new</span>
              </>
            )}
          </p>
        </div>

        {/* Health cards double as status filters */}
        {health.map((h) => {
          const active = activeStatus === h.key;
          const interactive = Boolean(onSelectStatus) && (h.value > 0 || active);
          const share = counts.tested > 0 ? Math.round((h.value / counts.tested) * 100) : 0;

          const inner = (
            <>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${statusDot(h.key)}`} aria-hidden="true" />
                <span className={`text-xs font-medium uppercase tracking-wider ${textMuted}`}>
                  {h.label}
                </span>
              </div>
              <p className={`mt-1 text-3xl font-semibold tabular-nums ${h.tone}`}>{h.value}</p>
              <p className={`mt-1 text-xs ${textSubtle}`}>
                {counts.tested > 0 ? `${share}% of tested` : "Awaiting a test run"}
              </p>
            </>
          );

          if (!interactive) {
            return (
              <div key={h.key} className={`rounded-xl border p-4 ${cardBg} ${border}`}>
                {inner}
              </div>
            );
          }

          return (
            <button
              key={h.key}
              type="button"
              onClick={() => onSelectStatus?.(active ? null : h.key)}
              aria-pressed={active}
              className={`rounded-xl border p-4 text-left transition-colors ${cardBg} ${
                active ? "border-blue-500 ring-1 ring-blue-500/40" : border
              } hover:border-blue-500/60`}
            >
              {inner}
              <span className="sr-only">
                {active ? "Clear status filter" : `Filter to ${h.label.toLowerCase()} models`}
              </span>
            </button>
          );
        })}
      </div>

      {/* Provider composition, deliberately lighter weight than the health row */}
      <div className={`mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs ${textMuted}`}>
        {healthyPct !== null && (
          <span>
            <span className={`font-semibold ${accent.ok}`}>{healthyPct}%</span> of tested models
            reachable
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden="true" />
          NVIDIA <span className="tabular-nums">{counts.nvidia}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-purple-500" aria-hidden="true" />
          OpenCode <span className="tabular-nums">{counts.opencode}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden="true" />
          OpenRouter <span className="tabular-nums">{counts.openrouter}</span>
        </span>
        {counts.removed > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-gray-500" aria-hidden="true" />
            Removed <span className="tabular-nums">{counts.removed}</span>
          </span>
        )}
      </div>
    </section>
  );
}
