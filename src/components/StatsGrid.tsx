import type { ModelInfo, TestResult } from "@/lib/models";
import { accents, styles } from "@/lib/display";
import type { Theme } from "@/lib/display";

export interface DashboardCounts {
  total: number;
  nvidia: number;
  opencode: number;
  openrouter: number;
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
  return {
    total: models.length,
    nvidia: models.filter((m) => m.provider === "nvidia").length,
    opencode: models.filter((m) => m.provider === "opencode").length,
    openrouter: models.filter((m) => m.provider === "openrouter").length,
    working: [...results.values()].filter((r) => r.status === "working").length,
    slow: [...results.values()].filter((r) => r.status === "slow").length,
    error: [...results.values()].filter((r) => r.status === "error" || r.status === "timeout").length,
    removed: [...results.values()].filter((r) => r.status === "removed").length,
    new: newCount,
  };
}

export default function StatsGrid({
  counts,
  theme,
}: {
  counts: DashboardCounts;
  theme: Theme;
}) {
  const accent = accents(theme);
  const { cardBg, border, textMuted } = styles(theme);

  const stats = [
    { label: "Total", value: counts.total, color: theme === "dark" ? "text-white" : "text-gray-900" },
    { label: "NVIDIA", value: counts.nvidia, color: "text-green-400" },
    { label: "OpenCode", value: counts.opencode, color: "text-purple-400" },
    { label: "OpenRouter", value: counts.openrouter, color: "text-blue-400" },
    { label: "Working", value: counts.working, color: accent.ok },
    { label: "Slow", value: counts.slow, color: accent.warn },
    { label: "Error", value: counts.error, color: accent.bad },
    { label: "Removed", value: counts.removed, color: "text-gray-500" },
    { label: "New", value: counts.new, color: accent.info },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-3 mb-6">
      {stats.map((s) => (
        <div key={s.label} className={`${cardBg} rounded-lg p-3 text-center border ${border}`}>
          <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
          <div className={`text-xs ${textMuted}`}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}
