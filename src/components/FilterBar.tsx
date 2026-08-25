"use client";

import { forwardRef } from "react";
import type { ModelCategory } from "@/lib/models";
import { styles, providerLabel, type Theme, type Density } from "@/lib/display";

export type StatusFilter = "all" | "working" | "slow" | "error" | "untested";

export interface Filters {
  search: string;
  provider: string;
  category: ModelCategory | "all";
  status: StatusFilter;
  hideEndpoints: boolean;
}

const CATEGORIES: { value: ModelCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "chat", label: "Chat" },
  { value: "code", label: "Code" },
  { value: "vision", label: "Vision" },
  { value: "embedding", label: "Embed" },
  { value: "audio", label: "Audio" },
  { value: "other", label: "Other" },
];

const PROVIDERS = ["all", "nvidia", "opencode", "openrouter"];

const STATUSES: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Any status" },
  { value: "working", label: "Working" },
  { value: "slow", label: "Slow" },
  { value: "error", label: "Down" },
  { value: "untested", label: "Not tested" },
];

const FilterBar = forwardRef<
  HTMLInputElement,
  {
    filters: Filters;
    theme: Theme;
    density: Density;
    resultCount: number;
    totalCount: number;
    onChange: (patch: Partial<Filters>) => void;
    onReset: () => void;
    onDensityChange: (density: Density) => void;
  }
>(function FilterBar(
  { filters, theme, density, resultCount, totalCount, onChange, onReset, onDensityChange },
  searchRef
) {
  const { cardBg, border, text, textMuted, inputBg } = styles(theme);
  const hasActiveFilters =
    filters.search !== "" ||
    filters.provider !== "all" ||
    filters.category !== "all" ||
    filters.status !== "all" ||
    !filters.hideEndpoints;

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
      active
        ? "border-blue-500 bg-blue-600 text-white"
        : `${inputBg} ${border} ${textMuted} hover:border-blue-500/60`
    }`;

  return (
    <section aria-label="Filters" className="mb-5 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <span
            className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm ${textMuted}`}
            aria-hidden="true"
          >
            ⌕
          </span>
          <input
            ref={searchRef}
            id="model-search"
            type="search"
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder="Search by name, id, or owner…"
            aria-label="Search models"
            aria-describedby="search-hint"
            className={`w-full rounded-lg border py-2 pl-9 pr-3 text-sm ${inputBg} ${border} ${text} ${
              // Whole class string: Tailwind cannot generate an interpolated variant.
              theme === "dark" ? "placeholder:text-gray-500" : "placeholder:text-gray-400"
            } focus:border-blue-500`}
          />
          <kbd
            id="search-hint"
            className={`pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border px-1.5 py-0.5 font-sans text-[10px] sm:block ${border} ${textMuted}`}
          >
            /
          </kbd>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="status-filter" className="sr-only">
            Filter by status
          </label>
          <select
            id="status-filter"
            value={filters.status}
            onChange={(e) => onChange({ status: e.target.value as StatusFilter })}
            className={`rounded-lg border px-3 py-2 text-sm ${inputBg} ${border} ${text}`}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          <div
            className={`hidden overflow-hidden rounded-lg border sm:flex ${border}`}
            role="group"
            aria-label="Row density"
          >
            {(["comfortable", "compact"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onDensityChange(d)}
                aria-pressed={density === d}
                title={d === "comfortable" ? "Comfortable rows" : "Compact rows"}
                className={`px-2.5 py-2 text-xs capitalize transition-colors ${
                  density === d ? "bg-blue-600 text-white" : `${cardBg} ${textMuted}`
                }`}
              >
                {d === "comfortable" ? "≡" : "☰"}
                <span className="sr-only">{d}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by provider">
          {PROVIDERS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChange({ provider: p })}
              aria-pressed={filters.provider === p}
              className={chip(filters.provider === p)}
            >
              {p === "all" ? "All providers" : providerLabel(p)}
            </button>
          ))}
        </div>

        <span className={`hidden h-4 w-px sm:block ${theme === "dark" ? "bg-gray-800" : "bg-gray-200"}`} aria-hidden="true" />

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => onChange({ category: c.value })}
              aria-pressed={filters.category === c.value}
              className={chip(filters.category === c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className={`inline-flex cursor-pointer select-none items-center gap-2 text-sm ${textMuted}`}>
          <input
            type="checkbox"
            checked={filters.hideEndpoints}
            onChange={(e) => onChange({ hideEndpoints: e.target.checked })}
            className="h-4 w-4 rounded accent-blue-600"
          />
          Hide non-chat endpoints
          <span className={`text-xs ${textMuted}`}>(embeddings, audio, classifiers)</span>
        </label>

        <div className="flex items-center gap-3">
          <p className={`text-sm tabular-nums ${textMuted}`} aria-live="polite">
            {resultCount === totalCount
              ? `${totalCount} model${totalCount === 1 ? "" : "s"}`
              : `${resultCount} of ${totalCount} models`}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onReset}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${cardBg} ${border} ${textMuted} hover:border-blue-500/60`}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>
    </section>
  );
});

export default FilterBar;
