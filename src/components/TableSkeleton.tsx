import { styles, type Theme } from "@/lib/display";

/**
 * Structural placeholder matching the real table's shape, so the layout does
 * not jump when data lands. Replaces a bare centred spinner that gave no
 * indication of what was arriving.
 */
export default function TableSkeleton({ theme, rows = 8 }: { theme: Theme; rows?: number }) {
  const { cardBg, border } = styles(theme);
  const barCls = theme === "dark" ? "bg-gray-800" : "bg-gray-200";

  return (
    <div
      className={`overflow-hidden rounded-xl border ${border}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading models…</span>
      <div className={`border-b px-4 py-3 ${border} ${cardBg}`}>
        <div className={`motion-safe:animate-shimmer h-3 w-32 rounded ${barCls}`} />
      </div>
      <div aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className={`flex items-center gap-4 border-b px-4 py-3.5 last:border-0 ${border}`}
            // Stagger so the placeholder reads as activity rather than a freeze.
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className={`motion-safe:animate-shimmer h-4 w-4 flex-none rounded ${barCls}`} />
            <div className={`motion-safe:animate-shimmer h-5 w-20 flex-none rounded-full ${barCls}`} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div
                className={`motion-safe:animate-shimmer h-3.5 rounded ${barCls}`}
                style={{ width: `${45 + ((i * 13) % 35)}%` }}
              />
              <div
                className={`motion-safe:animate-shimmer h-2.5 rounded ${barCls}`}
                style={{ width: `${25 + ((i * 7) % 25)}%` }}
              />
            </div>
            <div className={`motion-safe:animate-shimmer hidden h-3 w-12 flex-none rounded sm:block ${barCls}`} />
            <div className={`motion-safe:animate-shimmer hidden h-3 w-16 flex-none rounded md:block ${barCls}`} />
            <div className={`motion-safe:animate-shimmer h-7 w-14 flex-none rounded-lg ${barCls}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
