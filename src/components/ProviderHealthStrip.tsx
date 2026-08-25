import type { ModelInfo, Provider, TestResult } from "@/lib/models";
import { accents, styles, providerLabel, formatDuration } from "@/lib/display";
import type { Theme } from "@/lib/display";

const PROVIDERS: Provider[] = ["nvidia", "opencode", "openrouter"];

export interface ProviderHealth {
  provider: Provider;
  total: number;
  tested: number;
  working: number;
  slow: number;
  down: number;
  avgMs: number;
  /** Discovery failed for this provider on the last catalog refresh. */
  error?: string;
}

export function computeProviderHealth(
  models: ModelInfo[],
  results: Map<string, TestResult>,
  providerErrors: Partial<Record<Provider, string>> = {}
): ProviderHealth[] {
  const totals: Record<Provider, number> = { nvidia: 0, opencode: 0, openrouter: 0 };
  for (const m of models) totals[m.provider]++;

  const acc: Record<Provider, { working: number; slow: number; down: number; ms: number[] }> = {
    nvidia: { working: 0, slow: 0, down: 0, ms: [] },
    opencode: { working: 0, slow: 0, down: 0, ms: [] },
    openrouter: { working: 0, slow: 0, down: 0, ms: [] },
  };
  for (const r of results.values()) {
    const bucket = acc[r.provider];
    if (!bucket) continue;
    if (r.status === "working") {
      bucket.working++;
      bucket.ms.push(r.responseTimeMs);
    } else if (r.status === "slow") {
      bucket.slow++;
      // Slow responses are still successful responses; excluding them made the
      // average look better the worse a provider actually performed.
      bucket.ms.push(r.responseTimeMs);
    } else if (r.status === "error" || r.status === "timeout") {
      bucket.down++;
    }
  }

  return PROVIDERS.map((p) => {
    const a = acc[p];
    return {
      provider: p,
      total: totals[p],
      tested: a.working + a.slow + a.down,
      working: a.working,
      slow: a.slow,
      down: a.down,
      avgMs: a.ms.length ? Math.round(a.ms.reduce((x, y) => x + y, 0) / a.ms.length) : 0,
      error: providerErrors[p],
    };
  });
}

export default function ProviderHealthStrip({
  health,
  theme,
  activeProvider,
  onSelectProvider,
}: {
  health: ProviderHealth[];
  theme: Theme;
  activeProvider: string;
  onSelectProvider: (provider: string) => void;
}) {
  const accent = accents(theme);
  const { cardBg, border, text, textMuted, textSubtle } = styles(theme);

  return (
    <section aria-label="Provider health" className="mb-6 grid gap-3 sm:grid-cols-3">
      {health.map((h) => {
        const up = h.working + h.slow;
        const ratio = h.tested > 0 ? up / h.tested : 0;
        const dot = h.error
          ? "bg-red-500"
          : h.tested === 0
            ? "bg-gray-500"
            : ratio === 1
              ? "bg-emerald-500"
              : ratio > 0
                ? "bg-amber-500"
                : "bg-red-500";
        const toneClass = h.error
          ? accent.bad
          : h.tested === 0
            ? textSubtle
            : ratio === 1
              ? accent.ok
              : ratio > 0
                ? accent.warn
                : accent.bad;
        const active = activeProvider === h.provider;

        return (
          <button
            key={h.provider}
            type="button"
            onClick={() => onSelectProvider(active ? "all" : h.provider)}
            aria-pressed={active}
            className={`rounded-xl border p-3 text-left transition-colors ${cardBg} ${
              active ? "border-blue-500 ring-1 ring-blue-500/40" : border
            } hover:border-blue-500/60`}
          >
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 flex-none rounded-full ${dot}`} aria-hidden="true" />
              <span className={`text-sm font-medium ${text}`}>{providerLabel(h.provider)}</span>
              <span className={`ml-auto text-xs font-medium tabular-nums ${toneClass}`}>
                {h.error ? "unavailable" : h.tested === 0 ? "not tested" : `${up}/${h.tested} up`}
              </span>
            </div>

            {/* Proportional bar: the numbers alone made it hard to compare
                providers at a glance. */}
            <div
              className={`mt-2 h-1 overflow-hidden rounded-full ${theme === "dark" ? "bg-gray-800" : "bg-gray-200"}`}
              aria-hidden="true"
            >
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${
                  ratio === 1 ? "bg-emerald-500" : ratio > 0 ? "bg-amber-500" : "bg-red-500"
                }`}
                style={{ width: h.tested > 0 ? `${ratio * 100}%` : "0%" }}
              />
            </div>

            <p className={`mt-2 text-xs ${textMuted}`}>
              {h.error
                ? h.error
                : h.tested === 0
                  ? `${h.total} model${h.total === 1 ? "" : "s"} · run a test to check`
                  : `${h.working} working · ${h.slow} slow · ${h.down} down${
                      h.avgMs ? ` · avg ${formatDuration(h.avgMs)}` : ""
                    }`}
            </p>
            <span className="sr-only">
              {active ? "Clear provider filter" : `Filter to ${providerLabel(h.provider)}`}
            </span>
          </button>
        );
      })}
    </section>
  );
}
