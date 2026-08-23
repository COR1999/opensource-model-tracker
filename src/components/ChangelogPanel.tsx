import type { ChangelogEntry } from "@/lib/storage";
import { accents, styles } from "@/lib/display";
import type { Theme } from "@/lib/display";

export default function ChangelogPanel({ entries, theme }: { entries: ChangelogEntry[]; theme: Theme }) {
  const accent = accents(theme);
  const { cardBg, border, textMuted } = styles(theme);

  return (
    <div className={`mb-6 p-4 rounded-lg border ${cardBg} ${border}`}>
      <h2 className="font-bold mb-3">Model Changelog (30 days)</h2>
      {entries.length === 0 ? (
        <p className={`text-sm ${textMuted}`}>No changes recorded yet. Changes are tracked as you visit.</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {[...entries].reverse().map((e, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <span className={e.type === "added" ? accent.ok : accent.bad}>
                {e.type === "added" ? "+" : "-"}
              </span>
              <span className="font-mono text-xs">{e.displayName}</span>
              <span className={`text-xs ${textMuted}`}>
                {new Date(e.timestamp).toLocaleDateString()} {new Date(e.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
