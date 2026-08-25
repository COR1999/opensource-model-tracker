import { styles, type Theme } from "@/lib/display";

/**
 * Empty states name the cause and offer the action that resolves it — the
 * previous bare "No models found" left the user to guess which of several
 * active filters was responsible.
 */
export default function EmptyState({
  theme,
  icon = "🔍",
  title,
  description,
  action,
}: {
  theme: Theme;
  icon?: string;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}) {
  const { cardBg, border, text, textMuted } = styles(theme);

  return (
    <div className={`rounded-xl border px-6 py-16 text-center ${border} ${cardBg}`}>
      <div
        className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border text-xl ${border}`}
        aria-hidden="true"
      >
        {icon}
      </div>
      <p className={`text-sm font-medium ${text}`}>{title}</p>
      {description && (
        <p className={`mx-auto mt-1.5 max-w-sm text-sm ${textMuted}`}>{description}</p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
