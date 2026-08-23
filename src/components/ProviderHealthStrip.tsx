import type { ModelInfo, Provider, TestResult } from "@/lib/models";
import { accents, styles } from "@/lib/display";
import type { Theme } from "@/lib/display";

const PROVIDERS: Provider[] = ["nvidia", "opencode", "openrouter"];

interface ProviderHealth {
  provider: Provider;
  total: number;
  tested: number;
  working: number;
  slow: number;
  down: number;
  avgMs: number;
}

export function computeProviderHealth(
  models: ModelInfo[],
  results: Map<string, TestResult>
): ProviderHealth[] {
  return PROVIDERS.map((p) => {
    const pr = [...results.values()].filter((r) => r.provider === p);
    const working = pr.filter((r) => r.status === "working").length;
    const slow = pr.filter((r) => r.status === "slow").length;
    const down = pr.filter((r) => r.status === "error" || r.status === "timeout").length;
    const tested = working + slow + down;
    const times = pr.filter((r) => r.status === "working").map((r) => r.responseTimeMs);
    const avgMs = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
    return {
      provider: p,
      total: models.filter((m) => m.provider === p).length,
      tested,
      working,
      slow,
      down,
      avgMs,
    };
  });
}

export default function ProviderHealthStrip({
  health,
  theme,
}: {
  health: ProviderHealth[];
  theme: Theme;
}) {
  const accent = accents(theme);
  const { cardBg, border, textMuted } = styles(theme);

  return (
    <div className="grid sm:grid-cols-3 gap-3 mb-6">
      {health.map((h) => {
        const ok = h.tested > 0 && h.down === 0;
        const partial = h.tested > 0 && h.working + h.slow > 0;
        const dot = h.tested === 0 ? "bg-gray-500" : ok ? "bg-emerald-400" : partial ? "bg-yellow-400" : "bg-red-400";
        const accentColor = h.tested === 0 ? textMuted : ok ? accent.ok : partial ? accent.warn : accent.bad;
        return (
          <div key={h.provider} className={`${cardBg} rounded-lg p-3 border ${border}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
              <span className="font-medium text-sm capitalize">{h.provider}</span>
              <span className={`ml-auto text-xs ${accentColor}`}>
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
  );
}
