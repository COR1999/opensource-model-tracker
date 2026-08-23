import type { UptimeRecord } from "@/lib/models";
import { dailyBuckets, type Theme } from "@/lib/display";

export default function UptimeSparkline({ records, theme }: { records: UptimeRecord[]; theme: Theme }) {
  const buckets = dailyBuckets(records);
  const emptyCls = theme === "dark" ? "bg-gray-700" : "bg-gray-200";
  return (
    <div className="flex items-end gap-[2px]" aria-hidden="true">
      {buckets.map((b, i) => {
        const cls =
          b.count === 0
            ? emptyCls
            : b.ratio >= 0.9
              ? "bg-emerald-400"
              : b.ratio >= 0.5
                ? "bg-yellow-400"
                : "bg-red-400";
        const title =
          b.count === 0
            ? "no checks"
            : `${Math.round(b.ratio * 100)}% up · ${b.count} check${b.count > 1 ? "s" : ""}`;
        return <div key={i} className={`w-1 h-3.5 rounded-sm ${cls}`} title={title} />;
      })}
    </div>
  );
}
