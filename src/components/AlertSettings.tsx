"use client";

import { useState, useEffect, useCallback } from "react";
import type { Subscription } from "@/lib/subscriptions";
import {
  loadSubscriptions,
  addSubscription,
  removeSubscription,
} from "@/lib/subscriptions";
import { styles, accents, type Theme } from "@/lib/display";

export default function AlertSettings({ theme }: { theme: Theme }) {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is browser-only
    setSubs(loadSubscriptions());
  }, []);

  const handleAdd = useCallback(() => {
    setError(null);
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Webhook URL is required");
      return;
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setError("URL must use http or https");
        return;
      }
    } catch {
      setError("Invalid URL");
      return;
    }
    addSubscription(trimmed);
    setSubs(loadSubscriptions());
    setUrl("");
    setShowForm(false);
  }, [url]);

  const handleRemove = useCallback((id: string) => {
    removeSubscription(id);
    setSubs(loadSubscriptions());
  }, []);

  const { cardBg, border, text, textMuted, textSubtle, inputBg } = styles(theme);
  const accent = accents(theme);

  return (
    <section className={`rounded-xl border p-4 ${cardBg} ${border}`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className={`text-sm font-semibold ${text}`}>Webhook Alerts</h2>
          <p className={`text-xs ${textMuted} mt-0.5`}>
            Get notified when model status changes
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${cardBg} ${border} ${textMuted} hover:border-blue-500/60`}
        >
          {showForm ? "Cancel" : "+ Add webhook"}
        </button>
      </div>

      {showForm && (
        <div className={`mb-4 rounded-lg border p-3 ${border}`}>
          <label htmlFor="webhook-url" className={`block text-xs font-medium ${textMuted} mb-1.5`}>
            Webhook URL
          </label>
          <div className="flex gap-2">
            <input
              id="webhook-url"
              type="url"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError(null); }}
              placeholder="https://hooks.slack.com/..."
              className={`flex-1 rounded-lg border px-3 py-2 text-sm ${inputBg} ${border} ${text} ${
                theme === "dark" ? "placeholder:text-gray-500" : "placeholder:text-gray-400"
              } focus:border-blue-500`}
            />
            <button
              type="button"
              onClick={handleAdd}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
            >
              Add
            </button>
          </div>
          {error && <p className={`mt-1.5 text-xs ${accent.bad}`}>{error}</p>}
          <p className={`mt-2 text-xs ${textSubtle}`}>
            POSTs a JSON payload to this URL when a model&apos;s status changes.
            Monitors all models by default.
          </p>
        </div>
      )}

      {subs.length === 0 ? (
        <p className={`text-xs ${textSubtle}`}>
          No webhooks configured. Add one to receive alerts when models go up or down.
        </p>
      ) : (
        <ul className="space-y-2">
          {subs.map((sub) => (
            <li
              key={sub.id}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${border}`}
            >
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-mono truncate ${text}`}>{sub.url}</p>
                <p className={`text-xs ${textSubtle}`}>
                  {sub.modelIds.length === 0
                    ? "All models"
                    : `${sub.modelIds.length} model${sub.modelIds.length === 1 ? "" : "s"}`}
                  {" · "}
                  Added {new Date(sub.createdAt).toLocaleDateString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(sub.id)}
                className={`flex-none rounded px-2 py-1 text-xs transition-colors ${textSubtle} hover:text-red-400`}
                aria-label={`Remove webhook ${sub.url}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
