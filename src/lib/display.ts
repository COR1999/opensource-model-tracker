import type { ModelCategory, UptimeRecord } from "./models";

export type Theme = "dark" | "light";
export type Density = "comfortable" | "compact";

// Surface/typography tokens shared by every panel so components stay
// theme-consistent without re-deriving class strings.
export interface StyleTokens {
  bg: string;
  cardBg: string;
  border: string;
  text: string;
  textMuted: string;
  inputBg: string;
  /** Lower-emphasis than textMuted; still meets 4.5:1 on cardBg. */
  textSubtle: string;
  /** Hover/active surface for rows and ghost buttons. */
  hoverBg: string;
  /** Slightly raised surface for headers and sticky regions. */
  raisedBg: string;
  /** Stronger divider for structural separation. */
  borderStrong: string;
}

export function styles(theme: Theme): StyleTokens {
  const dark = theme === "dark";
  return {
    bg: dark ? "bg-gray-950" : "bg-gray-50",
    cardBg: dark ? "bg-gray-900" : "bg-white",
    border: dark ? "border-gray-800" : "border-gray-200",
    text: dark ? "text-white" : "text-gray-900",
    // Contrast-corrected: light mode previously used gray-400 on white
    // (~2.5:1), far below the 4.5:1 WCAG AA minimum for body text. Dark mode
    // used gray-500 on gray-900 (~4.0:1), also short.
    textMuted: dark ? "text-gray-400" : "text-gray-600",
    textSubtle: dark ? "text-gray-500" : "text-gray-500",
    inputBg: dark ? "bg-gray-900" : "bg-white",
    hoverBg: dark ? "hover:bg-gray-800/60" : "hover:bg-gray-100",
    raisedBg: dark ? "bg-gray-900/80" : "bg-gray-50",
    borderStrong: dark ? "border-gray-700" : "border-gray-300",
  };
}

export interface DensityTokens {
  cellY: string;
  rowText: string;
  gap: string;
}

export function densityTokens(density: Density): DensityTokens {
  return density === "compact"
    ? { cellY: "py-1.5", rowText: "text-[13px]", gap: "gap-1.5" }
    : { cellY: "py-3", rowText: "text-sm", gap: "gap-2" };
}

// Semantic accent colors used outside status cells (stat cards, badges,
// links); every value must stay legible on the theme's card background.
export function accents(theme: Theme): { ok: string; warn: string; bad: string; info: string } {
  if (theme === "light") {
    return {
      ok: "text-emerald-700",
      warn: "text-amber-700",
      bad: "text-red-700",
      info: "text-cyan-700",
    };
  }
  return {
    ok: "text-emerald-400",
    warn: "text-amber-400",
    bad: "text-red-400",
    info: "text-cyan-400",
  };
}

export function statusColor(status: string, theme: Theme): string {
  const dark = theme === "dark";
  switch (status) {
    case "working": return dark ? "text-emerald-400" : "text-emerald-700";
    case "slow": return dark ? "text-amber-400" : "text-amber-700";
    case "error": return dark ? "text-red-400" : "text-red-700";
    case "timeout": return dark ? "text-orange-400" : "text-orange-700";
    case "removed": return dark ? "text-gray-400" : "text-gray-600";
    default: return dark ? "text-gray-400" : "text-gray-600";
  }
}

export function statusBg(status: string, theme: Theme): string {
  if (theme === "light") {
    switch (status) {
      case "working": return "bg-emerald-50";
      case "slow": return "bg-amber-50";
      case "error": return "bg-red-50";
      case "timeout": return "bg-orange-50";
      case "removed": return "bg-gray-50";
      default: return "";
    }
  }
  switch (status) {
    case "working": return "bg-emerald-400/10";
    case "slow": return "bg-amber-400/10";
    case "error": return "bg-red-400/10";
    case "timeout": return "bg-orange-400/10";
    case "removed": return "bg-gray-500/10";
    default: return "";
  }
}

/** Small colour chip used to mark a row's status without relying on hue alone. */
export function statusDot(status: string): string {
  switch (status) {
    case "working": return "bg-emerald-500";
    case "slow": return "bg-amber-500";
    case "error": return "bg-red-500";
    case "timeout": return "bg-orange-500";
    case "removed": return "bg-gray-500";
    default: return "bg-gray-600";
  }
}

/**
 * Human-readable status text. Colour alone is not an accessible signal, so
 * every status cell pairs its hue with this label.
 */
export function statusLabel(status: string): string {
  switch (status) {
    case "working": return "Working";
    case "slow": return "Slow";
    case "error": return "Error";
    case "timeout": return "Timeout";
    case "removed": return "Removed";
    default: return "Not tested";
  }
}

export function providerBadge(provider: string, theme: Theme): string {
  if (theme === "light") {
    switch (provider) {
      case "nvidia": return "bg-green-50 text-green-800 border-green-200";
      case "opencode": return "bg-purple-50 text-purple-800 border-purple-200";
      case "openrouter": return "bg-blue-50 text-blue-800 border-blue-200";
      default: return "bg-gray-100 text-gray-700 border-gray-200";
    }
  }
  switch (provider) {
    case "nvidia": return "bg-green-900/40 text-green-300 border-green-700/50";
    case "opencode": return "bg-purple-900/40 text-purple-300 border-purple-700/50";
    case "openrouter": return "bg-blue-900/40 text-blue-300 border-blue-700/50";
    default: return "bg-gray-800 text-gray-300 border-gray-700";
  }
}

export function providerLabel(provider: string): string {
  switch (provider) {
    case "nvidia": return "NVIDIA";
    case "opencode": return "OpenCode";
    case "openrouter": return "OpenRouter";
    default: return provider;
  }
}

export function categoryBadge(category: ModelCategory, theme: Theme): string {
  if (theme === "light") {
    switch (category) {
      case "chat": return "bg-blue-50 text-blue-800";
      case "code": return "bg-orange-50 text-orange-800";
      case "vision": return "bg-pink-50 text-pink-800";
      case "embedding": return "bg-cyan-50 text-cyan-800";
      case "audio": return "bg-violet-50 text-violet-800";
      default: return "bg-gray-100 text-gray-700";
    }
  }
  switch (category) {
    case "chat": return "bg-blue-900/40 text-blue-300";
    case "code": return "bg-orange-900/40 text-orange-300";
    case "vision": return "bg-pink-900/40 text-pink-300";
    case "embedding": return "bg-cyan-900/40 text-cyan-300";
    case "audio": return "bg-violet-900/40 text-violet-300";
    default: return "bg-gray-800 text-gray-300";
  }
}

export function computeUptimePercent(records: UptimeRecord[]): number {
  if (records.length === 0) return 0;
  const working = records.filter((r) => r.status === "working" || r.status === "slow").length;
  return Math.round((working / records.length) * 100);
}

// One bucket per calendar day, oldest first; ratio is healthy checks / total
export function dailyBuckets(records: UptimeRecord[]): { ratio: number; count: number }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = Array.from({ length: 7 }, () => ({ healthy: 0, total: 0 }));
  for (const r of records) {
    const day = new Date(r.timestamp);
    day.setHours(0, 0, 0, 0);
    const idx = 6 - Math.floor((today.getTime() - day.getTime()) / 86400000);
    if (idx < 0 || idx > 6) continue;
    buckets[idx].total++;
    if (r.status === "working" || r.status === "slow") buckets[idx].healthy++;
  }
  return buckets.map((b) => ({ ratio: b.total ? b.healthy / b.total : 0, count: b.total }));
}

/** Compact token-count label: 128000 -> "128K", 1000000 -> "1M". */
export function formatContextLength(tokens: number | undefined): string {
  if (!tokens || tokens <= 0) return "—";
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
  return String(tokens);
}

/** Response time with a sensible unit, so 12000ms reads as "12.0s". */
export function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

/** "3 minutes ago" style label for the last-refresh indicator. */
export function formatRelativeTime(from: Date, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - from.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
