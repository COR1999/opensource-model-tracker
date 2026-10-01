import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isAuthorized } from "@/lib/api-auth";

function fakeRequest(headers: Record<string, string>): { headers: { get: (name: string) => string | null } } {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  };
}

describe("isAuthorized", () => {
  const CRON_SECRET = "test-secret-123";

  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("authorises requests bearing the CRON_SECRET bearer token", () => {
    const req = fakeRequest({ authorization: `Bearer ${CRON_SECRET}` });
    expect(isAuthorized(req as never)).toBe(true);
  });

  it("rejects requests with a wrong bearer token", () => {
    const req = fakeRequest({ authorization: "Bearer wrong-token" });
    expect(isAuthorized(req as never)).toBe(false);
  });

  it("rejects requests with no authorization header", () => {
    const req = fakeRequest({});
    expect(isAuthorized(req as never)).toBe(false);
  });

  it("authorises same-origin requests via Origin header", () => {
    const req = fakeRequest({ host: "example.com", origin: "https://example.com" });
    expect(isAuthorized(req as never)).toBe(true);
  });

  it("authorises same-origin requests via Referer header", () => {
    const req = fakeRequest({ host: "example.com", referer: "https://example.com/dashboard" });
    expect(isAuthorized(req as never)).toBe(true);
  });

  it("rejects cross-origin requests", () => {
    const req = fakeRequest({ host: "example.com", origin: "https://evil.com" });
    expect(isAuthorized(req as never)).toBe(false);
  });

  it("rejects requests with no Origin and no Referer", () => {
    const req = fakeRequest({ host: "example.com" });
    expect(isAuthorized(req as never)).toBe(false);
  });

  it("rejects requests with no Host header", () => {
    const req = fakeRequest({ origin: "https://example.com" });
    expect(isAuthorized(req as never)).toBe(false);
  });

  it("rejects requests with malformed Origin URL", () => {
    const req = fakeRequest({ host: "example.com", origin: "not-a-url" });
    expect(isAuthorized(req as never)).toBe(false);
  });

  it("authorises when CRON_SECRET is not configured but Origin matches", () => {
    delete process.env.CRON_SECRET;
    const req = fakeRequest({ host: "example.com", origin: "https://example.com" });
    expect(isAuthorized(req as never)).toBe(true);
  });

  it("rejects all when CRON_SECRET is not configured and Origin does not match", () => {
    delete process.env.CRON_SECRET;
    const req = fakeRequest({ host: "example.com", origin: "https://evil.com" });
    expect(isAuthorized(req as never)).toBe(false);
  });
});
