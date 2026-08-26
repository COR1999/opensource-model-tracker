"use client";

import Link from "next/link";
import type { ModelInfo, TestResult, UptimeRecord } from "@/lib/models";
import { isKnownSlow, isT3Available, isT3Breaking, modelUrl } from "@/lib/models";
import {
  categoryBadge,
  computeUptimePercent,
  formatContextLength,
  formatDuration,
  providerBadge,
  statusBg,
  statusColor,
  statusDot,
  statusLabel,
  styles,
  accents,
  type Theme,
} from "@/lib/display";
import Spinner from "./Spinner";
import UptimeSparkline from "./UptimeSparkline";

/** Narrow-viewport presentation of the same rows the table shows. */
export default function ModelCardList({
  models,
  results,
  uptime,
  theme,
  compareIds,
  onToggleCompare,
  onTest,
  onCopyId,
  copiedId,
  testingSingle,
  newModels,
}: {
  models: ModelInfo[];
  results: Map<string, TestResult>;
  uptime: Record<string, UptimeRecord[]>;
  theme: Theme;
  compareIds: Set<string>;
  onToggleCompare: (id: string) => void;
  onTest: (model: ModelInfo) => void;
  onCopyId: (id: string) => void;
  copiedId: string | null;
  testingSingle: string | null;
  newModels: Set<string>;
}) {
  const { cardBg, border, text, textMuted, textSubtle } = styles(theme);
  const accent = accents(theme);

  return (
    <ul className="space-y-3">
      {models.map((m) => {
        const r = results.get(m.id);
        const records = uptime[m.id] || [];
        const uptimePercent = computeUptimePercent(records);
        const isTesting = testingSingle === m.id;
        const selected = compareIds.has(m.id);

        return (
          <li
            key={m.id}
            className={`rounded-xl border p-4 transition-colors ${cardBg} ${border} ${
              r ? statusBg(r.status, theme) : ""
            } ${selected ? "ring-1 ring-blue-500/40" : ""}`}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleCompare(m.id)}
                aria-label={`Compare ${m.displayName}`}
                className="mt-1 h-4 w-4 flex-none rounded accent-blue-600"
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link
                    href={`/model/${encodeURIComponent(m.id)}`}
                    className={`rounded text-sm font-medium text-blue-400 underline-offset-2 hover:underline`}
                  >
                    {m.displayName}
                  </Link>
                  <a
                    href={modelUrl(m)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${textSubtle} hover:text-blue-400 transition-colors text-[10px]`}
                    title={`View on ${m.provider === "nvidia" ? "build.nvidia.com" : m.provider === "openrouter" ? "openrouter.ai" : "opencode.ai"}`}
                  >
                    ↗<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  {newModels.has(m.id) && (
                    <span className="rounded-full border border-cyan-700/50 bg-cyan-900/60 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300">
                      NEW
                    </span>
                  )}
                  {isT3Breaking(m.id) && (
                    <span className="rounded-full border border-amber-700/50 bg-amber-900/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                      T3 ⚠
                    </span>
                  )}
                  {isKnownSlow(m.id) && (
                    <span
                      className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${border} ${textSubtle}`}
                    >
                      slow
                    </span>
                  )}
                </div>

                <div className="mt-1 flex items-start gap-1.5">
                  <span className={`font-mono text-xs break-all ${textSubtle}`}>{m.id}</span>
                  <button
                    type="button"
                    onClick={() => onCopyId(m.id)}
                    aria-label={`Copy model ID ${m.id}`}
                    className={`flex-none rounded px-1 text-[10px] ${
                      copiedId === m.id ? accent.ok : textSubtle
                    }`}
                  >
                    {copiedId === m.id ? "copied" : "copy"}
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onTest(m)}
                disabled={isTesting}
                aria-label={`Test ${m.displayName}`}
                className={`inline-flex min-w-[3.75rem] flex-none items-center justify-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${border} ${textMuted} disabled:opacity-60`}
              >
                {isTesting ? <Spinner className="h-3 w-3" label="Testing" /> : "Test"}
              </button>
            </div>

            {/* Status line reads first on mobile, where it matters most */}
            <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">Status</dt>
                <dd className="flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${r ? statusDot(r.status) : "bg-gray-600"}`}
                    aria-hidden="true"
                  />
                  <span className={`font-medium ${r ? statusColor(r.status, theme) : textSubtle}`}>
                    {r ? statusLabel(r.status) : "Not tested"}
                  </span>
                </dd>
              </div>

              {r && (
                <div className="flex items-center gap-1.5">
                  <dt className={textSubtle}>Response</dt>
                  <dd className={`font-mono tabular-nums ${text}`}>
                    {formatDuration(r.responseTimeMs)}
                  </dd>
                </div>
              )}

              {m.contextLength ? (
                <div className="flex items-center gap-1.5">
                  <dt className={textSubtle}>Context</dt>
                  <dd className={`font-mono tabular-nums ${text}`}>
                    {formatContextLength(m.contextLength)}
                  </dd>
                </div>
              ) : null}

              {records.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <dt className={textSubtle}>Uptime</dt>
                  <dd className="flex items-center gap-1.5">
                    <UptimeSparkline records={records} theme={theme} percent={uptimePercent} />
                    <span
                      className={`tabular-nums ${
                        uptimePercent >= 90 ? accent.ok : uptimePercent >= 50 ? accent.warn : accent.bad
                      }`}
                    >
                      {uptimePercent}%
                    </span>
                  </dd>
                </div>
              )}
            </dl>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`rounded-full border px-2 py-0.5 ${providerBadge(m.provider, theme)}`}
              >
                {m.provider}
              </span>
              <span className={`rounded-full px-2 py-0.5 ${categoryBadge(m.category, theme)}`}>
                {m.category}
              </span>
              {isT3Available(m.id) && <span className={accent.ok}>in T3</span>}
              {r?.supportsFunctionCalling && <span className={accent.ok}>tools</span>}
            </div>

            {r?.error && (
              <p className={`mt-2 line-clamp-2 text-xs ${textSubtle}`} title={r.error}>
                {r.error}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
