import type { UptimeRecord } from "@/lib/models";
import { dailyBuckets, type Theme } from "@/lib/display";

const DAY_LABELS = ["6 days ago", "5 days ago", "4 days ago", "3 days ago", "2 days ago", "Yesterday", "Today"];

/**
 * Seven daily uptime buckets, oldest first.
 *
 * The whole graphic used to be aria-hidden while carrying its detail in `title`
 * attributes, which made that detail unreachable by any assistive technology.
 * The bars are now decorative and the same information is exposed as text.
 */
export default function UptimeSparkline({
  records,
  theme,
  percent,
}: {
  records: UptimeRecord[];
  theme: Theme;
  percent: number;
}) {
  const buckets = dailyBuckets(records);
  const emptyCls = theme === "dark" ? "bg-gray-700" : "bg-gray-200";
  const checked = buckets.filter((b) => b.count > 0).length;

  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex items-end gap-[2px]" aria-hidden="true">
        {buckets.map((b, i) => {
          const cls =
            b.count === 0
              ? emptyCls
              : b.ratio >= 0.9
                ? "bg-emerald-500"
                : b.ratio >= 0.5
                  ? "bg-amber-500"
                  : "bg-red-500";
          // Height encodes the ratio too, so the trend survives without colour.
          const height = b.count === 0 ? "h-1.5" : b.ratio >= 0.9 ? "h-4" : b.ratio >= 0.5 ? "h-3" : "h-2";
          return (
            <span
              key={i}
              className={`w-1 rounded-sm ${height} ${cls}`}
              title={
                b.count === 0
                  ? `${DAY_LABELS[i]}: no checks`
                  : `${DAY_LABELS[i]}: ${Math.round(b.ratio * 100)}% up over ${b.count} check${b.count === 1 ? "" : "s"}`
              }
            />
          );
        })}
      </span>
      <span className="sr-only">
        {percent}% uptime across {checked} of the last 7 days
      </span>
    </span>
  );
}
