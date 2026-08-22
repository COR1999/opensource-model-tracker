import { NextRequest } from "next/server";

// These endpoints spend the server's NVIDIA_API_KEY, so they must not be
// unconditionally public. Authorization is granted to either:
//   1. Requests bearing the CRON_SECRET bearer token (Vercel Cron, ops scripts), or
//   2. Browser requests from our own UI (Origin/Referer matches the request Host).
// The origin check is not spoof-proof against a determined attacker with curl,
// but it blocks the trivial one-liner abuse; real protection is the CRON_SECRET
// path plus per-request batch limits in the handlers.
export function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`) {
    return true;
  }

  const host = req.headers.get("host");
  if (!host) return false;

  const source = req.headers.get("origin") || req.headers.get("referer");
  if (!source) return false;

  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
}
