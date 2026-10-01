import type { ModelInfo, TestResult } from "./types";
import { isOpencodeAppOnlyModel } from "./testing";

export type StatusFilter =
  | "all"
  | "working"
  | "slow"
  | "rate-limited"
  | "opencode-only"
  | "removed"
  | "error"
  | "untested";

/**
 * Whether a model passes the status filter. Extracted from the page's filter
 * chain so the predicate is testable on its own — it had grown to eight inline
 * clauses in a useMemo.
 *
 * "working" deliberately also matches slow: from a user's point of view a slow
 * model is still usable, and the dashboard's Copy Working action treats them
 * alike. "error" likewise covers timeout.
 */
export function matchesStatusFilter(
  model: ModelInfo,
  status: TestResult["status"] | undefined,
  filter: StatusFilter
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "working":
      return status === "working" || status === "slow";
    case "slow":
      return status === "slow";
    case "rate-limited":
      return status === "rate-limited";
    case "opencode-only":
      // Model-derived, not result-derived: automated probes skip Zen free ids,
      // so they never acquire an opencode-only result to filter on.
      return isOpencodeAppOnlyModel(model);
    case "removed":
      return status === "removed";
    case "error":
      return status === "error" || status === "timeout";
    case "untested":
      return status === undefined;
  }
}

export const STATUS_FILTER_OPTIONS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Any status" },
  { value: "working", label: "Working" },
  { value: "slow", label: "Slow" },
  { value: "rate-limited", label: "Rate limited" },
  { value: "opencode-only", label: "OpenCode app" },
  { value: "removed", label: "Removed" },
  { value: "error", label: "Down" },
  { value: "untested", label: "Not tested" },
];
