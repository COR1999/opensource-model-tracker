import type { UptimeRecord } from "@/lib/models";
import { formatDuration, type Theme } from "@/lib/display";

const DAY_LABELS = ["6d", "5d", "4d", "3d", "2d", "Yest", "Today"];

interface DayStats {
  avgMs: number;
  count: number;
}

/**
 * Computes per-day average response time from raw uptime records.
 * Only includes records with a positive response time (working/slow).
 */
function computeDailyStats(records: UptimeRecord[]): (DayStats | null)[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets: { totalMs: number; count: number }[] = Array.from({ length: 7 }, () => ({ totalMs: 0, count: 0 }));

  for (const r of records) {
    if (r.responseTimeMs <= 0) continue;
    const day = new Date(r.timestamp);
    day.setHours(0, 0, 0, 0);
    const idx = 6 - Math.floor((today.getTime() - day.getTime()) / 86400000);
    if (idx < 0 || idx > 6) continue;
    buckets[idx].totalMs += r.responseTimeMs;
    buckets[idx].count++;
  }

  return buckets.map((b) =>
    b.count > 0 ? { avgMs: Math.round(b.totalMs / b.count), count: b.count } : null,
  );
}

export default function ResponseTrendChart({
  records,
  theme,
}: {
  records: UptimeRecord[];
  theme: Theme;
}) {
  const stats = computeDailyStats(records);
  const hasData = stats.some((s) => s !== null);

  if (!hasData) {
    return null;
  }

  const values = stats.map((s) => s?.avgMs ?? 0);
  const max = Math.max(...values, 1);
  const min = 0;
  const range = max - min || 1;

  const svgWidth = 280;
  const svgHeight = 60;
  const padX = 4;
  const padY = 4;
  const chartW = svgWidth - padX * 2;
  const chartH = svgHeight - padY * 2;

  const points = values.map((v, i) => {
    const x = padX + (i / 6) * chartW;
    const y = padY + chartH - ((v - min) / range) * chartH;
    return { x, y, value: v, hasData: stats[i] !== null };
  });

  // Build path — skip segments where there's no data
  let pathD = "";
  let started = false;
  for (const p of points) {
    if (!p.hasData) {
      started = false;
      continue;
    }
    if (!started) {
      pathD += `M ${p.x} ${p.y}`;
      started = true;
    } else {
      pathD += ` L ${p.x} ${p.y}`;
    }
  }

  const textClass = theme === "dark" ? "fill-gray-400" : "fill-gray-500";
  const lineClass = theme === "dark" ? "stroke-blue-500" : "stroke-blue-600";
  const dotClass = theme === "dark" ? "fill-blue-400" : "fill-blue-600";
  const gridClass = theme === "dark" ? "stroke-gray-800" : "stroke-gray-200";

  return (
    <div>
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full max-w-[280px]"
        role="img"
        aria-label={`Response time trend: ${stats.filter(Boolean).length} of 7 days with data`}
      >
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
          <line
            key={frac}
            x1={padX}
            y1={padY + chartH * (1 - frac)}
            x2={padX + chartW}
            y2={padY + chartH * (1 - frac)}
            className={gridClass}
            strokeWidth="0.5"
          />
        ))}

        {/* Line */}
        {pathD && (
          <path d={pathD} fill="none" className={lineClass} strokeWidth="1.5" strokeLinejoin="round" />
        )}

        {/* Dots */}
        {points.map(
          (p, i) =>
            p.hasData && (
              <circle key={i} cx={p.x} cy={p.y} r="2.5" className={dotClass} />
            ),
        )}

        {/* Day labels */}
        {points.map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={svgHeight - 1}
            textAnchor="middle"
            className={textClass}
            fontSize="7"
          >
            {DAY_LABELS[i]}
          </text>
        ))}
      </svg>

      {/* Summary */}
      <div className="mt-1.5 flex items-center gap-3 text-xs">
        <span className={`tabular-nums ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
          avg {formatDuration(Math.round(values.reduce((a, b) => a + b, 0) / Math.max(values.filter((v) => v > 0).length, 1)))}
        </span>
        <span className={`tabular-nums ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>
          max {formatDuration(max)}
        </span>
      </div>
    </div>
  );
}
