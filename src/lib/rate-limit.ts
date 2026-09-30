/**
 * Rate-limit retry policy for free-tier probes.
 * One retry after a short wait — free gateways 429 under parallel Test All
 * far more often than they hard-fail.
 */
export const RATE_LIMIT_RETRY_DELAY_MS = 1500;
export const RATE_LIMIT_MAX_ATTEMPTS = 2;

export function shouldRetryRateLimit(attempt: number): boolean {
  return attempt < RATE_LIMIT_MAX_ATTEMPTS;
}

export function rateLimitRetryDelayMs(): number {
  return RATE_LIMIT_RETRY_DELAY_MS;
}
