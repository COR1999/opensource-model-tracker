"use client";

import { use } from "react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { providerBadge, statusColor } from "@/lib/display";
import { decodeSnapshot, type Snapshot } from "@/lib/share";

export default function ResultsPage({ params }: { params: Promise<{ timestamp: string }> }) {
  const { timestamp } = use(params);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- snapshot payload lives in the URL, not any store; decode after mount to keep SSR output deterministic
    setSnapshot(decodeSnapshot(timestamp));
    setLoading(false);
  }, [timestamp]);

  const date = snapshot && snapshot.ts !== null ? new Date(snapshot.ts) : null;
  const results = snapshot?.results ?? [];
  const omitted = snapshot?.omitted ?? 0;
  const valid = snapshot?.valid ?? false;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-8 text-center text-gray-500">
          Loading results...
        </div>
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-8 text-center text-gray-400">
          <h1 className="text-xl font-bold text-gray-100 mb-2">Invalid or Expired Link</h1>
          <p>This results link is invalid or the data has been corrupted.</p>
          <Link href="/" className="text-blue-400 hover:underline mt-4 inline-block">
            Go to Model Tracker
          </Link>
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-8 text-center text-gray-400">
          <h1 className="text-xl font-bold text-gray-100 mb-2">Empty Snapshot</h1>
          <p>This link decoded successfully but contains no results.</p>
          <Link href="/" className="text-blue-400 hover:underline mt-4 inline-block">
            Go to Model Tracker
          </Link>
        </div>
      </div>
    );
  }

  const working = results.filter((r) => r.status === "working").length;
  const slow = results.filter((r) => r.status === "slow").length;
  const errors = results.filter((r) => r.status === "error" || r.status === "timeout").length;
  const removed = results.filter((r) => r.status === "removed").length;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Shared Test Results</h1>
        <p className="text-sm text-gray-500 mt-1">
          Snapshot from {date?.toLocaleDateString()} {date?.toLocaleTimeString()}
        </p>
        <div className="flex gap-4 mt-3 text-sm">
          <span className="text-emerald-400">{working} working</span>
          <span className="text-yellow-400">{slow} slow</span>
          <span className="text-red-400">{errors} error</span>
          <span className="text-gray-500">{removed} removed</span>
          <span className="text-gray-400">{results.length} total</span>
        </div>
        {omitted > 0 && (
          <p className="text-xs text-amber-400 mt-2">
            +{omitted} more result{omitted === 1 ? "" : "s"} omitted to keep the link within URL length limits.
          </p>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900/50 text-gray-400">
              <th className="text-left px-4 py-3">Provider</th>
              <th className="text-left px-4 py-3">Model</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Response</th>
              <th className="text-left px-4 py-3">Tools</th>
            </tr>
          </thead>
          <tbody>
            {results
              .sort((a, b) => {
                const order: Record<string, number> = { working: 0, slow: 1, error: 2, timeout: 3, removed: 4 };
                return (order[a.status] ?? 5) - (order[b.status] ?? 5);
              })
              .map((r) => (
                <tr key={r.modelId} className="border-b border-gray-800/50 hover:bg-gray-900/30">
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${providerBadge(r.provider, "dark")}`}>
                      {r.provider}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-sm">{r.modelId.split("/").pop()}</div>
                    <div className="text-xs text-gray-500 font-mono">{r.modelId}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-medium text-sm ${statusColor(r.status, "dark")}`}>
                      {r.status}
                    </span>
                    {r.error && (
                      <div className="text-xs text-gray-500 max-w-xs truncate mt-0.5" title={r.error}>
                        {r.error}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{r.responseTimeMs}ms</td>
                  <td className="px-4 py-3 text-xs">
                    {r.supportsFunctionCalling ? (
                      <span className="text-emerald-400">Yes</span>
                    ) : (
                      <span className="text-gray-600">No</span>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 text-center">
        <Link href="/" className="text-blue-400 hover:underline text-sm">
          Open Model Tracker
        </Link>
      </div>
      </div>
    </div>
  );
}
