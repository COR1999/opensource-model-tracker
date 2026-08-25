import type { ChangelogEntry } from "@/lib/storage";
import { accents, styles, type Theme } from "@/lib/display";

/** Groups entries by day so a burst of provider changes reads as one event. */
function groupByDay(entries: ChangelogEntry[]): [string, ChangelogEntry[]][] {
  const groups = new Map<string, ChangelogEntry[]>();
  for (const e of [...entries].sort((a, b) => b.timestamp - a.timestamp)) {
    const key = new Date(e.timestamp).toLocaleDateString(undefined, { dateStyle: "medium" });
    const bucket = groups.get(key);
    if (bucket) bucket.push(e);
    else groups.set(key, [e]);
  }
  return [...groups.entries()];
}

export default function ChangelogPanel({
  entries,
  theme,
}: {
  entries: ChangelogEntry[];
  theme: Theme;
}) {
  const accent = accents(theme);
  const { cardBg, border, text, textMuted, textSubtle } = styles(theme);
  const groups = groupByDay(entries);

  return (
    <section
      aria-label="Model changelog"
      className={`mb-6 rounded-xl border p-4 ${cardBg} ${border}`}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className={`text-sm font-semibold ${text}`}>Model changelog</h2>
        <span className={`text-xs ${textSubtle}`}>Last 30 days</span>
      </div>

      {entries.length === 0 ? (
        <p className={`py-6 text-center text-sm ${textMuted}`}>
          No changes recorded yet. Additions and removals are tracked from your visits, so this
          fills in as the catalog shifts.
        </p>
      ) : (
        <div className="scroll-thin max-h-72 space-y-4 overflow-y-auto pr-1">
          {groups.map(([day, items]) => (
            <div key={day}>
              <h3 className={`mb-1.5 text-xs font-medium uppercase tracking-wider ${textSubtle}`}>
                {day}
              </h3>
              <ul className="space-y-1.5">
                {items.map((e) => (
                  <li key={`${e.timestamp}-${e.modelId}`} className="flex items-center gap-2.5 text-sm">
                    <span
                      aria-hidden="true"
                      className={`flex h-4 w-4 flex-none items-center justify-center rounded-full text-[10px] font-bold ${
                        e.type === "added"
                          ? "bg-emerald-500/15 " + accent.ok
                          : "bg-red-500/15 " + accent.bad
                      }`}
                    >
                      {e.type === "added" ? "+" : "−"}
                    </span>
                    <span className="sr-only">{e.type === "added" ? "Added" : "Removed"}</span>
                    <span className={`min-w-0 flex-1 truncate ${text}`} title={e.modelId}>
                      {e.displayName}
                    </span>
                    <time
                      dateTime={new Date(e.timestamp).toISOString()}
                      className={`flex-none text-xs tabular-nums ${textSubtle}`}
                    >
                      {new Date(e.timestamp).toLocaleTimeString(undefined, { timeStyle: "short" })}
                    </time>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
