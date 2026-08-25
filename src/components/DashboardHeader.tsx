"use client";

import { styles, formatRelativeTime, type Theme } from "@/lib/display";
import type { TestProgress } from "@/hooks/useModelTesting";
import Spinner from "./Spinner";

export default function DashboardHeader({
  theme,
  onToggleTheme,
  lastRefresh,
  now,
  refreshing,
  onRefresh,
  progress,
  onCancel,
  actions,
}: {
  theme: Theme;
  onToggleTheme: () => void;
  lastRefresh: Date | null;
  now: Date;
  refreshing: boolean;
  onRefresh: () => void;
  progress: TestProgress | null;
  onCancel: () => void;
  actions: React.ReactNode;
}) {
  const { cardBg, border, text, textMuted, textSubtle } = styles(theme);
  const ghost = `inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${cardBg} ${border} ${textMuted} hover:border-blue-500/60`;

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className={`text-xl font-semibold tracking-tight sm:text-2xl ${text}`}>
            Open Source Model Tracker
          </h1>
          <p className={`mt-1 text-sm ${textMuted}`}>
            Which free AI models are live right now across NVIDIA NIM, OpenCode Zen and OpenRouter.
          </p>
          <p className={`mt-1 flex items-center gap-1.5 text-xs ${textSubtle}`}>
            {refreshing ? (
              <>
                <Spinner className="h-3 w-3" />
                Refreshing catalog…
              </>
            ) : lastRefresh ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                <span>
                  Catalog updated{" "}
                  <time dateTime={lastRefresh.toISOString()}>
                    {formatRelativeTime(lastRefresh, now)}
                  </time>
                </span>
              </>
            ) : (
              "Loading catalog…"
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <button type="button" onClick={onRefresh} disabled={refreshing} className={ghost}>
            <span aria-hidden="true" className={refreshing ? "animate-spin" : ""}>
              ↻
            </span>
            <span className="hidden sm:inline">Refresh</span>
            <span className="sr-only">Refresh model catalog</span>
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            className={ghost}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
          </button>
        </div>
      </div>

      {/* Determinate progress for long runs, with a way out. A batch test used
          to be uninterruptible once started. */}
      {progress && (
        <div
          className={`mt-4 rounded-xl border p-3 ${cardBg} ${border}`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-3">
            <p className={`text-sm ${text}`}>
              {progress.label}…{" "}
              <span className={`tabular-nums ${textMuted}`}>
                {progress.done} of {progress.total}
              </span>
            </p>
            <button
              type="button"
              onClick={onCancel}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${border} ${textMuted} hover:border-red-500/60`}
            >
              Cancel
            </button>
          </div>
          <div
            className={`mt-2 h-1.5 overflow-hidden rounded-full ${theme === "dark" ? "bg-gray-800" : "bg-gray-200"}`}
            role="progressbar"
            aria-valuenow={progress.done}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-label={progress.label}
          >
            <div
              className="h-full rounded-full bg-blue-500 transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </header>
  );
}
