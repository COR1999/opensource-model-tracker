"use client";

import { useEffect, useRef } from "react";
import type { Theme } from "@/lib/display";
import { styles } from "@/lib/display";

/**
 * Fallback for when `navigator.clipboard` is unavailable (insecure context) or
 * the user denied permission. The link is always recoverable by hand rather
 * than the share action silently doing nothing.
 */
export default function ShareDialog({
  url,
  note,
  theme,
  onClose,
}: {
  url: string;
  note: string;
  theme: Theme;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { cardBg, border, text, textMuted, inputBg } = styles(theme);

  useEffect(() => {
    // Preselect so Ctrl/Cmd-C works immediately.
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      // Minimal focus trap: only two stops, so cycle between them.
      if (e.key === "Tab") {
        const a = inputRef.current;
        const b = closeRef.current;
        if (!a || !b) return;
        e.preventDefault();
        (document.activeElement === a ? b : a).focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div
      className="motion-safe:animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-lg rounded-2xl border p-5 shadow-2xl ${cardBg} ${border}`}
      >
        <h2 id="share-dialog-title" className={`text-base font-semibold ${text}`}>
          Copy your share link
        </h2>
        <p className={`mt-1 text-sm ${textMuted}`}>{note}</p>

        <input
          ref={inputRef}
          readOnly
          value={url}
          aria-label="Shareable results URL"
          onFocus={(e) => e.currentTarget.select()}
          className={`mt-4 w-full rounded-lg border px-3 py-2 font-mono text-xs ${inputBg} ${border} ${text}`}
        />

        <div className="mt-4 flex justify-end">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
