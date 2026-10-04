"use client";

import { memo } from "react";
import Link from "next/link";
import type { ModelInfo, TestResult, UptimeRecord } from "@/lib/models";
import { isKnownSlow, isOpencodeAppOnlyModel, isT3Available, isT3Breaking, modelUrl, bestForChips } from "@/lib/models";
import {
  categoryBadge,
  computeUptimePercent,
  densityTokens,
  formatContextLength,
  formatDuration,
  providerBadge,
  statusBg,
  statusColor,
  statusDot,
  statusLabel,
  styles,
  accents,
  type Density,
  type Theme,
} from "@/lib/display";
import Spinner from "./Spinner";
import UptimeSparkline from "./UptimeSparkline";

export type SortKey =
  | "displayName"
  | "provider"
  | "status"
  | "responseTimeMs"
  | "category"
  | "contextLength"
  | "benchmarkScore";

export interface TableColumn {
  key: SortKey | null;
  label: string;
  /** Tailwind responsive visibility, so narrow viewports drop detail first. */
  hide?: string;
  align?: "right";
}

const COLUMNS: TableColumn[] = [
  { key: "benchmarkScore", label: "Score", align: "right" },
  { key: "provider", label: "Provider" },
  { key: "displayName", label: "Model" },
  { key: "category", label: "Category", hide: "hidden xl:table-cell" },
  { key: "contextLength", label: "Context", hide: "hidden lg:table-cell", align: "right" },
  { key: null, label: "T3", hide: "hidden xl:table-cell" },
  { key: "status", label: "Status" },
  { key: "responseTimeMs", label: "Response", align: "right" },
  { key: null, label: "Uptime", hide: "hidden lg:table-cell" },
  { key: null, label: "Tools", hide: "hidden xl:table-cell" },
  { key: null, label: "" },
];

interface ModelRowProps {
  model: ModelInfo;
  result: TestResult | undefined;
  records: UptimeRecord[];
  theme: Theme;
  density: Density;
  selected: boolean;
  isTesting: boolean;
  isNew: boolean;
  isCopied: boolean;
  starred: boolean;
  freeGone: boolean;
  onToggleCompare: (id: string) => void;
  onTest: (model: ModelInfo) => void;
  onCopyId: (id: string) => void;
  onToggleShortlist?: (id: string) => void;
}

// Memoized and fed only primitives/stable callbacks per row (never the raw
// Sets/maps the page tracks) so that e.g. starting a test on one model, or
// copying another model's id, doesn't force every other row in a catalog of
// several hundred models to recompute its badges and uptime sparkline too.
const ModelRow = memo(function ModelRow({
  model: m,
  result: r,
  records,
  theme,
  density,
  selected,
  isTesting,
  isNew,
  isCopied,
  starred,
  freeGone,
  onToggleCompare,
  onTest,
  onCopyId,
  onToggleShortlist,
}: ModelRowProps) {
  const { cardBg, border, text, textMuted, textSubtle, hoverBg } = styles(theme);
  const accent = accents(theme);
  const d = densityTokens(density);
  const uptimePercent = computeUptimePercent(records);
  const skipped = isKnownSlow(m.id);
  const zenOnly = isOpencodeAppOnlyModel(m);

  return (
    <tr
      className={`border-b ${border} last:border-0 ${hoverBg} transition-colors ${
        r ? statusBg(r.status, theme) : ""
      } ${selected ? "ring-1 ring-inset ring-blue-500/40" : ""}`}
    >
      <td className={`px-3 ${d.cellY}`}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleCompare(m.id)}
          // Checkboxes had no accessible name at all.
          aria-label={`Compare ${m.displayName}`}
          className="h-4 w-4 rounded accent-blue-600"
        />
      </td>

      <td className={`px-4 ${d.cellY} text-right font-mono text-xs tabular-nums`} title={m.benchmarkRank ? `BenchLM rank #${m.benchmarkRank}` : undefined}>
        {typeof m.benchmarkScore === "number" ? (
          <span className={text}>
            {m.benchmarkScore.toFixed(1)}
            {typeof m.codingScore === "number" && (
              <span className={`ml-1 ${textSubtle}`} title={`Coding ${m.codingScore.toFixed(1)}`}>
                c{m.codingScore.toFixed(0)}
              </span>
            )}
          </span>
        ) : (
          <span className={textSubtle}>—</span>
        )}
      </td>

      <td className={`px-4 ${d.cellY}`}>
        <span
          className={`inline-block rounded-full border px-2 py-0.5 text-xs whitespace-nowrap ${providerBadge(m.provider, theme)}`}
        >
          {m.provider}
        </span>
      </td>

      <td className={`px-4 ${d.cellY}`}>
        <div className="flex items-center gap-2">
          <Link
            href={`/model/${encodeURIComponent(m.id)}`}
            className={`font-medium ${d.rowText} rounded text-blue-400 underline-offset-2 hover:underline`}
          >
            {m.displayName}
          </Link>
          <a
            href={modelUrl(m)}
            target="_blank"
            rel="noopener noreferrer"
            className={`${textSubtle} hover:text-blue-400 transition-colors`}
            title={`View on ${m.provider === "nvidia" ? "build.nvidia.com" : m.provider === "openrouter" ? "openrouter.ai" : "opencode.ai"}`}
          >
            <span className="text-[10px]" aria-hidden="true">↗</span>
            <span className="sr-only">View on provider site (opens in a new tab)</span>
          </a>
          {isNew && (
            <span className="rounded-full border border-cyan-700/50 bg-cyan-900/60 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300">
              NEW
            </span>
          )}
          {isT3Breaking(m.id) && (
            <span
              title="Known to break with T3 Code (Chat Completions)"
              className="rounded-full border border-amber-700/50 bg-amber-900/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-300"
            >
              T3 ⚠
            </span>
          )}
          {freeGone && (
            <span
              title="Free tier appears revoked — model no longer resolves on its free endpoint"
              className="rounded-full border border-orange-700/50 bg-orange-900/60 px-1.5 py-0.5 text-[10px] font-medium text-orange-300"
            >
              free gone
            </span>
          )}
          {zenOnly && (
            <span
              title="OpenCode Zen free tier only works inside the OpenCode app — not via API"
              className="rounded-full border border-cyan-700/50 bg-cyan-900/60 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300"
            >
              OpenCode only
            </span>
          )}
          {skipped && (
            <span
              title="Skipped by Test All — consistently slower than the request budget"
              className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${border} ${textSubtle}`}
            >
              slow
            </span>
          )}
          {bestForChips(m, r)
            .filter((c) => c.kind !== "unranked")
            .map((c) => (
              <span
                key={c.kind}
                className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${border} ${textMuted}`}
              >
                {c.label}
              </span>
            ))}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onToggleShortlist?.(m.id)}
            aria-label={`${starred ? "Remove" : "Add"} ${m.displayName} ${starred ? "from" : "to"} shortlist`}
            aria-pressed={starred}
            className={`rounded px-1 text-sm transition-colors ${
              starred ? "text-amber-400" : `${textSubtle} hover:text-amber-400`
            }`}
          >
            {starred ? "★" : "☆"}
          </button>
          <span className={`font-mono text-xs ${textSubtle}`}>{m.id}</span>
          <button
            type="button"
            onClick={() => onCopyId(m.id)}
            aria-label={`Copy model ID ${m.id}`}
            className={`rounded px-1 text-[10px] transition-colors ${
              isCopied ? accent.ok : `${textSubtle} hover:underline`
            }`}
          >
            {isCopied ? "copied" : "copy"}
          </button>
        </div>
      </td>

      <td className={`px-4 ${d.cellY} hidden xl:table-cell`}>
        <span
          className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${categoryBadge(m.category, theme)}`}
        >
          {m.category}
        </span>
      </td>

      <td
        className={`px-4 ${d.cellY} hidden text-right font-mono text-xs tabular-nums lg:table-cell ${textMuted}`}
        title={m.contextLength ? `${m.contextLength.toLocaleString()} tokens` : undefined}
      >
        {formatContextLength(m.contextLength)}
      </td>

      <td className={`px-4 ${d.cellY} hidden text-xs xl:table-cell`}>
        {isT3Available(m.id) ? (
          <span className={accent.ok}>Yes</span>
        ) : (
          <span className={textSubtle}>No</span>
        )}
      </td>

      <td className={`px-4 ${d.cellY}`}>
        {r ? (
          <>
            <span className="flex items-center gap-1.5">
              {/* Shape + text, not colour alone. */}
              <span
                className={`h-1.5 w-1.5 flex-none rounded-full ${statusDot(r.status)}`}
                aria-hidden="true"
              />
              <span className={`text-sm font-medium ${statusColor(r.status, theme)}`}>
                {statusLabel(r.status)}
              </span>
            </span>
            {r.error && (
              <span
                className={`mt-0.5 block max-w-[16rem] truncate text-xs ${textSubtle}`}
                title={r.error}
              >
                {r.error}
              </span>
            )}
          </>
        ) : (
          <span className={`text-sm ${textSubtle}`}>—</span>
        )}
      </td>

      <td className={`px-4 ${d.cellY} text-right font-mono text-xs tabular-nums`}>
        {r ? (
          <span className={r.responseTimeMs > 5000 ? accent.warn : textMuted}>
            {formatDuration(r.responseTimeMs)}
          </span>
        ) : (
          <span className={textSubtle}>—</span>
        )}
      </td>

      <td className={`px-4 ${d.cellY} hidden text-xs lg:table-cell`}>
        {records.length > 0 ? (
          <span className="flex items-center gap-2">
            <UptimeSparkline records={records} theme={theme} percent={uptimePercent} />
            <span
              className={`tabular-nums ${
                uptimePercent >= 90
                  ? accent.ok
                  : uptimePercent >= 50
                    ? accent.warn
                    : accent.bad
              }`}
            >
              {uptimePercent}%
            </span>
          </span>
        ) : (
          <span className={textSubtle}>—</span>
        )}
      </td>

      <td className={`px-4 ${d.cellY} hidden text-xs xl:table-cell`}>
        {r?.supportsFunctionCalling ? (
          <span className={accent.ok}>Yes</span>
        ) : r ? (
          <span className={textSubtle}>No</span>
        ) : (
          <span className={textSubtle}>—</span>
        )}
      </td>

      <td className={`px-4 ${d.cellY} text-right`}>
        <button
          type="button"
          onClick={() => onTest(m)}
          disabled={isTesting}
          aria-label={`Test ${m.displayName}`}
          className={`inline-flex min-w-[3.75rem] items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${cardBg} ${border} ${textMuted} hover:border-blue-500/60 disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {isTesting ? (
            <>
              <Spinner className="h-3 w-3" />
              <span className="sr-only">Testing…</span>
            </>
          ) : (
            "Test"
          )}
        </button>
      </td>
    </tr>
  );
});

export default function ModelTable({
  models,
  results,
  uptime,
  theme,
  density,
  sortKey,
  sortAsc,
  onSort,
  compareIds,
  onToggleCompare,
  onTest,
  onCopyId,
  copiedId,
  testingIds,
  newModels,
  freeTierGone,
  shortlist,
  onToggleShortlist,
  busy,
}: {
  models: ModelInfo[];
  results: Map<string, TestResult>;
  uptime: Record<string, UptimeRecord[]>;
  theme: Theme;
  density: Density;
  sortKey: SortKey;
  sortAsc: boolean;
  onSort: (key: SortKey) => void;
  compareIds: Set<string>;
  onToggleCompare: (id: string) => void;
  onTest: (model: ModelInfo) => void;
  onCopyId: (id: string) => void;
  copiedId: string | null;
  testingIds: Set<string>;
  newModels: Set<string>;
  freeTierGone?: Set<string>;
  shortlist?: Set<string>;
  onToggleShortlist?: (id: string) => void;
  busy: boolean;
}) {
  const { border, text, textMuted, raisedBg } = styles(theme);

  return (
    <div className={`scroll-thin overflow-x-auto rounded-xl border ${border}`}>
      <table className="w-full min-w-[52rem] border-collapse text-left">
        <caption className="sr-only">
          Tracked models with provider, category, benchmark score, status and response time.
          Column headers sort the table. Benchmark scores from BenchLM.ai and OpenRouter
          (live, may lag provider catalog changes).
        </caption>
        <thead className={`sticky top-0 z-10 ${raisedBg} backdrop-blur`}>
          <tr className={`border-b ${border}`}>
            <th scope="col" className="w-10 px-3 py-2.5">
              <span className="sr-only">Select for comparison</span>
            </th>
            {COLUMNS.map((col) => {
              const isSorted = col.key !== null && col.key === sortKey;
              return (
                <th
                  key={col.label || "actions"}
                  scope="col"
                  // aria-sort belongs on the header cell, not the button, and
                  // was absent entirely before.
                  aria-sort={
                    isSorted ? (sortAsc ? "ascending" : "descending") : col.key ? "none" : undefined
                  }
                  className={`px-4 py-2.5 text-xs font-medium uppercase tracking-wider ${textMuted} ${
                    col.hide ?? ""
                  } ${col.align === "right" ? "text-right" : ""}`}
                >
                  {col.key ? (
                    // Was a click handler on a bare <th>: unreachable by
                    // keyboard and invisible to assistive tech.
                    <button
                      type="button"
                      onClick={() => onSort(col.key as SortKey)}
                      className={`inline-flex items-center gap-1 rounded transition-colors ${
                        isSorted ? text : textMuted
                      } ${theme === "dark" ? "hover:text-white" : "hover:text-gray-900"}`}
                    >
                      {col.label}
                      <span aria-hidden="true" className={isSorted ? "" : "opacity-0"}>
                        {sortAsc ? "▲" : "▼"}
                      </span>
                    </button>
                  ) : (
                    col.label || <span className="sr-only">Actions</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody aria-busy={busy}>
          {models.map((m) => (
            <ModelRow
              key={m.id}
              model={m}
              result={results.get(m.id)}
              records={uptime[m.id] || []}
              theme={theme}
              density={density}
              selected={compareIds.has(m.id)}
              isTesting={testingIds.has(m.id)}
              isNew={newModels.has(m.id)}
              isCopied={copiedId === m.id}
              starred={shortlist?.has(m.id) ?? false}
              freeGone={freeTierGone?.has(m.id) ?? false}
              onToggleCompare={onToggleCompare}
              onTest={onTest}
              onCopyId={onCopyId}
              onToggleShortlist={onToggleShortlist}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
