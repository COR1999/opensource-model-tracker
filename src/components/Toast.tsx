"use client";

import { useEffect } from "react";
import type { Theme } from "@/lib/display";
import { styles, accents } from "@/lib/display";

export type ToastTone = "success" | "warning" | "error" | "info";

export interface ToastMessage {
  id: number;
  tone: ToastTone;
  text: string;
}

const ICONS: Record<ToastTone, string> = {
  success: "✓",
  warning: "!",
  error: "×",
  info: "i",
};

/**
 * Auto-dismissing status message. Announced politely rather than assertively:
 * these confirm actions the user just took, so they should not interrupt a
 * screen reader mid-sentence.
 */
export default function Toast({
  message,
  theme,
  onDismiss,
  duration = 3500,
}: {
  message: ToastMessage | null;
  theme: Theme;
  onDismiss: () => void;
  duration?: number;
}) {
  const id = message?.id;

  useEffect(() => {
    if (id === undefined) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [id, duration, onDismiss]);

  const { cardBg, border, text, textMuted } = styles(theme);
  const accent = accents(theme);
  const tone = message?.tone ?? "info";
  const toneColor =
    tone === "success"
      ? accent.ok
      : tone === "warning"
        ? accent.warn
        : tone === "error"
          ? accent.bad
          : accent.info;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:justify-end sm:pr-6"
    >
      {message && (
        <div
          key={message.id}
          className={`motion-safe:animate-toast-in pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border px-4 py-3 shadow-lg shadow-black/20 ${cardBg} ${border}`}
        >
          <span
            aria-hidden="true"
            className={`mt-px flex h-5 w-5 flex-none items-center justify-center rounded-full border text-xs font-bold ${border} ${toneColor}`}
          >
            {ICONS[tone]}
          </span>
          <p className={`text-sm ${text}`}>{message.text}</p>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss notification"
            className={`-mr-1 ml-1 flex h-5 w-5 flex-none items-center justify-center rounded transition-colors ${
              // Written as whole class strings: Tailwind scans source text, so
              // an interpolated `hover:${...}` variant is never generated.
              theme === "dark" ? "hover:bg-white/10" : "hover:bg-black/5"
            } ${textMuted} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400`}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      )}
    </div>
  );
}
