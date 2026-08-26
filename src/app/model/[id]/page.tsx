"use client";

import { use, useState, useEffect, useMemo } from "react";
import Link from "next/link";
import type { ModelInfo, TestResult, UptimeRecord } from "@/lib/models";
import { modelUrl, isT3Available, isT3Breaking } from "@/lib/models";
import {
  styles,
  accents,
  statusColor,
  statusDot,
  statusLabel,
  providerBadge,
  categoryBadge,
  computeUptimePercent,
  dailyBuckets,
  formatContextLength,
  formatDuration,
  type Theme,
} from "@/lib/display";
import { loadLastResults, loadUptime, loadTheme } from "@/lib/storage";

const DAY_LABELS = ["6d ago", "5d ago", "4d ago", "3d ago", "2d ago", "Yesterday", "Today"];

export default function ModelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = use(params);
  const modelId = decodeURIComponent(rawId);

  const [theme, setTheme] = useState<Theme>("dark");
  const [catalogModels, setCatalogModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [uptimeRecords, setUptimeRecords] = useState<UptimeRecord[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is browser-only; loading in an effect keeps SSR output stable
    setTheme(loadTheme());
  }, []);

  // Load test results and uptime from localStorage
  useEffect(() => {
    const results = loadLastResults();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is browser-only
    setTestResult(results.get(modelId) ?? null);
    const uptime = loadUptime();
    setUptimeRecords(uptime[modelId] ?? []);
  }, [modelId]);

  // Fetch catalog to find model info
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/models");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.models)) {
          setCatalogModels(data.models);
        }
      } catch {
        // Catalog unavailable — show what we have from localStorage
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const model = useMemo(
    () => catalogModels.find((m) => m.id === modelId) ?? null,
    [catalogModels, modelId],
  );

  const uptimePercent = useMemo(
    () => computeUptimePercent(uptimeRecords),
    [uptimeRecords],
  );

  const buckets = useMemo(() => dailyBuckets(uptimeRecords), [uptimeRecords]);

  const { bg, text, cardBg, border, textMuted, textSubtle } = styles(theme);
  const accent = accents(theme);

  if (loading) {
    return (
      <div className={`min-h-screen ${bg} ${text}`}>
        <div className="max-w-4xl mx-auto px-4 py-8 text-center">
          <p className={`text-sm ${textMuted}`}>Loading model details…</p>
        </div>
      </div>
    );
  }

  if (!model && !testResult) {
    return (
      <div className={`min-h-screen ${bg} ${text}`}>
        <div className="max-w-4xl mx-auto px-4 py-8 text-center">
          <h1 className="text-xl font-bold mb-2">Model Not Found</h1>
          <p className={`text-sm ${textMuted} mb-4`}>
            No data found for <code className={`font-mono ${textSubtle}`}>{modelId}</code>.
          </p>
          <Link href="/" className="text-blue-400 hover:underline text-sm">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const displayName = model?.displayName ?? modelId.split("/").pop() ?? modelId;
  const provider = model?.provider ?? "nvidia";
  const category = model?.category ?? "other";
  const contextLength = model?.contextLength;

  const rowLabel = `px-4 py-2.5 text-xs font-medium uppercase tracking-wider ${textMuted}`;
  const cell = `px-4 py-2.5 text-sm ${text}`;

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors`}>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <header className="mb-8">
          <Link
            href="/"
            className={`inline-flex items-center gap-1.5 text-sm ${textMuted} hover:text-blue-400 transition-colors mb-4`}
          >
            <span aria-hidden="true">←</span>
            Back to Dashboard
          </Link>

          <div className="flex flex-wrap items-start gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{displayName}</h1>
            <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs ${providerBadge(provider, theme)}`}>
              {provider}
            </span>
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs ${categoryBadge(category, theme)}`}>
              {category}
            </span>
            {model && isT3Available(model.id) && (
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs ${accent.ok}`}>in T3</span>
            )}
            {model && isT3Breaking(model.id) && (
              <span className="inline-block rounded-full border border-amber-700/50 bg-amber-900/60 px-2.5 py-0.5 text-xs font-medium text-amber-300">
                T3 ⚠
              </span>
            )}
          </div>

          <p className={`mt-2 font-mono text-xs ${textSubtle}`}>{modelId}</p>

          <div className="mt-3 flex flex-wrap gap-3">
            <a
              href={model ? modelUrl(model) : "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-400 hover:underline"
            >
              View on {provider === "nvidia" ? "build.nvidia.com" : provider === "openrouter" ? "openrouter.ai" : "opencode.ai"}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        </header>

        <section className={`mb-6 rounded-xl border p-4 ${cardBg} ${border}`}>
          <h2 className={`text-sm font-semibold ${text} mb-3`}>Current Status</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className={`text-xs ${textMuted}`}>Status</p>
              {testResult ? (
                <p className="flex items-center gap-1.5 mt-1">
                  <span className={`h-2 w-2 rounded-full ${statusDot(testResult.status)}`} aria-hidden="true" />
                  <span className={`font-medium ${statusColor(testResult.status, theme)}`}>
                    {statusLabel(testResult.status)}
                  </span>
                </p>
              ) : (
                <p className={`text-sm ${textSubtle} mt-1`}>Not tested</p>
              )}
            </div>
            <div>
              <p className={`text-xs ${textMuted}`}>Response Time</p>
              <p className={`font-mono text-sm mt-1 ${text}`}>
                {testResult ? formatDuration(testResult.responseTimeMs) : "—"}
              </p>
            </div>
            <div>
              <p className={`text-xs ${textMuted}`}>Function Calling</p>
              <p className={`text-sm mt-1 ${text}`}>
                {testResult ? (testResult.supportsFunctionCalling ? "Yes" : "No") : "—"}
              </p>
            </div>
          </div>
          {testResult?.error && (
            <p className={`mt-3 text-xs ${textSubtle} break-all`}>
              Error: {testResult.error}
            </p>
          )}
        </section>

        <section className={`mb-6 rounded-xl border ${cardBg} ${border}`}>
          <h2 className={`px-4 pt-4 text-sm font-semibold ${text}`}>Model Information</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <tbody>
                <tr className={`border-b ${border}`}>
                  <th scope="row" className={rowLabel}>Provider</th>
                  <td className={cell}>
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${providerBadge(provider, theme)}`}>
                      {provider}
                    </span>
                  </td>
                </tr>
                <tr className={`border-b ${border}`}>
                  <th scope="row" className={rowLabel}>Category</th>
                  <td className={cell}>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${categoryBadge(category, theme)}`}>
                      {category}
                    </span>
                  </td>
                </tr>
                {contextLength && (
                  <tr className={`border-b ${border}`}>
                    <th scope="row" className={rowLabel}>Context Length</th>
                    <td className={`${cell} font-mono`}>{formatContextLength(contextLength)}</td>
                  </tr>
                )}
                <tr className={`border-b ${border}`}>
                  <th scope="row" className={rowLabel}>Model ID</th>
                  <td className={`${cell} font-mono text-xs break-all`}>{modelId}</td>
                </tr>
                {model && (
                  <tr>
                    <th scope="row" className={rowLabel}>Owner</th>
                    <td className={cell}>{model.ownedBy}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={`mb-6 rounded-xl border p-4 ${cardBg} ${border}`}>
          <h2 className={`text-sm font-semibold ${text} mb-3`}>7-Day Uptime</h2>
          {uptimeRecords.length > 0 ? (
            <>
              <div className="flex items-end gap-2 mb-3">
                {buckets.map((b, i) => {
                  const cls =
                    b.count === 0
                      ? theme === "dark" ? "bg-gray-700" : "bg-gray-200"
                      : b.ratio >= 0.9
                        ? "bg-emerald-500"
                        : b.ratio >= 0.5
                          ? "bg-amber-500"
                          : "bg-red-500";
                  const height = b.count === 0 ? "h-3" : b.ratio >= 0.9 ? "h-10" : b.ratio >= 0.5 ? "h-8" : "h-6";
                  return (
                    <div key={i} className="flex flex-col items-center gap-1 flex-1">
                      <span
                        className={`w-full rounded-sm ${height} ${cls}`}
                        title={
                          b.count === 0
                            ? `${DAY_LABELS[i]}: no checks`
                            : `${DAY_LABELS[i]}: ${Math.round(b.ratio * 100)}% up (${b.count} check${b.count === 1 ? "" : "s"})`
                        }
                      />
                      <span className={`text-[10px] ${textSubtle}`}>{DAY_LABELS[i]}</span>
                    </div>
                  );
                })}
              </div>
              <p className={`text-sm ${textMuted}`}>
                <span className={`font-semibold ${accent.ok}`}>{uptimePercent}%</span> uptime over the last 7 days
                <span className={`${textSubtle}`}> ({uptimeRecords.length} total checks)</span>
              </p>
            </>
          ) : (
            <p className={`text-sm ${textMuted}`}>No uptime data yet. Run a test to start tracking.</p>
          )}
        </section>

        <section className={`mb-6 rounded-xl border ${cardBg} ${border}`}>
          <h2 className={`px-4 pt-4 text-sm font-semibold ${text}`}>Recent Test History</h2>
          {uptimeRecords.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className={`border-b ${border}`}>
                    <th scope="col" className={`px-4 py-2 text-xs font-medium uppercase tracking-wider ${textMuted}`}>Time</th>
                    <th scope="col" className={`px-4 py-2 text-xs font-medium uppercase tracking-wider ${textMuted}`}>Status</th>
                    <th scope="col" className={`px-4 py-2 text-xs font-medium uppercase tracking-wider ${textMuted} text-right`}>Response</th>
                  </tr>
                </thead>
                <tbody>
                  {[...uptimeRecords].reverse().slice(0, 20).map((r, i) => (
                    <tr key={i} className={`border-b ${border} last:border-0`}>
                      <td className={`${cell} text-xs`}>
                        {new Date(r.timestamp).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${statusDot(r.status)}`} aria-hidden="true" />
                          <span className={`text-sm font-medium ${statusColor(r.status, theme)}`}>
                            {statusLabel(r.status)}
                          </span>
                        </span>
                      </td>
                      <td className={`${cell} font-mono text-xs text-right`}>
                        {formatDuration(r.responseTimeMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={`px-4 pb-4 text-sm ${textMuted}`}>No test history yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
