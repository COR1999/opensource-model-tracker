import type { ModelInfo, TestResult, UptimeRecord } from "@/lib/models";
import { isT3Available } from "@/lib/models";
import {
  accents,
  styles,
  statusColor,
  statusDot,
  statusLabel,
  providerBadge,
  categoryBadge,
  computeUptimePercent,
  formatContextLength,
  formatDuration,
  type Theme,
} from "@/lib/display";

export default function ComparePanel({
  models,
  results,
  uptime,
  theme,
  onRemove,
}: {
  models: ModelInfo[];
  results: Map<string, TestResult>;
  uptime: Record<string, UptimeRecord[]>;
  theme: Theme;
  onRemove: (id: string) => void;
}) {
  const accent = accents(theme);
  const { cardBg, border, text, textMuted, textSubtle } = styles(theme);

  const rowLabel = `px-3 py-2 text-xs font-medium uppercase tracking-wider ${textMuted}`;
  const cell = `px-3 py-2 text-sm ${text}`;

  return (
    <section
      aria-label="Model comparison"
      className={`mb-6 rounded-xl border p-4 ${cardBg} ${border}`}
    >
      <h2 className={`mb-3 text-sm font-semibold ${text}`}>
        Comparing {models.length} model{models.length === 1 ? "" : "s"}
      </h2>

      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left">
          <thead>
            <tr className={`border-b ${border}`}>
              <th scope="col" className={rowLabel}>
                Metric
              </th>
              {models.map((m) => (
                <th key={m.id} scope="col" className="px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className={`text-sm font-medium ${text}`}>{m.displayName}</span>
                    <button
                      type="button"
                      onClick={() => onRemove(m.id)}
                      aria-label={`Remove ${m.displayName} from comparison`}
                      className={`-mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded text-xs ${textSubtle} hover:text-red-400`}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className={`border-b ${border}`}>
              <th scope="row" className={rowLabel}>
                Provider
              </th>
              {models.map((m) => (
                <td key={m.id} className="px-3 py-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${providerBadge(m.provider, theme)}`}
                  >
                    {m.provider}
                  </span>
                </td>
              ))}
            </tr>

            <tr className={`border-b ${border}`}>
              <th scope="row" className={rowLabel}>
                Category
              </th>
              {models.map((m) => (
                <td key={m.id} className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${categoryBadge(m.category, theme)}`}>
                    {m.category}
                  </span>
                </td>
              ))}
            </tr>

            <tr className={`border-b ${border}`}>
              <th scope="row" className={rowLabel}>
                Context
              </th>
              {models.map((m) => (
                <td key={m.id} className={`${cell} font-mono tabular-nums`}>
                  {formatContextLength(m.contextLength)}
                </td>
              ))}
            </tr>

            <tr className={`border-b ${border}`}>
              <th scope="row" className={rowLabel}>
                In T3 Code
              </th>
              {models.map((m) => (
                <td key={m.id} className="px-3 py-2 text-sm">
                  {isT3Available(m.id) ? (
                    <span className={accent.ok}>Yes</span>
                  ) : (
                    <span className={textSubtle}>No</span>
                  )}
                </td>
              ))}
            </tr>

            <tr className={`border-b ${border}`}>
              <th scope="row" className={rowLabel}>
                Status
              </th>
              {models.map((m) => {
                const r = results.get(m.id);
                return (
                  <td key={m.id} className="px-3 py-2">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${r ? statusDot(r.status) : "bg-gray-600"}`}
                        aria-hidden="true"
                      />
                      <span
                        className={`text-sm font-medium ${r ? statusColor(r.status, theme) : textSubtle}`}
                      >
                        {r ? statusLabel(r.status) : "Not tested"}
                      </span>
                    </span>
                  </td>
                );
              })}
            </tr>

            <tr className={`border-b ${border}`}>
              <th scope="row" className={rowLabel}>
                Response
              </th>
              {models.map((m) => {
                const r = results.get(m.id);
                return (
                  <td key={m.id} className={`${cell} font-mono tabular-nums`}>
                    {r ? formatDuration(r.responseTimeMs) : "—"}
                  </td>
                );
              })}
            </tr>

            <tr className={`border-b ${border}`}>
              <th scope="row" className={rowLabel}>
                Function calling
              </th>
              {models.map((m) => {
                const r = results.get(m.id);
                return (
                  <td key={m.id} className="px-3 py-2 text-sm">
                    {!r ? (
                      <span className={textSubtle}>—</span>
                    ) : r.supportsFunctionCalling ? (
                      <span className={accent.ok}>Yes</span>
                    ) : (
                      <span className={textSubtle}>No</span>
                    )}
                  </td>
                );
              })}
            </tr>

            <tr>
              <th scope="row" className={rowLabel}>
                Uptime (7d)
              </th>
              {models.map((m) => {
                const records = uptime[m.id] || [];
                const pct = computeUptimePercent(records);
                return (
                  <td key={m.id} className={`${cell} tabular-nums`}>
                    {records.length > 0 ? (
                      <span
                        className={pct >= 90 ? accent.ok : pct >= 50 ? accent.warn : accent.bad}
                      >
                        {pct}%
                      </span>
                    ) : (
                      <span className={textSubtle}>—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
