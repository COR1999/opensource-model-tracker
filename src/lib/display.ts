import type { ModelCategory, UptimeRecord } from "./models";

export type Theme = "dark" | "light";

export function statusColor(status: string, theme: Theme): string {
  const dark = theme === "dark";
  switch (status) {
    case "working": return dark ? "text-emerald-400" : "text-emerald-600";
    case "slow": return dark ? "text-yellow-400" : "text-yellow-600";
    case "error": return dark ? "text-red-400" : "text-red-600";
    case "timeout": return dark ? "text-orange-400" : "text-orange-600";
    case "removed": return dark ? "text-gray-500" : "text-gray-400";
    default: return dark ? "text-gray-400" : "text-gray-500";
  }
}

export function statusBg(status: string, theme: Theme): string {
  if (theme === "light") {
    switch (status) {
      case "working": return "bg-emerald-50";
      case "slow": return "bg-yellow-50";
      case "error": return "bg-red-50";
      case "timeout": return "bg-orange-50";
      case "removed": return "bg-gray-50";
      default: return "";
    }
  }
  switch (status) {
    case "working": return "bg-emerald-400/10";
    case "slow": return "bg-yellow-400/10";
    case "error": return "bg-red-400/10";
    case "timeout": return "bg-orange-400/10";
    case "removed": return "bg-gray-500/10";
    default: return "";
  }
}

export function providerBadge(provider: string, theme: Theme): string {
  if (theme === "light") {
    switch (provider) {
      case "nvidia": return "bg-green-50 text-green-700 border-green-200";
      case "opencode": return "bg-purple-50 text-purple-700 border-purple-200";
      case "openrouter": return "bg-blue-50 text-blue-700 border-blue-200";
      default: return "bg-gray-100 text-gray-600 border-gray-200";
    }
  }
  switch (provider) {
    case "nvidia": return "bg-green-900/40 text-green-300 border-green-700/50";
    case "opencode": return "bg-purple-900/40 text-purple-300 border-purple-700/50";
    case "openrouter": return "bg-blue-900/40 text-blue-300 border-blue-700/50";
    default: return "bg-gray-800 text-gray-400 border-gray-700";
  }
}

export function categoryBadge(category: ModelCategory, theme: Theme): string {
  if (theme === "light") {
    switch (category) {
      case "chat": return "bg-blue-50 text-blue-700";
      case "code": return "bg-orange-50 text-orange-700";
      case "vision": return "bg-pink-50 text-pink-700";
      case "embedding": return "bg-cyan-50 text-cyan-700";
      case "audio": return "bg-violet-50 text-violet-700";
      default: return "bg-gray-100 text-gray-600";
    }
  }
  switch (category) {
    case "chat": return "bg-blue-900/40 text-blue-300";
    case "code": return "bg-orange-900/40 text-orange-300";
    case "vision": return "bg-pink-900/40 text-pink-300";
    case "embedding": return "bg-cyan-900/40 text-cyan-300";
    case "audio": return "bg-violet-900/40 text-violet-300";
    default: return "bg-gray-800 text-gray-400";
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
