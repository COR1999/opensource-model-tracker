import { describe, it, expect } from "vitest";
import {
  accents,
  styles,
  statusColor,
  statusBg,
  providerBadge,
  categoryBadge,
  computeUptimePercent,
  dailyBuckets,
} from "@/lib/display";
import type { UptimeRecord } from "@/lib/models";

describe("styles", () => {
  it("exposes every token for both themes", () => {
    const tokens = ["bg", "cardBg", "border", "text", "textMuted", "inputBg"] as const;
    for (const theme of ["dark", "light"] as const) {
      const s = styles(theme);
      for (const t of tokens) expect(s[t]).toMatch(/^(bg|border|text)-/);
    }
  });

  it("keeps card background constant across themes' input surfaces", () => {
    // inputBg and cardBg are intentionally identical values
    for (const theme of ["dark", "light"] as const) {
      expect(styles(theme).inputBg).toBe(styles(theme).cardBg);
    }
  });

  it("differs between themes", () => {
    expect(styles("dark").cardBg).not.toBe(styles("light").cardBg);
  });
});

describe("accents", () => {
  it("exposes all four accent roles for both themes", () => {
    const keys = ["ok", "warn", "bad", "info"] as const;
    for (const theme of ["dark", "light"] as const) {
      const a = accents(theme);
      for (const key of keys) {
        expect(a[key]).toMatch(/^text-/);
      }
    }
  });

  it("differs between themes", () => {
    expect(accents("dark").ok).not.toBe(accents("light").ok);
  });
});

describe("statusColor / statusBg", () => {
  it("maps every known status without throwing", () => {
    for (const theme of ["dark", "light"] as const) {
      for (const s of ["working", "slow", "error", "timeout", "removed"]) {
        expect(statusColor(s, theme)).toBeTruthy();
        expect(statusBg(s, theme)).toBeTruthy();
      }
    }
  });

  it("colors unknown statuses but leaves their background clear by design", () => {
    for (const theme of ["dark", "light"] as const) {
      expect(statusColor("mystery", theme)).toBeTruthy();
      expect(statusBg("mystery", theme)).toBe("");
    }
  });
});

describe("providerBadge / categoryBadge", () => {
  it("covers the three providers", () => {
    for (const p of ["nvidia", "opencode", "openrouter"]) {
      expect(providerBadge(p, "dark")).toBeTruthy();
    }
  });

  it("falls back gracefully for unknown providers/categories", () => {
    expect(providerBadge("acme", "dark")).toBeTruthy();
    expect(categoryBadge("quantum" as never, "dark")).toBeTruthy();
  });
});

function uptime(status: string, daysAgo = 0): UptimeRecord {
  return { timestamp: Date.now() - daysAgo * 86400000, status } as UptimeRecord;
}

describe("computeUptimePercent", () => {
  it("returns 0 for no records", () => {
    expect(computeUptimePercent([])).toBe(0);
  });

  it("counts slow as healthy", () => {
    expect(computeUptimePercent([uptime("working"), uptime("slow")])).toBe(100);
  });

  it("rounds to nearest percent", () => {
    const recs = [uptime("working"), uptime("working"), uptime("working"), uptime("error")];
    expect(computeUptimePercent(recs)).toBe(75);
  });
});

describe("dailyBuckets", () => {
  it("always returns seven buckets oldest-first", () => {
    const buckets = dailyBuckets([]);
    expect(buckets).toHaveLength(7);
    expect(buckets.every((b) => b.ratio === 0 && b.count === 0)).toBe(true);
  });

  it("places today's records in the last bucket", () => {
    const buckets = dailyBuckets([uptime("working")]);
    expect(buckets[6].count).toBe(1);
    expect(buckets[6].ratio).toBe(1);
    expect(buckets[0].count).toBe(0);
  });

  it("ignores records older than seven days", () => {
    const buckets = dailyBuckets([uptime("working", 9)]);
    expect(buckets.every((b) => b.count === 0)).toBe(true);
  });
});
