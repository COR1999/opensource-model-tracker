import type { ModelInfo, TestResult, UptimeRecord } from "@/lib/models";
import {
  accents,
  styles,
  statusColor,
  providerBadge,
  categoryBadge,
  computeUptimePercent,
} from "@/lib/display";
import { isT3Available } from "@/lib/models";
import type { Theme } from "@/lib/display";

export default function ComparePanel({
  models,
  results,
  uptime,
  theme,
}: {
  models: ModelInfo[];
  results: Map<string, TestResult>;
  uptime: Record<string, UptimeRecord[]>;
  theme: Theme;
}) {
  const accent = accents(theme);
  const { cardBg, border, textMuted } = styles(theme);

  return (
    <div className={`mb-6 p-4 rounded-lg border ${cardBg} ${border}`}>
      <h2 className="font-bold mb-3">Model Comparison</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={`border-b ${border}`}>
              <th className="text-left px-3 py-2">Metric</th>
              {models.map((m) => (
                <th key={m.id} className="text-left px-3 py-2">{m.displayName}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className={`border-b ${border}`}>
              <td className={`px-3 py-2 ${textMuted}`}>Provider</td>
              {models.map((m) => (
                <td key={m.id} className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${providerBadge(m.provider, theme)}`}>{m.provider}</span>
                </td>
              ))}
            </tr>
            <tr className={`border-b ${border}`}>
              <td className={`px-3 py-2 ${textMuted}`}>Category</td>
              {models.map((m) => (
                <td key={m.id} className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${categoryBadge(m.category, theme)}`}>{m.category}</span>
                </td>
              ))}
            </tr>
            <tr className={`border-b ${border}`}>
              <td className={`px-3 py-2 ${textMuted}`}>In T3 Code</td>
              {models.map((m) => (
                <td key={m.id} className="px-3 py-2 text-xs">
                  {isT3Available(m.id) ? <span className={accent.ok}>Yes</span> : <span className={textMuted}>No</span>}
                </td>
              ))}
            </tr>
            <tr className={`border-b ${border}`}>
              <td className={`px-3 py-2 ${textMuted}`}>Status</td>
              {models.map((m) => {
                const r = results.get(m.id);
                return (
                  <td key={m.id} className={`px-3 py-2 font-medium ${statusColor(r?.status || "error", theme)}`}>
                    {r?.status || "not tested"}
                  </td>
                );
              })}
            </tr>
            <tr className={`border-b ${border}`}>
              <td className={`px-3 py-2 ${textMuted}`}>Response</td>
              {models.map((m) => {
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
              {models.map((m) => {
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
              {models.map((m) => {
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
  );
}
